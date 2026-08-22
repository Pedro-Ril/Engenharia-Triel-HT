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
