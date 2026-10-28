import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { lerDimensoesPng } from "./rubricas-png";

/*
 * Rubricas dos aprovadores (Administração → Diretoria → Alçadas): um
 * PNG por pessoa, guardado no banco. Entra no rodapé do PDF do pedido de
 * compra, no nível que a pessoa aprovou (ver pedido-compra-pdf-carimbo.ts).
 * Cada envio ou remoção fica no histórico das alçadas.
 */

export const TAMANHO_MAXIMO_RUBRICA = 512 * 1024;

export interface RubricaAprovador {
  usuarioId: string;
  nome: string;
  /* Em algum nível de alçada ativa de pedido de compra. */
  naAlcada: boolean;
  temRubrica: boolean;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/* Recusa o que não serve de rubrica antes de gravar. Devolve as dimensões. */
export function validarRubricaPng(conteudo: Uint8Array): { largura: number; altura: number } {
  if (conteudo.length === 0) throw new ValidationError("O arquivo está vazio.");
  if (conteudo.length > TAMANHO_MAXIMO_RUBRICA) {
    throw new ValidationError(`A rubrica pode ter no máximo ${TAMANHO_MAXIMO_RUBRICA / 1024} KB.`);
  }

  const dimensoes = lerDimensoesPng(conteudo);
  if (!dimensoes) throw new ValidationError("Envie a rubrica em PNG.");

  if (dimensoes.largura < 40 || dimensoes.altura < 15) {
    throw new ValidationError("A imagem é pequena demais para uma rubrica (mínimo 40 × 15 pixels).");
  }
  if (dimensoes.largura > 3000 || dimensoes.altura > 1500) {
    throw new ValidationError("A imagem é grande demais (máximo 3000 × 1500 pixels). Recorte só a rubrica.");
  }

  return dimensoes;
}

/*
 * Quem aparece na tela de rubricas: as pessoas das alçadas de pedido de
 * compra e quem já tem rubrica (mesmo que tenha saído da alçada).
 */
export async function listarRubricas(): Promise<RubricaAprovador[]> {
  const pool = await getSqlServerPool();
  const result = await pool.request().query<{
    usuario_id: string;
    nome: string;
    na_alcada: number;
    tem_rubrica: number;
    atualizado_em: string | null;
    atualizado_por: string | null;
  }>(`
    WITH [pessoas] AS (
      SELECT nu.[usuario_id]
      FROM dbo.portal_alcadas AS a
      INNER JOIN dbo.portal_alcadas_niveis AS n ON n.[alcada_id] = a.[id] AND n.[ativo] = 1
      INNER JOIN dbo.portal_alcadas_niveis_usuarios AS nu ON nu.[nivel_id] = n.[id]
      WHERE a.[ativo] = 1 AND a.[tipo] = 'pedido_compra'
      UNION
      SELECT [usuario_id] FROM dbo.portal_aprovadores_rubricas
    )
    SELECT
      CONVERT(VARCHAR(36), u.[id]) AS [usuario_id],
      u.[nome_exibicao] AS [nome],
      CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.portal_alcadas AS a
        INNER JOIN dbo.portal_alcadas_niveis AS n ON n.[alcada_id] = a.[id] AND n.[ativo] = 1
        INNER JOIN dbo.portal_alcadas_niveis_usuarios AS nu ON nu.[nivel_id] = n.[id]
        WHERE a.[ativo] = 1 AND a.[tipo] = 'pedido_compra' AND nu.[usuario_id] = u.[id]
      ) THEN 1 ELSE 0 END AS [na_alcada],
      CASE WHEN r.[usuario_id] IS NULL THEN 0 ELSE 1 END AS [tem_rubrica],
      CONVERT(VARCHAR(33), r.[atualizado_em], 126) AS [atualizado_em],
      r.[atualizado_por]
    FROM [pessoas] AS p
    INNER JOIN dbo.portal_usuarios AS u ON u.[id] = p.[usuario_id]
    LEFT JOIN dbo.portal_aprovadores_rubricas AS r ON r.[usuario_id] = u.[id]
    ORDER BY u.[nome_exibicao];
  `);

  return result.recordset.map((linha) => ({
    usuarioId: linha.usuario_id,
    nome: linha.nome,
    naAlcada: linha.na_alcada === 1,
    temRubrica: linha.tem_rubrica === 1,
    atualizadoEm: linha.atualizado_em,
    atualizadoPor: linha.atualizado_por,
  }));
}

/* A imagem de uma pessoa (prévia da administração). */
export async function buscarImagemRubrica(usuarioId: string): Promise<Buffer | null> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ imagem: Buffer }>(`SELECT [imagem] FROM dbo.portal_aprovadores_rubricas WHERE [usuario_id] = @usuarioId;`);
  return result.recordset[0]?.imagem ?? null;
}

/* As imagens de várias pessoas de uma vez (o carimbo do PDF), pelo id em maiúsculas. */
export async function buscarRubricasDe(usuarioIds: string[]): Promise<Map<string, Buffer>> {
  const unicos = [...new Set(usuarioIds.map((id) => id.toUpperCase()))];
  if (unicos.length === 0) return new Map();

  const pool = await getSqlServerPool();
  const request = pool.request();
  unicos.forEach((id, i) => request.input(`u${i}`, sql.UniqueIdentifier, id));
  const result = await request.query<{ usuario_id: string; imagem: Buffer }>(`
    SELECT CONVERT(VARCHAR(36), [usuario_id]) AS [usuario_id], [imagem]
    FROM dbo.portal_aprovadores_rubricas
    WHERE [usuario_id] IN (${unicos.map((_, i) => `@u${i}`).join(", ")});
  `);
  return new Map(result.recordset.map((linha) => [linha.usuario_id, linha.imagem]));
}

async function registrarHistorico(transaction: sql.Transaction, descricao: string, admin: { id: string; nomeExibicao: string }) {
  await new sql.Request(transaction)
    .input("descricao", sql.NVarChar(4000), descricao)
    .input("usuarioId", sql.UniqueIdentifier, admin.id)
    .input("usuarioNome", sql.NVarChar(200), admin.nomeExibicao)
    .query(`
      INSERT INTO dbo.portal_alcadas_historico ([alcada_id], [tipo], [descricao], [usuario_id], [usuario_nome])
      VALUES (NULL, 'pedido_compra', @descricao, @usuarioId, @usuarioNome);
    `);
}

async function nomeDoUsuario(usuarioId: string): Promise<string> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, usuarioId)
    .query<{ nome: string }>(`SELECT [nome_exibicao] AS [nome] FROM dbo.portal_usuarios WHERE [id] = @id AND [ativo] = 1;`);
  const nome = result.recordset[0]?.nome;
  if (!nome) throw new ValidationError("Usuário não encontrado ou inativo.");
  return nome;
}

/* Grava (ou troca) a rubrica de uma pessoa. */
export async function salvarRubrica(
  usuarioId: string,
  conteudo: Uint8Array,
  admin: { id: string; nomeExibicao: string }
): Promise<void> {
  const { largura, altura } = validarRubricaPng(conteudo);
  const nome = await nomeDoUsuario(usuarioId);

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const gravado = await new sql.Request(transaction)
      .input("usuarioId", sql.UniqueIdentifier, usuarioId)
      .input("imagem", sql.VarBinary(sql.MAX), Buffer.from(conteudo))
      .input("largura", sql.Int, largura)
      .input("altura", sql.Int, altura)
      .input("tamanho", sql.Int, conteudo.length)
      .input("por", sql.NVarChar(200), admin.nomeExibicao)
      .query<{ acao: string }>(`
        MERGE dbo.portal_aprovadores_rubricas WITH (HOLDLOCK) AS alvo
        USING (SELECT @usuarioId AS [usuario_id]) AS origem ON alvo.[usuario_id] = origem.[usuario_id]
        WHEN MATCHED THEN
          UPDATE SET [imagem] = @imagem, [largura] = @largura, [altura] = @altura, [tamanho] = @tamanho,
                     [atualizado_em] = SYSDATETIME(), [atualizado_por] = @por
        WHEN NOT MATCHED THEN
          INSERT ([usuario_id], [imagem], [largura], [altura], [tamanho], [atualizado_por])
          VALUES (@usuarioId, @imagem, @largura, @altura, @tamanho, @por)
        OUTPUT $action AS [acao];
      `);

    const trocou = gravado.recordset[0]?.acao === "UPDATE";
    await registrarHistorico(transaction, `Rubrica de ${nome} ${trocou ? "trocada" : "enviada"} (${largura} × ${altura} px).`, admin);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

export async function removerRubrica(usuarioId: string, admin: { id: string; nomeExibicao: string }): Promise<void> {
  const nome = await nomeDoUsuario(usuarioId).catch(() => "usuário inativo");

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const removido = await new sql.Request(transaction)
      .input("usuarioId", sql.UniqueIdentifier, usuarioId)
      .query(`DELETE FROM dbo.portal_aprovadores_rubricas WHERE [usuario_id] = @usuarioId;`);
    if ((removido.rowsAffected[0] ?? 0) === 0) throw new ValidationError("Essa pessoa não tem rubrica cadastrada.");

    await registrarHistorico(transaction, `Rubrica de ${nome} removida.`, admin);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}
