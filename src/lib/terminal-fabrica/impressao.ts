import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

/*
 * Impressão do desenho na Consulta 2D / 3D.
 *
 * O visualizador do terminal nasceu sem imprimir nem baixar de
 * propósito (ver PdfViewerKiosk.tsx): é um kiosk de chão de fábrica, e
 * desenho técnico em papel solto é justamente o que se quer evitar.
 * Imprimir passa a ser uma liberação caso a caso, por usuário.
 *
 * Administrador imprime sem precisar de linha, como em todo o resto do
 * portal (requireModuloAccess e atendente de chamados fazem igual) --
 * ao contrário de portal_aprovacoes_atendentes, que nega até para
 * admin porque ali o dado em si é sensível. Aqui o que se controla é
 * uma ação, não o acesso ao conteúdo: quem abre a tela já vê o desenho.
 */

export interface PermissaoImpressaoTerminal {
  usuarioId: string;
  usuarioNome: string;
  concedidoEm: string;
  concedidoPor: string | null;
}

const colunasPermissao = `
  CONVERT(VARCHAR(36), p.[usuario_id]) AS [usuarioId],
  u.[nome_exibicao] AS [usuarioNome],
  CONVERT(VARCHAR(33), p.[concedido_em], 126) AS [concedidoEm],
  p.[concedido_por] AS [concedidoPor]
`;

/*
 * A pergunta que a tela faz. Admin passa direto; os demais precisam da
 * linha. Sem usuário (visitante anônimo do terminal) nunca imprime --
 * a permissão é por pessoa, e no kiosk compartilhado não há pessoa.
 */
export async function podeImprimirDesenho(usuarioId: string | null): Promise<boolean> {
  if (!usuarioId) return false;

  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ permitido: boolean }>(`
      SELECT CAST(
        CASE
          WHEN EXISTS (
            SELECT 1 FROM dbo.portal_usuarios
            WHERE [id] = @usuarioId AND [ativo] = 1 AND [eh_administrador] = 1
          ) THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM dbo.portal_terminal_fabrica_impressao_permissoes AS p
            INNER JOIN dbo.portal_usuarios AS u ON u.[id] = p.[usuario_id]
            WHERE p.[usuario_id] = @usuarioId AND u.[ativo] = 1
          ) THEN 1
          ELSE 0
        END
        AS BIT
      ) AS [permitido];
    `);

  return result.recordset[0]?.permitido ?? false;
}

export async function listarPermissoesImpressao(): Promise<PermissaoImpressaoTerminal[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<PermissaoImpressaoTerminal>(`
    SELECT ${colunasPermissao}
    FROM dbo.portal_terminal_fabrica_impressao_permissoes AS p
    INNER JOIN dbo.portal_usuarios AS u ON u.[id] = p.[usuario_id]
    ORDER BY u.[nome_exibicao];
  `);

  return result.recordset;
}

export async function concederImpressao(params: {
  usuarioId: string;
  concedidoPor: string | null;
}): Promise<PermissaoImpressaoTerminal> {
  const pool = await getSqlServerPool();

  try {
    await pool
      .request()
      .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
      .input("concedidoPor", sql.NVarChar(200), params.concedidoPor)
      .query(`
        INSERT INTO dbo.portal_terminal_fabrica_impressao_permissoes
          ([usuario_id], [concedido_por])
        VALUES (@usuarioId, @concedidoPor);
      `);
  } catch (error) {
    if (error instanceof Error && /PK_portal_tf_impressao_permissoes/i.test(error.message)) {
      throw new ValidationError("Este usuário já pode imprimir.");
    }

    if (error instanceof Error && /FK_portal_tf_impressao_permissoes_usuario/i.test(error.message)) {
      throw new ValidationError("Usuário informado não existe.");
    }

    throw error;
  }

  const detalhe = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
    .query<PermissaoImpressaoTerminal>(`
      SELECT ${colunasPermissao}
      FROM dbo.portal_terminal_fabrica_impressao_permissoes AS p
      INNER JOIN dbo.portal_usuarios AS u ON u.[id] = p.[usuario_id]
      WHERE p.[usuario_id] = @usuarioId;
    `);

  return detalhe.recordset[0];
}

export async function revogarImpressao(usuarioId: string): Promise<void> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query(`
      DELETE FROM dbo.portal_terminal_fabrica_impressao_permissoes
      WHERE [usuario_id] = @usuarioId;
    `);

  if (!result.rowsAffected[0]) {
    throw new ValidationError("Este usuário já não tinha a permissão de impressão.");
  }
}

export interface ImpressaoTerminal {
  id: string;
  usuarioNome: string;
  codigoItem: string;
  totalPaginas: number | null;
  impressoEm: string;
  ipOrigem: string | null;
}

/*
 * Chamado pela rota pública do terminal no momento em que o usuário
 * manda imprimir. É o registro de que o papel saiu -- quem pediu, de
 * qual item e quando.
 */
export async function registrarImpressaoDesenho(params: {
  usuarioId: string;
  codigoItem: string;
  totalPaginas: number | null;
  ipOrigem: string | null;
}): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
    .input("codigoItem", sql.NVarChar(60), params.codigoItem)
    .input("totalPaginas", sql.Int, params.totalPaginas)
    .input("ipOrigem", sql.VarChar(64), params.ipOrigem)
    .query(`
      INSERT INTO dbo.portal_terminal_fabrica_impressoes
        ([usuario_id], [codigo_item], [total_paginas], [ip_origem])
      VALUES (@usuarioId, @codigoItem, @totalPaginas, @ipOrigem);
    `);
}

export async function listarImpressoes(params: {
  pagina: number;
  porPagina: number;
}): Promise<{ itens: ImpressaoTerminal[]; total: number }> {
  const pool = await getSqlServerPool();
  const offset = (params.pagina - 1) * params.porPagina;

  const [resultItens, resultTotal] = await Promise.all([
    pool
      .request()
      .input("offset", sql.Int, offset)
      .input("porPagina", sql.Int, params.porPagina)
      .query<ImpressaoTerminal>(`
        SELECT
          CONVERT(VARCHAR(36), i.[id]) AS [id],
          u.[nome_exibicao] AS [usuarioNome],
          i.[codigo_item] AS [codigoItem],
          i.[total_paginas] AS [totalPaginas],
          CONVERT(VARCHAR(33), i.[impresso_em], 126) AS [impressoEm],
          i.[ip_origem] AS [ipOrigem]
        FROM dbo.portal_terminal_fabrica_impressoes AS i
        INNER JOIN dbo.portal_usuarios AS u ON u.[id] = i.[usuario_id]
        ORDER BY i.[impresso_em] DESC
        OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
      `),
    pool
      .request()
      .query<{ total: number }>(
        `SELECT COUNT(*) AS [total] FROM dbo.portal_terminal_fabrica_impressoes;`
      ),
  ]);

  return {
    itens: resultItens.recordset,
    total: resultTotal.recordset[0]?.total ?? 0,
  };
}

export interface ResumoImpressoesTerminal {
  totalImpressoes: number;
  impressoesHoje: number;
  usuariosLiberados: number;
}

export async function getResumoImpressoes(): Promise<ResumoImpressoesTerminal> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    total_impressoes: number;
    impressoes_hoje: number;
    usuarios_liberados: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM dbo.portal_terminal_fabrica_impressoes) AS [total_impressoes],
      (SELECT COUNT(*) FROM dbo.portal_terminal_fabrica_impressoes
        WHERE CAST([impresso_em] AS DATE) = CAST(SYSDATETIME() AS DATE)) AS [impressoes_hoje],
      (SELECT COUNT(*) FROM dbo.portal_terminal_fabrica_impressao_permissoes) AS [usuarios_liberados];
  `);

  const row = result.recordset[0];

  return {
    totalImpressoes: row?.total_impressoes ?? 0,
    impressoesHoje: row?.impressoes_hoje ?? 0,
    usuariosLiberados: row?.usuarios_liberados ?? 0,
  };
}
