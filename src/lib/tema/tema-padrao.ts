import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";
import { corHexValida } from "./paleta-empresa";

export interface TemaPadrao {
  corPrimariaClara: string;
  corPrimariaEscura: string;
}

interface TemaPadraoRow {
  cor_primaria_clara: string;
  cor_primaria_escura: string;
}

/*
 * `null` significa que ninguém personalizou o tema padrão ainda — o
 * portal continua usando o vermelho fixo definido em globals.css.
 */
export async function buscarTemaPadrao(): Promise<TemaPadrao | null> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<TemaPadraoRow>(`
    SELECT [cor_primaria_clara], [cor_primaria_escura]
    FROM dbo.portal_tema_padrao
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    corPrimariaClara: row.cor_primaria_clara,
    corPrimariaEscura: row.cor_primaria_escura,
  };
}

export async function salvarTemaPadrao(params: {
  corPrimariaClara: string;
  corPrimariaEscura: string;
  atualizadoPor: string;
}): Promise<TemaPadrao> {
  if (!corHexValida(params.corPrimariaClara) || !corHexValida(params.corPrimariaEscura)) {
    throw new ValidationError("As cores precisam estar no formato #rrggbb.");
  }

  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("corClara", sql.VarChar(7), params.corPrimariaClara);
  request.input("corEscura", sql.VarChar(7), params.corPrimariaEscura);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  const result = await request.query<TemaPadraoRow>(`
    MERGE INTO dbo.portal_tema_padrao AS destino
    USING (SELECT 1 AS [id]) AS origem
      ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [cor_primaria_clara] = @corClara,
        [cor_primaria_escura] = @corEscura,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [cor_primaria_clara], [cor_primaria_escura], [atualizado_por])
      VALUES (1, @corClara, @corEscura, @atualizadoPor)
    OUTPUT INSERTED.[cor_primaria_clara], INSERTED.[cor_primaria_escura];
  `);

  const row = result.recordset[0];

  return {
    corPrimariaClara: row.cor_primaria_clara,
    corPrimariaEscura: row.cor_primaria_escura,
  };
}

/*
 * Volta ao vermelho fixo de globals.css apagando a personalização —
 * diferente de "desativar", não existe um estado intermediário aqui.
 */
export async function removerTemaPadrao(): Promise<void> {
  const pool = await getSqlServerPool();
  await pool.request().query(`DELETE FROM dbo.portal_tema_padrao WHERE [id] = 1;`);
}
