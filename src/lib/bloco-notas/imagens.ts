import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

/* Imagens do Bloco de Notas (prints colados): cada uma só é servida para quem enviou. */

export const TAMANHO_MAXIMO_IMAGEM_NOTA = 10 * 1024 * 1024;
export const TIPOS_IMAGEM_NOTA = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function salvarImagemNota(params: {
  usuarioId: string;
  tipoMime: string;
  tamanhoBytes: number;
  conteudo: Buffer;
}): Promise<string> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
    .input("tipoMime", sql.NVarChar(100), params.tipoMime)
    .input("tamanhoBytes", sql.Int, params.tamanhoBytes)
    .input("conteudo", sql.VarBinary(sql.MAX), params.conteudo)
    .query<{ id: string }>(`
      INSERT INTO dbo.portal_notas_imagens ([usuario_id], [tipo_mime], [tamanho_bytes], [conteudo])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@usuarioId, @tipoMime, @tamanhoBytes, @conteudo);
    `);

  return result.recordset[0].id;
}

/* null quando não existe OU é de outra pessoa (mesma resposta, não revela que existe). */
export async function buscarImagemNota(
  usuarioId: string,
  id: string
): Promise<{ tipoMime: string; conteudo: Buffer } | null> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("id", sql.UniqueIdentifier, id)
    .query<{ tipo_mime: string; conteudo: Buffer }>(`
      SELECT [tipo_mime], [conteudo] FROM dbo.portal_notas_imagens
      WHERE [id] = @id AND [usuario_id] = @usuarioId;
    `);

  const row = result.recordset[0];
  return row ? { tipoMime: row.tipo_mime, conteudo: row.conteudo } : null;
}
