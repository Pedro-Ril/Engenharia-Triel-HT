import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { acessoPagina, revalidarAoVivo } from "./compartilhamento";
import type { PermissaoPagina } from "./compartilhamento";
import { LIMITE_HTML_PAGINA, limparConteudoPagina, textoBuscaDoConteudo } from "./conteudo-html";

/*
 * Bloco de Notas -- caderno pessoal (ver db/schema/0166_bloco_notas.sql).
 *
 * REGRA DE OURO: toda função recebe o usuarioId de quem está logado e
 * TODA consulta filtra por ele. Página de outra pessoa se comporta como
 * "não existe" (nem admin enxerga o caderno alheio).
 */

export const DIAS_NA_LIXEIRA = 30;
export const TAMANHO_TITULO = 200;

export interface PaginaResumo {
  id: string;
  paiId: string | null;
  titulo: string;
  favorita: boolean;
  ordem: number;
  atualizadoEm: string;
  /* Aberta diretamente para alguém (ícone na árvore do dono). */
  compartilhada: boolean;
}

export interface Pagina extends PaginaResumo {
  conteudo: string;
  versao: number;
  criadoEm: string;
  /* De quem abriu: dono, ou o que o compartilhamento dá (editar/ver). */
  permissao: PermissaoPagina;
  donoNome: string;
  /* Aberta para alguém (ela ou uma página acima) -> edição ao vivo. */
  compartilhada: boolean;
}

export interface PaginaLixeira {
  id: string;
  titulo: string;
  excluidaEm: string;
  /* Quantas subpáginas saíram junto (restauram juntas). */
  subpaginas: number;
}

export interface ResultadoBusca {
  id: string;
  titulo: string;
  trecho: string | null;
}

/* Outra aba/janela salvou a página depois de você abrir: não sobrescreve às cegas. */
export class ConflitoVersaoError extends Error {
  constructor(public versaoAtual: number) {
    super("Esta página foi alterada em outra aba ou janela.");
    this.name = "ConflitoVersaoError";
  }
}

const colunasResumo = `
  CONVERT(VARCHAR(36), p.[id]) AS [id],
  CONVERT(VARCHAR(36), p.[pai_id]) AS [pai_id],
  p.[titulo],
  CAST(p.[favorita] AS BIT) AS [favorita],
  p.[ordem],
  CONVERT(VARCHAR(33), p.[atualizado_em], 126) AS [atualizado_em],
  CAST(CASE WHEN EXISTS (
    SELECT 1 FROM dbo.portal_notas_compartilhamentos AS c WHERE c.[pagina_id] = p.[id]
  ) THEN 1 ELSE 0 END AS BIT) AS [compartilhada]
`;

interface ResumoRow {
  id: string;
  pai_id: string | null;
  titulo: string;
  favorita: boolean;
  ordem: number;
  atualizado_em: string;
  compartilhada?: boolean;
}

function mapResumo(row: ResumoRow): PaginaResumo {
  return {
    id: row.id,
    paiId: row.pai_id,
    titulo: row.titulo,
    favorita: row.favorita,
    ordem: row.ordem,
    atualizadoEm: row.atualizado_em,
    compartilhada: row.compartilhada ?? false,
  };
}

function normalizarTitulo(titulo: string): string {
  return titulo.replace(/\s+/g, " ").trim().slice(0, TAMANHO_TITULO);
}

/* Subárvore (a própria página + descendentes) de um usuário, em CTE recursiva. */
const CTE_SUBARVORE = `
  WITH subarvore AS (
    SELECT p.[id] FROM dbo.portal_notas_paginas AS p
    WHERE p.[id] = @id AND p.[usuario_id] = @usuarioId
    UNION ALL
    SELECT f.[id] FROM dbo.portal_notas_paginas AS f
    INNER JOIN subarvore AS s ON f.[pai_id] = s.[id]
    WHERE f.[usuario_id] = @usuarioId
  )
`;

export async function listarPaginas(usuarioId: string): Promise<{ paginas: PaginaResumo[]; naLixeira: number }> {
  await limparLixeiraVencida(usuarioId);

  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<ResumoRow & { na_lixeira?: number }>(`
      SELECT ${colunasResumo}
      FROM dbo.portal_notas_paginas AS p
      WHERE p.[usuario_id] = @usuarioId AND p.[excluida_em] IS NULL
      ORDER BY p.[ordem], p.[criado_em];

      SELECT COUNT(*) AS [na_lixeira]
      FROM dbo.portal_notas_paginas AS p
      WHERE p.[usuario_id] = @usuarioId AND p.[excluida_em] IS NOT NULL
        AND (p.[pai_id] IS NULL OR NOT EXISTS (
          SELECT 1 FROM dbo.portal_notas_paginas AS pai
          WHERE pai.[id] = p.[pai_id] AND pai.[excluida_em] = p.[excluida_em]
        ));
    `);

  const conjuntos = result.recordsets as unknown as [ResumoRow[], { na_lixeira: number }[]];
  return {
    paginas: conjuntos[0].map(mapResumo),
    naLixeira: conjuntos[1][0]?.na_lixeira ?? 0,
  };
}

/* Do dono ou de quem recebeu o compartilhamento (dele ou de uma página acima). */
export async function buscarPagina(usuarioId: string, id: string): Promise<Pagina | null> {
  const acesso = await acessoPagina(usuarioId, id);
  if (!acesso) return null;

  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<ResumoRow & { conteudo: string; versao: number; criado_em: string }>(`
      SELECT ${colunasResumo},
        p.[conteudo],
        p.[versao],
        CONVERT(VARCHAR(33), p.[criado_em], 126) AS [criado_em]
      FROM dbo.portal_notas_paginas AS p
      WHERE p.[id] = @id AND p.[excluida_em] IS NULL;
    `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    ...mapResumo(row),
    /* Favorita é do dono; para quem recebeu, não se aplica. */
    favorita: acesso.permissao === "dono" ? row.favorita : false,
    /* Limpa de novo ao ler: defesa extra se alguma linha foi gravada por fora da rota. */
    conteudo: limparConteudoPagina(row.conteudo),
    versao: row.versao,
    criadoEm: row.criado_em,
    permissao: acesso.permissao,
    donoNome: acesso.donoNome,
    compartilhada: acesso.compartilhada,
  };
}

/* Pai precisa ser do usuário e não estar na lixeira. */
async function garantirPaiValido(usuarioId: string, paiId: string): Promise<void> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("paiId", sql.UniqueIdentifier, paiId)
    .query<{ existe: number }>(`
      SELECT COUNT(*) AS [existe] FROM dbo.portal_notas_paginas
      WHERE [id] = @paiId AND [usuario_id] = @usuarioId AND [excluida_em] IS NULL;
    `);

  if (!result.recordset[0]?.existe) {
    throw new ValidationError("A página de destino não foi encontrada.");
  }
}

export async function criarPagina(
  usuarioId: string,
  params: { paiId: string | null; titulo?: string }
): Promise<PaginaResumo> {
  if (params.paiId) await garantirPaiValido(usuarioId, params.paiId);

  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("paiId", sql.UniqueIdentifier, params.paiId)
    .input("titulo", sql.NVarChar(TAMANHO_TITULO), normalizarTitulo(params.titulo ?? ""))
    .query<ResumoRow>(`
      DECLARE @ordem INT = (
        SELECT ISNULL(MAX([ordem]), -1) + 1 FROM dbo.portal_notas_paginas
        WHERE [usuario_id] = @usuarioId AND [excluida_em] IS NULL
          AND (([pai_id] IS NULL AND @paiId IS NULL) OR [pai_id] = @paiId)
      );

      INSERT INTO dbo.portal_notas_paginas ([usuario_id], [pai_id], [titulo], [ordem])
      OUTPUT
        CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
        CONVERT(VARCHAR(36), INSERTED.[pai_id]) AS [pai_id],
        INSERTED.[titulo],
        CAST(INSERTED.[favorita] AS BIT) AS [favorita],
        INSERTED.[ordem],
        CONVERT(VARCHAR(33), INSERTED.[atualizado_em], 126) AS [atualizado_em]
      VALUES (@usuarioId, @paiId, @titulo, @ordem);
    `);

  return mapResumo(result.recordset[0]);
}

/*
 * Grava título, conteúdo e/ou favorita. Conteúdo exige a versão que a tela
 * abriu (`versaoEsperada`): se outra aba salvou antes, lança
 * ConflitoVersaoError -- a não ser com `forcar` (a pessoa escolheu manter
 * a versão dela).
 *
 * `colaborativo`: a gravação vem da edição ao vivo (todos já estão com o
 * mesmo texto, sincronizado pelo serviço de colaboração) -- sem conferir
 * versão e sem mexer no estado ao vivo. Gravação comum de conteúdo zera o
 * estado ao vivo (a próxima sessão recomeça do HTML gravado).
 *
 * Quem recebeu com 'editar' muda título e conteúdo; 'ver' não muda nada;
 * favorita é só do dono.
 */
export async function atualizarPagina(
  usuarioId: string,
  id: string,
  params: {
    titulo?: string;
    conteudo?: string;
    favorita?: boolean;
    versaoEsperada?: number;
    forcar?: boolean;
    colaborativo?: boolean;
  }
): Promise<{ versao: number; atualizadoEm: string; titulo: string }> {
  const acesso = await acessoPagina(usuarioId, id);
  if (!acesso) throw new ValidationError("Página não encontrada.");
  if (acesso.permissao === "ver") throw new ValidationError("Você pode só ver esta página.");
  if (params.favorita !== undefined && acesso.permissao !== "dono") {
    throw new ValidationError("Só quem criou a página pode favoritá-la.");
  }

  const pool = await getSqlServerPool();
  const request = pool.request();
  const sets: string[] = [];

  /* A página é do dono: grava na linha dele, quem quer que esteja editando. */
  request.input("usuarioId", sql.UniqueIdentifier, acesso.donoId);
  request.input("id", sql.UniqueIdentifier, id);

  if (params.titulo !== undefined) {
    request.input("titulo", sql.NVarChar(TAMANHO_TITULO), normalizarTitulo(params.titulo));
    sets.push("[titulo] = @titulo");
  }

  if (params.favorita !== undefined) {
    request.input("favorita", sql.Bit, params.favorita);
    sets.push("[favorita] = @favorita");
  }

  let condicaoVersao = "";
  if (params.conteudo !== undefined) {
    if (params.conteudo.length > LIMITE_HTML_PAGINA) {
      throw new ValidationError("A página ficou grande demais. Divida o conteúdo em subpáginas.");
    }

    const limpo = limparConteudoPagina(params.conteudo);
    request.input("conteudo", sql.NVarChar(sql.MAX), limpo);
    request.input("textoBusca", sql.NVarChar(sql.MAX), textoBuscaDoConteudo(limpo));
    sets.push("[conteudo] = @conteudo", "[texto_busca] = @textoBusca", "[versao] = [versao] + 1");
    if (!params.colaborativo) sets.push("[estado_colaborativo] = NULL");

    if (!params.forcar && !params.colaborativo) {
      if (params.versaoEsperada === undefined) {
        throw new ValidationError("Informe a versão da página que está sendo editada.");
      }
      request.input("versaoEsperada", sql.Int, params.versaoEsperada);
      condicaoVersao = "AND [versao] = @versaoEsperada";
    }
  }

  if (sets.length === 0) {
    throw new ValidationError("Nada para atualizar.");
  }

  const result = await request.query<{ versao: number; atualizado_em: string; titulo: string }>(`
    UPDATE dbo.portal_notas_paginas
    SET ${sets.join(", ")}, [atualizado_em] = SYSDATETIME()
    OUTPUT INSERTED.[versao], CONVERT(VARCHAR(33), INSERTED.[atualizado_em], 126) AS [atualizado_em], INSERTED.[titulo]
    WHERE [id] = @id AND [usuario_id] = @usuarioId AND [excluida_em] IS NULL ${condicaoVersao};
  `);

  const row = result.recordset[0];
  if (row) {
    return { versao: row.versao, atualizadoEm: row.atualizado_em, titulo: row.titulo };
  }

  /* Nada atualizado: ou a página não é dele/não existe, ou a versão mudou. */
  const atual = await buscarPagina(usuarioId, id);
  if (!atual) throw new ValidationError("Página não encontrada.");
  throw new ConflitoVersaoError(atual.versao);
}

/* Muda o pai (ou leva para a raiz com null) -- vai para o fim da lista do novo lugar. */
export async function moverPagina(usuarioId: string, id: string, novoPaiId: string | null): Promise<void> {
  if (novoPaiId) {
    await garantirPaiValido(usuarioId, novoPaiId);

    /* Não pode ir para dentro de si mesma nem de uma descendente (viraria um ciclo). */
    const pool = await getSqlServerPool();
    const ciclo = await pool
      .request()
      .input("usuarioId", sql.UniqueIdentifier, usuarioId)
      .input("id", sql.UniqueIdentifier, id)
      .input("novoPaiId", sql.UniqueIdentifier, novoPaiId)
      .query<{ total: number }>(`
        ${CTE_SUBARVORE}
        SELECT COUNT(*) AS [total] FROM subarvore WHERE [id] = @novoPaiId;
      `);
    if (ciclo.recordset[0]?.total) {
      throw new ValidationError("Uma página não pode ir para dentro dela mesma ou de uma subpágina dela.");
    }
  }

  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("id", sql.UniqueIdentifier, id)
    .input("novoPaiId", sql.UniqueIdentifier, novoPaiId)
    .query(`
      DECLARE @ordem INT = (
        SELECT ISNULL(MAX([ordem]), -1) + 1 FROM dbo.portal_notas_paginas
        WHERE [usuario_id] = @usuarioId AND [excluida_em] IS NULL
          AND (([pai_id] IS NULL AND @novoPaiId IS NULL) OR [pai_id] = @novoPaiId)
      );

      UPDATE dbo.portal_notas_paginas
      SET [pai_id] = @novoPaiId, [ordem] = @ordem, [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id AND [usuario_id] = @usuarioId AND [excluida_em] IS NULL;
    `);

  if ((result.rowsAffected.at(-1) ?? 0) === 0) {
    throw new ValidationError("Página não encontrada.");
  }

  /* Saiu (ou entrou) de baixo de uma página compartilhada: o acesso dela mudou. */
  revalidarAoVivo(usuarioId, id);
}

/* Nova ordem das irmãs (arrastar na lista): só aceita páginas do usuário com esse mesmo pai. */
export async function reordenarPaginas(usuarioId: string, paiId: string | null, ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (const [indice, id] of ids.entries()) {
      const result = await new sql.Request(transaction)
        .input("usuarioId", sql.UniqueIdentifier, usuarioId)
        .input("id", sql.UniqueIdentifier, id)
        .input("paiId", sql.UniqueIdentifier, paiId)
        .input("ordem", sql.Int, indice)
        .query(`
          UPDATE dbo.portal_notas_paginas SET [ordem] = @ordem
          WHERE [id] = @id AND [usuario_id] = @usuarioId AND [excluida_em] IS NULL
            AND (([pai_id] IS NULL AND @paiId IS NULL) OR [pai_id] = @paiId);
        `);

      if ((result.rowsAffected[0] ?? 0) === 0) {
        throw new ValidationError("A lista mudou enquanto você arrastava. Recarregue e tente de novo.");
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/* Para a lixeira: a página e todas as subpáginas, com o mesmo instante (restauram juntas). */
export async function enviarParaLixeira(usuarioId: string, id: string): Promise<number> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("id", sql.UniqueIdentifier, id)
    .query(`
      DECLARE @agora DATETIME2 = SYSDATETIME();
      ${CTE_SUBARVORE}
      UPDATE p SET p.[excluida_em] = @agora
      FROM dbo.portal_notas_paginas AS p
      INNER JOIN subarvore AS s ON s.[id] = p.[id]
      WHERE p.[excluida_em] IS NULL;
    `);

  const afetadas = result.rowsAffected.at(-1) ?? 0;
  if (afetadas === 0) throw new ValidationError("Página não encontrada.");
  /* Na lixeira ninguém mais acessa: quem estava ao vivo nela sai. */
  revalidarAoVivo(usuarioId, id);
  return afetadas;
}

export async function listarLixeira(usuarioId: string): Promise<PaginaLixeira[]> {
  await limparLixeiraVencida(usuarioId);

  const pool = await getSqlServerPool();
  /* Só as "raízes" de cada exclusão: subpáginas excluídas junto com o pai aparecem como contagem. */
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ id: string; titulo: string; excluida_em: string; subpaginas: number }>(`
      SELECT
        CONVERT(VARCHAR(36), p.[id]) AS [id],
        p.[titulo],
        CONVERT(VARCHAR(33), p.[excluida_em], 126) AS [excluida_em],
        (SELECT COUNT(*) FROM dbo.portal_notas_paginas AS d
          WHERE d.[usuario_id] = @usuarioId AND d.[excluida_em] = p.[excluida_em] AND d.[id] <> p.[id]) AS [subpaginas]
      FROM dbo.portal_notas_paginas AS p
      WHERE p.[usuario_id] = @usuarioId AND p.[excluida_em] IS NOT NULL
        AND (p.[pai_id] IS NULL OR NOT EXISTS (
          SELECT 1 FROM dbo.portal_notas_paginas AS pai
          WHERE pai.[id] = p.[pai_id] AND pai.[excluida_em] = p.[excluida_em]
        ))
      ORDER BY p.[excluida_em] DESC;
    `);

  return result.recordset.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    excluidaEm: row.excluida_em,
    subpaginas: row.subpaginas,
  }));
}

/*
 * Restaura a página e o que saiu junto com ela. Se o pai continua na
 * lixeira (ou sumiu), ela volta para a raiz do caderno.
 */
export async function restaurarDaLixeira(usuarioId: string, id: string): Promise<void> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("id", sql.UniqueIdentifier, id)
    .query(`
      DECLARE @excluidaEm DATETIME2 = (
        SELECT [excluida_em] FROM dbo.portal_notas_paginas
        WHERE [id] = @id AND [usuario_id] = @usuarioId AND [excluida_em] IS NOT NULL
      );

      IF @excluidaEm IS NOT NULL
      BEGIN
        ${CTE_SUBARVORE}
        UPDATE p SET p.[excluida_em] = NULL
        FROM dbo.portal_notas_paginas AS p
        INNER JOIN subarvore AS s ON s.[id] = p.[id]
        WHERE p.[excluida_em] = @excluidaEm;

        UPDATE p SET p.[pai_id] = NULL
        FROM dbo.portal_notas_paginas AS p
        WHERE p.[id] = @id AND p.[pai_id] IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM dbo.portal_notas_paginas AS pai
          WHERE pai.[id] = p.[pai_id] AND pai.[excluida_em] IS NULL
        );

        SELECT 1 AS [restaurada];
      END;
    `);

  if (!result.recordset?.[0]) throw new ValidationError("A página não está na lixeira.");
}

/*
 * Exclusão definitiva de um item da lixeira: a página e as subpáginas que
 * saíram JUNTO com ela (mesmo excluida_em). Subpágina que foi para a
 * lixeira antes, separada, continua lá como item próprio (vai para a raiz,
 * já que o pai some). Tudo numa transação, por causa da auto-referência.
 */
export async function excluirDefinitivamente(usuarioId: string, id: string): Promise<void> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("id", sql.UniqueIdentifier, id)
    .query(`
      SET XACT_ABORT ON;
      DECLARE @excluidaEm DATETIME2 = (
        SELECT [excluida_em] FROM dbo.portal_notas_paginas
        WHERE [id] = @id AND [usuario_id] = @usuarioId AND [excluida_em] IS NOT NULL
      );

      IF @excluidaEm IS NOT NULL
      BEGIN
        BEGIN TRANSACTION;
        DECLARE @grupo TABLE ([id] UNIQUEIDENTIFIER PRIMARY KEY);

        WITH grupo AS (
          SELECT p.[id] FROM dbo.portal_notas_paginas AS p
          WHERE p.[id] = @id AND p.[usuario_id] = @usuarioId
          UNION ALL
          SELECT f.[id] FROM dbo.portal_notas_paginas AS f
          INNER JOIN grupo AS g ON f.[pai_id] = g.[id]
          WHERE f.[usuario_id] = @usuarioId AND f.[excluida_em] = @excluidaEm
        )
        INSERT INTO @grupo ([id]) SELECT [id] FROM grupo;

        UPDATE dbo.portal_notas_paginas SET [pai_id] = NULL
        WHERE [usuario_id] = @usuarioId
          AND [pai_id] IN (SELECT [id] FROM @grupo)
          AND [id] NOT IN (SELECT [id] FROM @grupo);

        DELETE FROM dbo.portal_notas_paginas WHERE [id] IN (SELECT [id] FROM @grupo);
        COMMIT TRANSACTION;

        SELECT 1 AS [excluida];
      END;
    `);

  if (!result.recordset?.[0]) throw new ValidationError("A página não está na lixeira.");
  await limparImagensSemUso(usuarioId);
}

export async function esvaziarLixeira(usuarioId: string): Promise<void> {
  await excluirDaLixeiraOndeSql(usuarioId, "1 = 1");
}

/* Some sozinho o que está na lixeira há mais de 30 dias (roda ao abrir o caderno/lixeira). */
async function limparLixeiraVencida(usuarioId: string): Promise<void> {
  await excluirDaLixeiraOndeSql(usuarioId, `p.[excluida_em] < DATEADD(DAY, -${DIAS_NA_LIXEIRA}, SYSDATETIME())`);
}

/*
 * Apaga da lixeira as páginas que atendem `condicao` + as subpáginas delas
 * (também na lixeira). Numa instrução só: a FK de pai_id é verificada no
 * fim da instrução, então pai e filhas saem juntos sem erro.
 */
async function excluirDaLixeiraOndeSql(usuarioId: string, condicao: string): Promise<void> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query(`
      WITH alvo AS (
        SELECT p.[id] FROM dbo.portal_notas_paginas AS p
        WHERE p.[usuario_id] = @usuarioId AND p.[excluida_em] IS NOT NULL AND ${condicao}
        UNION ALL
        SELECT f.[id] FROM dbo.portal_notas_paginas AS f
        INNER JOIN alvo AS a ON f.[pai_id] = a.[id]
        WHERE f.[usuario_id] = @usuarioId
      )
      DELETE p FROM dbo.portal_notas_paginas AS p
      WHERE p.[id] IN (SELECT [id] FROM alvo);
    `);

  if ((result.rowsAffected[0] ?? 0) > 0) await limparImagensSemUso(usuarioId);
}

/*
 * Imagens que nenhuma página (nem as da lixeira) usa mais. Só as com mais
 * de um dia: uma imagem recém-colada pode ainda não ter sido salva no
 * conteúdo (gravação automática a caminho). Procura em TODAS as páginas,
 * não só nas de quem enviou: com compartilhamento, o print de um convidado
 * mora na página do dono.
 */
async function limparImagensSemUso(usuarioId: string): Promise<void> {
  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query(`
      DELETE i FROM dbo.portal_notas_imagens AS i
      WHERE i.[usuario_id] = @usuarioId
        AND i.[criado_em] < DATEADD(DAY, -1, SYSDATETIME())
        AND NOT EXISTS (
          SELECT 1 FROM dbo.portal_notas_paginas AS p
          WHERE p.[conteudo] LIKE '%' + CONVERT(VARCHAR(36), i.[id]) + '%'
        );
    `);
}

/* Busca no título e no texto das páginas ativas, com um trecho em volta da primeira ocorrência. */
export async function buscarPaginas(usuarioId: string, termo: string): Promise<ResultadoBusca[]> {
  const limpo = termo.trim().slice(0, 100);
  if (limpo.length < 2) return [];

  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("termo", sql.NVarChar(100), limpo)
    .input("padrao", sql.NVarChar(110), `%${limpo.replace(/[[\]%_]/g, (c) => `[${c}]`)}%`)
    .query<{ id: string; titulo: string; trecho: string | null }>(`
      SELECT TOP 30
        CONVERT(VARCHAR(36), p.[id]) AS [id],
        p.[titulo],
        CASE WHEN CHARINDEX(@termo, p.[texto_busca]) > 0
          THEN SUBSTRING(p.[texto_busca], CASE WHEN CHARINDEX(@termo, p.[texto_busca]) > 50 THEN CHARINDEX(@termo, p.[texto_busca]) - 50 ELSE 1 END, 160)
        END AS [trecho]
      FROM dbo.portal_notas_paginas AS p
      WHERE p.[usuario_id] = @usuarioId AND p.[excluida_em] IS NULL
        AND (p.[titulo] LIKE @padrao OR p.[texto_busca] LIKE @padrao)
      ORDER BY CASE WHEN p.[titulo] LIKE @padrao THEN 0 ELSE 1 END, p.[atualizado_em] DESC;
    `);

  return result.recordset.map((row) => ({
    id: row.id,
    titulo: row.titulo,
    trecho: row.trecho ? row.trecho.replace(/\s+/g, " ").trim() : null,
  }));
}
