import "server-only";

import { cache } from "react";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface ResumoAcessoModulo {
  moduloId: string;
  ultimoAcesso: string;
  totalAcessos: number;
}

/*
 * Chamada em requireModuloAccess (src/lib/auth/autorizacao.ts)
 * a cada navegação para um módulo restrito. Só grava — as
 * agregações (último acesso, total de acessos) são calculadas
 * na leitura, não aqui.
 */
export async function registrarAcessoModulo(
  usuarioId: string,
  moduloChave: string
): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);
  request.input("moduloChave", sql.VarChar(60), moduloChave);

  await request.query(`
    INSERT INTO dbo.portal_acesso_modulo_historico ([usuario_id], [modulo_id])
    SELECT @usuarioId, [id]
    FROM dbo.portal_modulos
    WHERE [chave] = @moduloChave;
  `);
}

/*
 * Wrapper usado no caminho de navegação real — registrar o
 * acesso nunca pode impedir a página de carregar. Uma falha
 * aqui só vai pro log do servidor.
 */
export async function registrarAcessoModuloSemFalhar(
  usuarioId: string,
  moduloChave: string
): Promise<void> {
  try {
    await registrarAcessoModulo(usuarioId, moduloChave);
  } catch (error) {
    console.error("Erro ao registrar acesso ao módulo:", error);
  }
}

/*
 * Um valor por módulo já acessado pelo usuário, com o
 * timestamp do acesso mais recente e a contagem total —
 * usado na home tanto para "Acessados recentemente" (ordenar
 * por ultimoAcesso) quanto para destacar o mais usado
 * (ordenar por totalAcessos). A checagem de permissão atual
 * (o usuário pode ter perdido acesso a algo que já usou) fica
 * por conta de quem consome isto, cruzando com os módulos
 * liberados agora — não é refeita aqui.
 */
export const getResumoAcessosModulos = cache(async (
  usuarioId: string
): Promise<ResumoAcessoModulo[]> => {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

  const result = await request.query<{
    modulo_id: string;
    ultimo_acesso: string;
    total_acessos: number;
  }>(`
    SELECT
      h.[modulo_id] AS [modulo_id],
      CONVERT(VARCHAR(33), MAX(h.[acessado_em]), 126) AS [ultimo_acesso],
      COUNT(*) AS [total_acessos]
    FROM dbo.portal_acesso_modulo_historico AS h
    INNER JOIN dbo.portal_modulos AS m
      ON m.[id] = h.[modulo_id]
    WHERE h.[usuario_id] = @usuarioId
      AND m.[ativo] = 1
    GROUP BY h.[modulo_id];
  `);

  return result.recordset.map((row) => ({
    moduloId: row.modulo_id,
    ultimoAcesso: row.ultimo_acesso,
    totalAcessos: row.total_acessos,
  }));
});
