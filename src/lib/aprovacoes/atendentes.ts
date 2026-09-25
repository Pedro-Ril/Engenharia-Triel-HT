import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

import type { TipoAprovacao } from "./tipos-aprovacao";

/*
 * Quem decide o que no painel de aprovações: uma linha = "este usuário
 * aprova este tipo de solicitação". É a resposta sim/não da tela de
 * Aprovadores -- sem linha, não aprova.
 *
 * Diferença deliberada em relação a chamados: administrador NÃO atende
 * tudo por padrão aqui. Reajuste salarial é dado sensível, então a fila
 * só aparece pra quem foi cadastrado explicitamente -- mesma decisão de
 * "nega por padrão" já tomada no escopo de colaboradores.
 */

export interface AprovacaoAtendente {
  id: string;
  usuarioId: string;
  usuarioNome: string;
  tipo: TipoAprovacao;
}

const colunasAtendente = `
  CONVERT(VARCHAR(36), a.[id]) AS [id],
  CONVERT(VARCHAR(36), a.[usuario_id]) AS [usuarioId],
  u.[nome_exibicao] AS [usuarioNome],
  a.[tipo]
`;

export async function listarAtendentesAprovacoes(): Promise<AprovacaoAtendente[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<AprovacaoAtendente>(`
    SELECT ${colunasAtendente}
    FROM dbo.portal_aprovacoes_atendentes AS a
    INNER JOIN dbo.portal_usuarios AS u ON u.[id] = a.[usuario_id]
    ORDER BY u.[nome_exibicao], a.[tipo];
  `);

  return result.recordset;
}

export async function concederAtendenteAprovacao(params: {
  usuarioId: string;
  tipo: TipoAprovacao;
}): Promise<AprovacaoAtendente> {
  const pool = await getSqlServerPool();

  try {
    const result = await pool
      .request()
      .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
      .input("tipo", sql.VarChar(40), params.tipo)
      .query<{ id: string }>(`
        INSERT INTO dbo.portal_aprovacoes_atendentes ([usuario_id], [tipo])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        VALUES (@usuarioId, @tipo);
      `);

    const detalhe = await pool
      .request()
      .input("id", sql.UniqueIdentifier, result.recordset[0].id)
      .query<AprovacaoAtendente>(`
        SELECT ${colunasAtendente}
        FROM dbo.portal_aprovacoes_atendentes AS a
        INNER JOIN dbo.portal_usuarios AS u ON u.[id] = a.[usuario_id]
        WHERE a.[id] = @id;
      `);

    return detalhe.recordset[0];
  } catch (error) {
    if (error instanceof Error && /UQ_portal_aprovacoes_atendentes/i.test(error.message)) {
      throw new ValidationError("Este usuário já aprova este tipo de solicitação.");
    }

    if (error instanceof Error && /FK_portal_aprovacoes_atendentes/i.test(error.message)) {
      throw new ValidationError("Usuário informado não existe.");
    }

    throw error;
  }
}

/* Remove pelo par usuário+tipo -- é assim que a tela pensa ("marcar Não"), sem precisar carregar o id da linha. */
export async function revogarAtendenteAprovacao(
  usuarioId: string,
  tipo: TipoAprovacao
): Promise<boolean> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("tipo", sql.VarChar(40), tipo)
    .query(`DELETE FROM dbo.portal_aprovacoes_atendentes WHERE [usuario_id] = @usuarioId AND [tipo] = @tipo;`);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/*
 * Tipos de aprovação que este usuário pode ver e decidir. Lista vazia =
 * não vê nenhuma pendência (nem administrador), e é isso que o painel
 * usa pra filtrar a fila.
 */
export async function listarTiposQueAtende(usuarioId: string): Promise<TipoAprovacao[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ tipo: TipoAprovacao }>(`
      SELECT DISTINCT [tipo]
      FROM dbo.portal_aprovacoes_atendentes
      WHERE [usuario_id] = @usuarioId;
    `);

  return result.recordset.map((row) => row.tipo);
}

/*
 * Destinatários do aviso de solicitação nova: os aprovadores
 * cadastrados naquele tipo, com e-mail. Administrador não cadastrado
 * não recebe -- senão todo administrador do portal passaria a receber
 * aviso de reajuste salarial.
 */
export async function listarEmailsAtendentes(
  tipo: TipoAprovacao
): Promise<{ email: string; nomeExibicao: string }[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("tipo", sql.VarChar(40), tipo)
    .query<{ email: string; nome_exibicao: string }>(`
      SELECT DISTINCT u.[email], u.[nome_exibicao]
      FROM dbo.portal_aprovacoes_atendentes AS a
      INNER JOIN dbo.portal_usuarios AS u ON u.[id] = a.[usuario_id]
      WHERE a.[tipo] = @tipo
        AND u.[ativo] = 1
        AND u.[email] IS NOT NULL
        AND u.[email] <> '';
    `);

  return result.recordset.map((row) => ({ email: row.email, nomeExibicao: row.nome_exibicao }));
}
