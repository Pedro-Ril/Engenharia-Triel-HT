import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

/*
 * Preferência de tela por usuário e módulo, guardada como JSON.
 *
 * Diferente de preferencias.ts, que tem uma coluna por preferência
 * global do portal (hoje só o tema): aqui a chave é livre, e o formato
 * do valor é assunto de quem gravou. O banco não valida nada -- quem lê
 * precisa aceitar que o JSON pode estar velho ou inválido.
 */

/* Nunca lança: preferência faltando ou corrompida só significa "use o padrão". */
export async function buscarPreferenciaModulo<T>(
  usuarioId: string,
  chave: string
): Promise<T | null> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("usuarioId", sql.UniqueIdentifier, usuarioId);
    request.input("chave", sql.VarChar(80), chave);

    const result = await request.query<{ valor: string | null }>(`
      SELECT [valor]
      FROM dbo.portal_preferencias_usuario_modulo
      WHERE [usuario_id] = @usuarioId AND [chave] = @chave;
    `);

    const valor = result.recordset[0]?.valor;
    if (!valor) return null;

    return JSON.parse(valor) as T;
  } catch (error) {
    console.error(`Erro ao buscar preferência "${chave}":`, error);
    return null;
  }
}

export async function salvarPreferenciaModulo(
  usuarioId: string,
  chave: string,
  valor: unknown
): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);
  request.input("chave", sql.VarChar(80), chave);
  request.input("valor", sql.NVarChar(sql.MAX), JSON.stringify(valor));

  await request.query(`
    MERGE dbo.portal_preferencias_usuario_modulo AS destino
    USING (SELECT @usuarioId AS usuario_id, @chave AS chave) AS origem
      ON destino.[usuario_id] = origem.usuario_id AND destino.[chave] = origem.chave
    WHEN MATCHED THEN
      UPDATE SET [valor] = @valor, [atualizado_em] = SYSDATETIME()
    WHEN NOT MATCHED THEN
      INSERT ([usuario_id], [chave], [valor]) VALUES (@usuarioId, @chave, @valor);
  `);
}
