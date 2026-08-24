import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export type TemaPreferencia = "claro" | "escuro" | "sistema";

const TEMAS_VALIDOS: TemaPreferencia[] = ["claro", "escuro", "sistema"];

export function ehTemaValido(valor: string): valor is TemaPreferencia {
  return (TEMAS_VALIDOS as string[]).includes(valor);
}

/*
 * Nunca lança — usada também no layout raiz (renderizado em toda
 * navegação); se a consulta falhar, cai para "sistema" (segue a
 * preferência do sistema operacional) em vez de quebrar o portal.
 */
export async function buscarTemaUsuario(usuarioId: string): Promise<TemaPreferencia> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

    const result = await request.query<{ tema: TemaPreferencia }>(`
      SELECT [tema] FROM dbo.portal_preferencias_usuario WHERE [usuario_id] = @usuarioId;
    `);

    return result.recordset[0]?.tema ?? "sistema";
  } catch (error) {
    console.error("Erro ao buscar preferência de tema:", error);
    return "sistema";
  }
}

export async function definirTemaUsuario(
  usuarioId: string,
  tema: TemaPreferencia
): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);
  request.input("tema", sql.VarChar(10), tema);

  await request.query(`
    MERGE dbo.portal_preferencias_usuario AS destino
    USING (SELECT @usuarioId AS usuario_id) AS origem
      ON destino.[usuario_id] = origem.usuario_id
    WHEN MATCHED THEN
      UPDATE SET [tema] = @tema, [atualizado_em] = SYSDATETIME()
    WHEN NOT MATCHED THEN
      INSERT ([usuario_id], [tema]) VALUES (@usuarioId, @tema);
  `);
}
