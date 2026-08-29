import "server-only";

import { forcarLogoutTodosExceto } from "@/lib/auth/admin";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface StatusManutencao {
  ativo: boolean;
  mensagem: string | null;
  ativadoEm: string | null;
  ativadoPor: string | null;
}

interface StatusManutencaoRow {
  ativo: boolean;
  mensagem: string | null;
  ativado_em: string | null;
  ativado_por: string | null;
}

const STATUS_PADRAO: StatusManutencao = {
  ativo: false,
  mensagem: null,
  ativadoEm: null,
  ativadoPor: null,
};

export async function buscarStatusManutencao(): Promise<StatusManutencao> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<StatusManutencaoRow>(`
    SELECT
      CAST([ativo] AS BIT) AS [ativo],
      [mensagem],
      CONVERT(VARCHAR(33), [ativado_em], 126) AS [ativado_em],
      [ativado_por]
    FROM dbo.portal_manutencao
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];
  if (!row) return STATUS_PADRAO;

  return {
    ativo: row.ativo,
    mensagem: row.mensagem,
    ativadoEm: row.ativado_em,
    ativadoPor: row.ativado_por,
  };
}

export async function ativarManutencao(params: {
  mensagem: string | null;
  ativadoPor: string;
  ativadoPorId: string;
}): Promise<StatusManutencao> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("mensagem", sql.NVarChar(1000), params.mensagem);
  request.input("ativadoPor", sql.NVarChar(150), params.ativadoPor);

  await request.query(`
    MERGE INTO dbo.portal_manutencao AS destino
    USING (SELECT 1 AS [id]) AS origem
      ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [ativo] = 1,
        [mensagem] = @mensagem,
        [ativado_em] = SYSDATETIME(),
        [ativado_por] = @ativadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [ativo], [mensagem], [ativado_em], [ativado_por])
      VALUES (1, 1, @mensagem, SYSDATETIME(), @ativadoPor);
  `);

  invalidarCacheStatusManutencao();

  /*
   * Ativar manutenção também derruba quem já está logado — senão a
   * pessoa só seria bloqueada na próxima navegação (proxy.ts), e
   * quem ficasse numa aba parada continuaria com o token válido.
   * Nunca derruba quem está ativando (precisa continuar logado pra
   * gerenciar a manutenção que acabou de ligar).
   */
  await forcarLogoutTodosExceto(params.ativadoPorId);

  return buscarStatusManutencao();
}

export async function desativarManutencao(): Promise<StatusManutencao> {
  const pool = await getSqlServerPool();

  await pool.request().query(`
    UPDATE dbo.portal_manutencao
    SET [ativo] = 0
    WHERE [id] = 1;
  `);

  invalidarCacheStatusManutencao();
  return buscarStatusManutencao();
}

/*
 * Cache curto (poucos segundos) usado só pelo proxy.ts — ele roda em
 * TODA requisição (menos assets estáticos), então sem cache aqui
 * viraria uma consulta ao SQL Server por navegação mesmo com o modo
 * manutenção desligado (o caso comum). O painel de admin sempre lê
 * direto do banco (buscarStatusManutencao), nunca deste cache.
 */
const TTL_CACHE_MS = 5000;
let statusCache: { valor: StatusManutencao; expiraEm: number } | null = null;

export async function buscarStatusManutencaoCache(): Promise<StatusManutencao> {
  if (statusCache && statusCache.expiraEm > Date.now()) {
    return statusCache.valor;
  }

  const valor = await buscarStatusManutencao();
  statusCache = { valor, expiraEm: Date.now() + TTL_CACHE_MS };
  return valor;
}

function invalidarCacheStatusManutencao() {
  statusCache = null;
}
