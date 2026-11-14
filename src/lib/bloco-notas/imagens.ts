import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { acessoPagina } from "./compartilhamento";

/*
 * Imagens do Bloco de Notas (prints colados). Quem vê: quem enviou, ou
 * quem tem acesso à página em que ela foi colada (dono ou compartilhado)
 * -- assim o print aparece na hora para quem está editando junto.
 */

export const TAMANHO_MAXIMO_IMAGEM_NOTA = 10 * 1024 * 1024;
export const TIPOS_IMAGEM_NOTA = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function salvarImagemNota(params: {
  usuarioId: string;
  paginaId: string | null;
  tipoMime: string;
  tamanhoBytes: number;
  conteudo: Buffer;
}): Promise<string> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
    .input("paginaId", sql.UniqueIdentifier, params.paginaId)
    .input("tipoMime", sql.NVarChar(100), params.tipoMime)
    .input("tamanhoBytes", sql.Int, params.tamanhoBytes)
    .input("conteudo", sql.VarBinary(sql.MAX), params.conteudo)
    .query<{ id: string }>(`
      INSERT INTO dbo.portal_notas_imagens ([usuario_id], [pagina_id], [tipo_mime], [tamanho_bytes], [conteudo])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@usuarioId, @paginaId, @tipoMime, @tamanhoBytes, @conteudo);
    `);

  return result.recordset[0].id;
}

/* null quando não existe OU a pessoa não tem acesso (mesma resposta, não revela que existe). */
export async function buscarImagemNota(
  usuarioId: string,
  id: string
): Promise<{ tipoMime: string; conteudo: Buffer } | null> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{ usuario_id: string; pagina_id: string | null; tipo_mime: string; conteudo: Buffer }>(`
      SELECT CONVERT(VARCHAR(36), [usuario_id]) AS [usuario_id], CONVERT(VARCHAR(36), [pagina_id]) AS [pagina_id],
        [tipo_mime], [conteudo]
      FROM dbo.portal_notas_imagens WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  if (!row) return null;

  const enviouEla = row.usuario_id.toLowerCase() === usuarioId.toLowerCase();
  const temAcessoPagina = !enviouEla && row.pagina_id ? (await acessoPagina(usuarioId, row.pagina_id)) !== null : false;

  return enviouEla || temAcessoPagina ? { tipoMime: row.tipo_mime, conteudo: row.conteudo } : null;
}
