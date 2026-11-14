import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { derrubarConexoesAoVivo } from "./colaboracao";

/*
 * Compartilhamento de páginas do Bloco de Notas (migração 0167).
 *
 * Regra: o DONO abre uma página para outra pessoa com 'ver' ou 'editar';
 * vale para a página e todas as subpáginas (herança pelo pai_id). Página
 * na lixeira não é acessível por ninguém além do dono (pela lixeira).
 * Só o dono compartilha, move, exclui, favorita e muda permissão.
 */

export type PermissaoPagina = "dono" | "editar" | "ver";

export interface AcessoPagina {
  permissao: PermissaoPagina;
  donoId: string;
  donoNome: string;
  /* A página (ou alguma acima dela) está aberta para outra pessoa -> edição ao vivo. */
  compartilhada: boolean;
}

/* Ancestrais da página (ela inclusa), só páginas ativas. Espera @id. */
const CTE_ANCESTRAIS = `
  WITH ancestrais AS (
    SELECT p.[id], p.[pai_id] FROM dbo.portal_notas_paginas AS p
    WHERE p.[id] = @id AND p.[excluida_em] IS NULL
    UNION ALL
    SELECT pai.[id], pai.[pai_id] FROM dbo.portal_notas_paginas AS pai
    INNER JOIN ancestrais AS a ON pai.[id] = a.[pai_id]
    WHERE pai.[excluida_em] IS NULL
  )
`;

/* null = a pessoa não tem acesso (ou a página não existe / está na lixeira). */
export async function acessoPagina(usuarioId: string, paginaId: string): Promise<AcessoPagina | null> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("id", sql.UniqueIdentifier, paginaId)
    .query<{ dono_id: string; dono_nome: string; nivel: number | null; total: number }>(`
      ${CTE_ANCESTRAIS}
      SELECT
        CONVERT(VARCHAR(36), pg.[usuario_id]) AS [dono_id],
        u.[nome_exibicao] AS [dono_nome],
        (SELECT MAX(CASE c.[permissao] WHEN 'editar' THEN 2 ELSE 1 END)
          FROM dbo.portal_notas_compartilhamentos AS c
          INNER JOIN dbo.portal_usuarios AS cu ON cu.[id] = c.[usuario_id] AND cu.[ativo] = 1
          WHERE c.[pagina_id] IN (SELECT [id] FROM ancestrais) AND c.[usuario_id] = @usuarioId) AS [nivel],
        (SELECT COUNT(*)
          FROM dbo.portal_notas_compartilhamentos AS c
          INNER JOIN dbo.portal_usuarios AS cu ON cu.[id] = c.[usuario_id] AND cu.[ativo] = 1
          WHERE c.[pagina_id] IN (SELECT [id] FROM ancestrais)) AS [total]
      FROM dbo.portal_notas_paginas AS pg
      INNER JOIN dbo.portal_usuarios AS u ON u.[id] = pg.[usuario_id]
      WHERE pg.[id] = @id AND pg.[excluida_em] IS NULL;
    `);

  const row = result.recordset[0];
  if (!row) return null;

  const ehDono = row.dono_id.toLowerCase() === usuarioId.toLowerCase();
  const permissao: PermissaoPagina | null = ehDono ? "dono" : row.nivel === 2 ? "editar" : row.nivel === 1 ? "ver" : null;
  if (!permissao) return null;

  return { permissao, donoId: row.dono_id, donoNome: row.dono_nome, compartilhada: row.total > 0 };
}

export interface Compartilhamento {
  usuarioId: string;
  nome: string;
  email: string | null;
  permissao: "ver" | "editar";
}

async function garantirDono(usuarioId: string, paginaId: string): Promise<void> {
  const acesso = await acessoPagina(usuarioId, paginaId);
  if (acesso?.permissao !== "dono") {
    throw new ValidationError("Só quem criou a página pode mudar o compartilhamento dela.");
  }
}

export async function listarCompartilhamentos(donoId: string, paginaId: string): Promise<Compartilhamento[]> {
  await garantirDono(donoId, paginaId);

  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("paginaId", sql.UniqueIdentifier, paginaId)
    .query<{ usuario_id: string; nome: string; email: string | null; permissao: "ver" | "editar" }>(`
      SELECT CONVERT(VARCHAR(36), u.[id]) AS [usuario_id], u.[nome_exibicao] AS [nome], u.[email], c.[permissao]
      FROM dbo.portal_notas_compartilhamentos AS c
      INNER JOIN dbo.portal_usuarios AS u ON u.[id] = c.[usuario_id] AND u.[ativo] = 1
      WHERE c.[pagina_id] = @paginaId
      ORDER BY u.[nome_exibicao];
    `);

  return result.recordset.map((row) => ({
    usuarioId: row.usuario_id,
    nome: row.nome,
    email: row.email,
    permissao: row.permissao,
  }));
}

/* Inclui ou muda a permissão de uma pessoa (upsert). */
export async function compartilharPagina(
  donoId: string,
  paginaId: string,
  usuarioAlvoId: string,
  permissao: "ver" | "editar"
): Promise<void> {
  await garantirDono(donoId, paginaId);

  if (usuarioAlvoId.toLowerCase() === donoId.toLowerCase()) {
    throw new ValidationError("A página já é sua.");
  }

  const pool = await getSqlServerPool();
  const alvo = await pool
    .request()
    .input("alvo", sql.UniqueIdentifier, usuarioAlvoId)
    .query<{ total: number }>(`SELECT COUNT(*) AS [total] FROM dbo.portal_usuarios WHERE [id] = @alvo AND [ativo] = 1;`);
  if (!alvo.recordset[0]?.total) throw new ValidationError("Pessoa não encontrada.");

  const result = await pool
    .request()
    .input("paginaId", sql.UniqueIdentifier, paginaId)
    .input("alvo", sql.UniqueIdentifier, usuarioAlvoId)
    .input("permissao", sql.VarChar(10), permissao)
    .input("donoId", sql.UniqueIdentifier, donoId)
    .query<{ anterior: string | null }>(`
      DECLARE @anterior VARCHAR(10) = (
        SELECT [permissao] FROM dbo.portal_notas_compartilhamentos
        WHERE [pagina_id] = @paginaId AND [usuario_id] = @alvo
      );

      UPDATE dbo.portal_notas_compartilhamentos SET [permissao] = @permissao
      WHERE [pagina_id] = @paginaId AND [usuario_id] = @alvo;

      IF @@ROWCOUNT = 0
        INSERT INTO dbo.portal_notas_compartilhamentos ([pagina_id], [usuario_id], [permissao], [compartilhado_por])
        VALUES (@paginaId, @alvo, @permissao, @donoId);

      SELECT @anterior AS [anterior];
    `);

  /* Passou de editar para só ver: quem está ao vivo reconecta já sem poder escrever. */
  if (result.recordset[0]?.anterior === "editar" && permissao === "ver") {
    revalidarAoVivo(donoId, paginaId);
  }
}

export async function removerCompartilhamento(donoId: string, paginaId: string, usuarioAlvoId: string): Promise<void> {
  await garantirDono(donoId, paginaId);

  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("paginaId", sql.UniqueIdentifier, paginaId)
    .input("alvo", sql.UniqueIdentifier, usuarioAlvoId)
    .query(`DELETE FROM dbo.portal_notas_compartilhamentos WHERE [pagina_id] = @paginaId AND [usuario_id] = @alvo;`);

  revalidarAoVivo(donoId, paginaId);
}

export interface PaginaCompartilhadaComigo {
  id: string;
  paiId: string | null;
  titulo: string;
  ordem: number;
  atualizadoEm: string;
  donoNome: string;
  permissao: "ver" | "editar";
}

/*
 * O que outras pessoas abriram para mim: as páginas compartilhadas
 * diretamente + todas as subpáginas ativas delas (para navegar). A
 * permissão de cada uma é a maior que vier de cima.
 */
export async function listarCompartilhadasComigo(usuarioId: string): Promise<PaginaCompartilhadaComigo[]> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{
      id: string;
      pai_id: string | null;
      titulo: string;
      ordem: number;
      atualizado_em: string;
      dono_nome: string;
      nivel: number;
      eh_raiz: number;
    }>(`
      WITH arvore AS (
        SELECT p.[id], p.[pai_id], CASE c.[permissao] WHEN 'editar' THEN 2 ELSE 1 END AS [nivel], 1 AS [eh_raiz]
        FROM dbo.portal_notas_compartilhamentos AS c
        INNER JOIN dbo.portal_notas_paginas AS p ON p.[id] = c.[pagina_id]
        WHERE c.[usuario_id] = @usuarioId AND p.[excluida_em] IS NULL AND p.[usuario_id] <> @usuarioId
        UNION ALL
        SELECT f.[id], f.[pai_id], a.[nivel], 0
        FROM dbo.portal_notas_paginas AS f
        INNER JOIN arvore AS a ON f.[pai_id] = a.[id]
        WHERE f.[excluida_em] IS NULL
      ),
      consolidado AS (
        SELECT [id], MAX([nivel]) AS [nivel], MAX([eh_raiz]) AS [eh_raiz] FROM arvore GROUP BY [id]
      )
      SELECT
        CONVERT(VARCHAR(36), p.[id]) AS [id],
        CASE WHEN k.[eh_raiz] = 1 AND NOT EXISTS (SELECT 1 FROM consolidado AS pai WHERE pai.[id] = p.[pai_id])
          THEN NULL ELSE CONVERT(VARCHAR(36), p.[pai_id]) END AS [pai_id],
        p.[titulo],
        p.[ordem],
        CONVERT(VARCHAR(33), p.[atualizado_em], 126) AS [atualizado_em],
        u.[nome_exibicao] AS [dono_nome],
        k.[nivel],
        k.[eh_raiz]
      FROM consolidado AS k
      INNER JOIN dbo.portal_notas_paginas AS p ON p.[id] = k.[id]
      INNER JOIN dbo.portal_usuarios AS u ON u.[id] = p.[usuario_id]
      ORDER BY u.[nome_exibicao], p.[ordem];
    `);

  return result.recordset.map((row) => ({
    id: row.id,
    paiId: row.pai_id,
    titulo: row.titulo,
    ordem: row.ordem,
    atualizadoEm: row.atualizado_em,
    donoNome: row.dono_nome,
    permissao: row.nivel === 2 ? "editar" : "ver",
  }));
}

export interface PessoaParaCompartilhar {
  id: string;
  nome: string;
  email: string | null;
  departamento: string | null;
}

/* Busca de pessoas ativas do portal para o seletor "Compartilhar com". */
export async function buscarPessoasParaCompartilhar(usuarioId: string, termo: string): Promise<PessoaParaCompartilhar[]> {
  const limpo = termo.trim().slice(0, 80);
  if (limpo.length < 2) return [];

  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("padrao", sql.NVarChar(90), `%${limpo.replace(/[[\]%_]/g, (c) => `[${c}]`)}%`)
    .query<{ id: string; nome: string; email: string | null; departamento: string | null }>(`
      SELECT TOP 10
        CONVERT(VARCHAR(36), [id]) AS [id], [nome_exibicao] AS [nome], [email], [departamento]
      FROM dbo.portal_usuarios
      WHERE [ativo] = 1 AND [id] <> @usuarioId
        AND ([nome_exibicao] LIKE @padrao OR [email] LIKE @padrao OR [sam_account_name] LIKE @padrao)
      ORDER BY [nome_exibicao];
    `);

  return result.recordset;
}

/*
 * Mudou quem pode o quê nesta página (e nas subpáginas): derruba as
 * conexões ao vivo delas para todo mundo reconectar com a regra nova.
 * Não espera nem falha -- é só um aviso ao serviço de colaboração.
 */
export function revalidarAoVivo(donoId: string, paginaId: string): void {
  void (async () => {
    try {
      const pool = await getSqlServerPool();
      const result = await pool
        .request()
        .input("donoId", sql.UniqueIdentifier, donoId)
        .input("id", sql.UniqueIdentifier, paginaId)
        .query<{ id: string }>(`
          WITH subarvore AS (
            SELECT p.[id] FROM dbo.portal_notas_paginas AS p
            WHERE p.[id] = @id AND p.[usuario_id] = @donoId
            UNION ALL
            SELECT f.[id] FROM dbo.portal_notas_paginas AS f
            INNER JOIN subarvore AS s ON f.[pai_id] = s.[id]
            WHERE f.[usuario_id] = @donoId
          )
          SELECT CONVERT(VARCHAR(36), [id]) AS [id] FROM subarvore;
        `);
      await derrubarConexoesAoVivo(result.recordset.map((row) => row.id));
    } catch (error) {
      console.error("Não foi possível revalidar a edição ao vivo da página:", error);
    }
  })();
}
