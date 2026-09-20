import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { criptografarSegredo, descriptografarSegredo } from "@/lib/crypto/segredo";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

/* Nunca inclui a senha -- toda linha desta tabela sempre tem uma senha (coluna NOT NULL), mesmo padrão de Camera em src/lib/semaforo/cameras.ts. */
export interface RedeWifi {
  id: string;
  ssid: string;
  prioridade: number;
  ativa: boolean;
  criadoEm: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

/* Com senha decifrada -- só pro agente Linux consumir (ver GET /api/tv/agente/config), nunca sai pro cliente admin. */
export interface RedeWifiParaAgente {
  ssid: string;
  senha: string;
  prioridade: number;
}

interface RedeWifiRow {
  id: string;
  ssid: string;
  prioridade: number;
  ativa: boolean;
  criado_em: string;
  atualizado_em: string;
  atualizado_por: string | null;
}

const colunasRedeWifi = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [ssid],
  [prioridade],
  [ativa],
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
  [atualizado_por]
`;

function mapRedeWifiRow(row: RedeWifiRow): RedeWifi {
  return {
    id: row.id,
    ssid: row.ssid,
    prioridade: row.prioridade,
    ativa: row.ativa,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

export async function listarRedesWifi(): Promise<RedeWifi[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<RedeWifiRow>(`
    SELECT ${colunasRedeWifi}
    FROM dbo.portal_tv_redes_wifi
    ORDER BY [prioridade], [ssid];
  `);

  return result.recordset.map(mapRedeWifiRow);
}

export async function buscarRedeWifiPorId(id: string): Promise<RedeWifi | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<RedeWifiRow>(`
      SELECT ${colunasRedeWifi}
      FROM dbo.portal_tv_redes_wifi
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  return row ? mapRedeWifiRow(row) : null;
}

/*
 * Lista compartilhada, só as ativas, com senha decifrada e em ordem de
 * prioridade -- o agente tenta cada uma nessa ordem até conseguir
 * conectar (ver tv-agente/agente.mjs).
 */
export async function listarRedesWifiParaAgente(): Promise<RedeWifiParaAgente[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    ssid: string;
    senha_cifrada: Buffer;
    prioridade: number;
  }>(`
    SELECT [ssid], [senha_cifrada], [prioridade]
    FROM dbo.portal_tv_redes_wifi
    WHERE [ativa] = 1
    ORDER BY [prioridade];
  `);

  return result.recordset.map((row) => ({
    ssid: row.ssid,
    senha: descriptografarSegredo(row.senha_cifrada),
    prioridade: row.prioridade,
  }));
}

async function proximaPrioridade(pool: Awaited<ReturnType<typeof getSqlServerPool>>): Promise<number> {
  const result = await pool.request().query<{ proxima: number }>(`
    SELECT ISNULL(MAX([prioridade]), -1) + 1 AS [proxima] FROM dbo.portal_tv_redes_wifi;
  `);
  return result.recordset[0]?.proxima ?? 0;
}

export interface CriarRedeWifiParams {
  ssid: string;
  senha: string;
  atualizadoPor: string;
}

export async function criarRedeWifi(params: CriarRedeWifiParams): Promise<RedeWifi> {
  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .input("ssid", sql.NVarChar(64), params.ssid)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS [total] FROM dbo.portal_tv_redes_wifi WHERE [ssid] = @ssid;
    `);

  if (existente.recordset[0].total > 0) {
    throw new ValidationError(`Já existe uma rede cadastrada com o SSID "${params.ssid}".`);
  }

  const prioridade = await proximaPrioridade(pool);

  const result = await pool
    .request()
    .input("ssid", sql.NVarChar(64), params.ssid)
    .input("senhaCifrada", sql.VarBinary(512), criptografarSegredo(params.senha))
    .input("prioridade", sql.Int, prioridade)
    .input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor)
    .query<{ id: string }>(`
      INSERT INTO dbo.portal_tv_redes_wifi
        ([ssid], [senha_cifrada], [prioridade], [atualizado_por])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@ssid, @senhaCifrada, @prioridade, @atualizadoPor);
    `);

  const criada = await buscarRedeWifiPorId(result.recordset[0].id);
  if (!criada) throw new Error("Rede Wi-Fi criada mas não encontrada logo em seguida.");
  return criada;
}

export interface AtualizarRedeWifiParams {
  ssid?: string;
  /* null/undefined = mantém a senha já cifrada gravada (mesmo padrão de AtualizarCameraParams). */
  senha?: string | null;
  ativa?: boolean;
  prioridade?: number;
  atualizadoPor: string;
}

export async function atualizarRedeWifi(id: string, dados: AtualizarRedeWifiParams): Promise<RedeWifi> {
  const pool = await getSqlServerPool();

  if (dados.ssid !== undefined) {
    const existente = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("ssid", sql.NVarChar(64), dados.ssid)
      .query<{ total: number }>(`
        SELECT COUNT(*) AS [total] FROM dbo.portal_tv_redes_wifi WHERE [ssid] = @ssid AND [id] <> @id;
      `);

    if (existente.recordset[0].total > 0) {
      throw new ValidationError(`Já existe uma rede cadastrada com o SSID "${dados.ssid}".`);
    }
  }

  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const sets: string[] = [];

  if (dados.ssid !== undefined) {
    request.input("ssid", sql.NVarChar(64), dados.ssid);
    sets.push("[ssid] = @ssid");
  }
  if (dados.senha) {
    request.input("senhaCifrada", sql.VarBinary(512), criptografarSegredo(dados.senha));
    sets.push("[senha_cifrada] = @senhaCifrada");
  }
  if (dados.ativa !== undefined) {
    request.input("ativa", sql.Bit, dados.ativa);
    sets.push("[ativa] = @ativa");
  }
  if (dados.prioridade !== undefined) {
    request.input("prioridade", sql.Int, dados.prioridade);
    sets.push("[prioridade] = @prioridade");
  }

  if (sets.length > 0) {
    request.input("atualizadoPor", sql.NVarChar(150), dados.atualizadoPor);
    sets.push("[atualizado_em] = SYSDATETIME()", "[atualizado_por] = @atualizadoPor");

    await request.query(`
      UPDATE dbo.portal_tv_redes_wifi
      SET ${sets.join(", ")}
      WHERE [id] = @id;
    `);
  }

  const atualizada = await buscarRedeWifiPorId(id);
  if (!atualizada) throw new ValidationError("Rede Wi-Fi não encontrada.");
  return atualizada;
}

export async function excluirRedeWifi(id: string): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`DELETE FROM dbo.portal_tv_redes_wifi WHERE [id] = @id;`);
}
