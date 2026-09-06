import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export const TAMANHO_MAXIMO_IMAGEM_BYTES = 8 * 1024 * 1024;

export const TIPOS_MIME_IMAGEM_ACEITOS = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

export interface WikiImagem {
  tipoMime: string;
  conteudo: Buffer;
}

export async function salvarImagem(params: {
  tipoMime: string;
  tamanhoBytes: number;
  conteudo: Buffer;
  criadoPorUsuarioId: string | null;
}): Promise<string> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("tipoMime", sql.NVarChar(100), params.tipoMime);
  request.input("tamanhoBytes", sql.Int, params.tamanhoBytes);
  request.input("conteudo", sql.VarBinary(sql.MAX), params.conteudo);
  request.input("criadoPorUsuarioId", sql.UniqueIdentifier, params.criadoPorUsuarioId);

  const result = await request.query<{ id: string }>(`
    INSERT INTO dbo.portal_wiki_imagens
      ([tipo_mime], [tamanho_bytes], [conteudo], [criado_por_usuario_id])
    OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
    VALUES (@tipoMime, @tamanhoBytes, @conteudo, @criadoPorUsuarioId);
  `);

  return result.recordset[0].id;
}

export async function buscarImagem(id: string): Promise<WikiImagem | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query<{ tipo_mime: string; conteudo: Buffer }>(`
    SELECT [tipo_mime], [conteudo]
    FROM dbo.portal_wiki_imagens
    WHERE [id] = @id;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  return { tipoMime: row.tipo_mime, conteudo: row.conteudo };
}
