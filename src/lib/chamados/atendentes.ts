import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

/*
 * CRUD admin-only das atribuições usuário↔setor que definem
 * quem atende chamados de qual setor (ver
 * src/lib/chamados/autorizacao-chamados.ts). Espelha o mesmo
 * padrão de concederPermissao/revogarPermissao de
 * src/lib/auth/admin.ts, só que para setor em vez de módulo.
 */

export interface ChamadosAtendente {
  id: string;
  usuarioId: string;
  usuarioNome: string;
  setorId: string;
  setorNome: string;
}

export async function listarAtendentes(): Promise<ChamadosAtendente[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ChamadosAtendente>(`
    SELECT
      CONVERT(VARCHAR(36), a.[id]) AS [id],
      CONVERT(VARCHAR(36), a.[usuario_id]) AS [usuarioId],
      u.[nome_exibicao] AS [usuarioNome],
      CONVERT(VARCHAR(36), a.[setor_id]) AS [setorId],
      s.[nome] AS [setorNome]
    FROM dbo.portal_chamados_atendentes AS a
    INNER JOIN dbo.portal_usuarios AS u ON u.[id] = a.[usuario_id]
    INNER JOIN dbo.portal_setores AS s ON s.[id] = a.[setor_id]
    ORDER BY u.[nome_exibicao], s.[nome];
  `);

  return result.recordset;
}

/*
 * Quem pode efetivamente ser escolhido como "atendente
 * responsável" de um chamado deste setor: quem está cadastrado em
 * portal_chamados_atendentes para ele, OU qualquer administrador
 * (que atende todo setor sem precisar de cadastro — ver
 * getSetoresQueAtende em autorizacao-chamados.ts). Sem essa união,
 * um chamado aceito por um administrador não cadastrado mostra o
 * Dropdown de "Atendente responsável" em branco, porque o valor
 * selecionado (o id do admin) não bate com nenhuma opção da lista.
 */
export async function listarAtendentesDisponiveisParaSetor(
  setorId: string
): Promise<ChamadosAtendente[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("setorId", sql.UniqueIdentifier, setorId);

  const result = await request.query<ChamadosAtendente>(`
    SELECT
      CONVERT(VARCHAR(36), u.[id]) AS [id],
      CONVERT(VARCHAR(36), u.[id]) AS [usuarioId],
      u.[nome_exibicao] AS [usuarioNome],
      @setorId AS [setorId],
      s.[nome] AS [setorNome]
    FROM dbo.portal_usuarios AS u
    INNER JOIN dbo.portal_setores AS s ON s.[id] = @setorId
    WHERE u.[ativo] = 1
      AND (
        u.[eh_administrador] = 1
        OR EXISTS (
          SELECT 1 FROM dbo.portal_chamados_atendentes AS a
          WHERE a.[usuario_id] = u.[id] AND a.[setor_id] = @setorId
        )
      )
    ORDER BY u.[nome_exibicao];
  `);

  return result.recordset;
}

export interface AtendenteNotificavel {
  usuarioId: string;
  nome: string;
  email: string;
}

/*
 * Quem avisar quando um chamado NOVO cai num setor.
 *
 * Diferente de listarAtendentesDisponiveisParaSetor, que inclui todo
 * administrador (eles atendem qualquer setor): avisar todo admin de
 * todo chamado seria spam. Aqui valem os cadastrados em
 * portal_chamados_atendentes para o setor.
 *
 * A exceção é o setor que ainda não tem ninguém cadastrado -- hoje a
 * tabela está vazia e quem atende de fato são os administradores. Sem
 * essa reserva, o chamado nasceria sem avisar ninguém, que é
 * exatamente o buraco que esta notificação veio tapar.
 */
export async function listarAtendentesParaNotificacao(
  setorId: string
): Promise<AtendenteNotificavel[]> {
  const pool = await getSqlServerPool();

  const cadastrados = await pool
    .request()
    .input("setorId", sql.UniqueIdentifier, setorId)
    .query<AtendenteNotificavel>(`
      SELECT
        CONVERT(VARCHAR(36), u.[id]) AS [usuarioId],
        u.[nome_exibicao] AS [nome],
        u.[email] AS [email]
      FROM dbo.portal_chamados_atendentes AS a
      INNER JOIN dbo.portal_usuarios AS u ON u.[id] = a.[usuario_id]
      WHERE a.[setor_id] = @setorId
        AND u.[ativo] = 1
        AND u.[email] IS NOT NULL
        AND LTRIM(RTRIM(u.[email])) <> ''
      ORDER BY u.[nome_exibicao];
    `);

  if (cadastrados.recordset.length > 0) return cadastrados.recordset;

  const administradores = await pool.request().query<AtendenteNotificavel>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [usuarioId],
      [nome_exibicao] AS [nome],
      [email] AS [email]
    FROM dbo.portal_usuarios
    WHERE [eh_administrador] = 1
      AND [ativo] = 1
      AND [email] IS NOT NULL
      AND LTRIM(RTRIM([email])) <> ''
    ORDER BY [nome_exibicao];
  `);

  return administradores.recordset;
}

export async function concederAtendente(params: {
  usuarioId: string;
  setorId: string;
}): Promise<ChamadosAtendente> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, params.usuarioId);
  request.input("setorId", sql.UniqueIdentifier, params.setorId);

  try {
    const result = await request.query<{ id: string }>(`
      INSERT INTO dbo.portal_chamados_atendentes ([usuario_id], [setor_id])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@usuarioId, @setorId);
    `);

    const criadoId = result.recordset[0].id;

    const detalheRequest = pool.request();
    detalheRequest.input("id", sql.UniqueIdentifier, criadoId);

    const detalheResult = await detalheRequest.query<ChamadosAtendente>(`
      SELECT
        CONVERT(VARCHAR(36), a.[id]) AS [id],
        CONVERT(VARCHAR(36), a.[usuario_id]) AS [usuarioId],
        u.[nome_exibicao] AS [usuarioNome],
        CONVERT(VARCHAR(36), a.[setor_id]) AS [setorId],
        s.[nome] AS [setorNome]
      FROM dbo.portal_chamados_atendentes AS a
      INNER JOIN dbo.portal_usuarios AS u ON u.[id] = a.[usuario_id]
      INNER JOIN dbo.portal_setores AS s ON s.[id] = a.[setor_id]
      WHERE a.[id] = @id;
    `);

    return detalheResult.recordset[0];
  } catch (error) {
    if (
      error instanceof Error &&
      /UQ_portal_chamados_atendentes_usuario_setor/i.test(error.message)
    ) {
      throw new ValidationError("Este usuário já atende este setor.");
    }

    if (error instanceof Error && /FK_portal_chamados_atendentes/i.test(error.message)) {
      throw new ValidationError("Usuário ou setor informado não existe.");
    }

    throw error;
  }
}

export async function revogarAtendente(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    DELETE FROM dbo.portal_chamados_atendentes
    WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/*
 * Quais setores (ativos) já aceitam chamados hoje — usado na
 * tela Administração → Chamados para o admin habilitar/
 * desabilitar cada um (ver listarSetoresParaChamado em
 * src/lib/chamados/chamados.ts, que só devolve os habilitados).
 */
export interface SetorAceiteChamados {
  id: string;
  nome: string;
  aceitaChamados: boolean;
}

export async function listarSetoresComAceiteChamados(): Promise<SetorAceiteChamados[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    id: string;
    nome: string;
    aceita_chamados: boolean;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [nome],
      CAST([aceita_chamados] AS BIT) AS [aceita_chamados]
    FROM dbo.portal_setores
    WHERE [ativo] = 1
    ORDER BY [nome];
  `);

  return result.recordset.map((row) => ({
    id: row.id,
    nome: row.nome,
    aceitaChamados: row.aceita_chamados,
  }));
}

export async function atualizarAceiteChamadosSetor(
  setorId: string,
  aceitaChamados: boolean
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("setorId", sql.UniqueIdentifier, setorId);
  request.input("aceitaChamados", sql.Bit, aceitaChamados);

  const result = await request.query(`
    UPDATE dbo.portal_setores
    SET [aceita_chamados] = @aceitaChamados
    WHERE [id] = @setorId;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}
