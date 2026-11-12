import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { criptografarSegredo, descriptografarSegredo } from "@/lib/crypto/segredo";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface ConfigTv {
  diretorioMidias: string | null;
  signalingUrl: string | null;
  urlAgente: string | null;
  /* Só se existe -- a senha do VNC nunca sai para o navegador do admin (ver buscarSenhaVncParaAgente). */
  vncSenhaDefinida: boolean;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

interface ConfigTvRow {
  diretorio_midias: string | null;
  signaling_url: string | null;
  url_agente: string | null;
  vnc_senha_definida: boolean;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

const CONFIG_PADRAO: ConfigTv = {
  diretorioMidias: null,
  signalingUrl: null,
  urlAgente: null,
  vncSenhaDefinida: false,
  atualizadoEm: null,
  atualizadoPor: null,
};

export async function buscarConfigTv(): Promise<ConfigTv> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ConfigTvRow>(`
    SELECT
      [diretorio_midias],
      [signaling_url],
      [url_agente],
      CAST(CASE WHEN [vnc_senha_cifrada] IS NULL THEN 0 ELSE 1 END AS BIT) AS [vnc_senha_definida],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.portal_tv_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];
  if (!row) return CONFIG_PADRAO;

  return {
    diretorioMidias: row.diretorio_midias,
    signalingUrl: row.signaling_url,
    urlAgente: row.url_agente,
    vncSenhaDefinida: row.vnc_senha_definida,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

export async function salvarConfigTv(params: {
  diretorioMidias: string;
  signalingUrl: string | null;
  urlAgente: string | null;
  atualizadoPor: string;
}): Promise<ConfigTv> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("diretorioMidias", sql.NVarChar(500), params.diretorioMidias);
  request.input("signalingUrl", sql.NVarChar(300), params.signalingUrl);
  request.input("urlAgente", sql.NVarChar(300), params.urlAgente);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  await request.query(`
    MERGE INTO dbo.portal_tv_config AS destino
    USING (SELECT 1 AS [id]) AS origem
      ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [diretorio_midias] = @diretorioMidias,
        [signaling_url] = @signalingUrl,
        [url_agente] = @urlAgente,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [diretorio_midias], [signaling_url], [url_agente], [atualizado_em], [atualizado_por])
      VALUES (1, @diretorioMidias, @signalingUrl, @urlAgente, SYSDATETIME(), @atualizadoPor);
  `);

  return buscarConfigTv();
}

/*
 * Acesso remoto (VNC) aos terminais Linux -- ver tv-agente/agente.mjs
 * (x11vnc). O protocolo VNC só usa os 8 primeiros caracteres da senha,
 * por isso o limite: aceitar mais daria a impressão de uma senha mais
 * forte do que ela realmente é.
 */
export const VNC_SENHA_MINIMO = 6;
export const VNC_SENHA_MAXIMO = 8;

export function validarSenhaVnc(valor: unknown): string {
  if (typeof valor !== "string" || valor.length < VNC_SENHA_MINIMO || valor.length > VNC_SENHA_MAXIMO) {
    throw new ValidationError(
      `A senha do VNC deve ter de ${VNC_SENHA_MINIMO} a ${VNC_SENHA_MAXIMO} caracteres (o VNC só usa os 8 primeiros).`
    );
  }

  if (!/^[!-~]+$/.test(valor)) {
    throw new ValidationError("A senha do VNC aceita só letras, números e símbolos, sem espaço nem acento.");
  }

  return valor;
}

/* null = desliga o VNC em todos os terminais (no próximo ciclo de configuração do agente). */
export async function salvarSenhaVncTv(senha: string | null, atualizadoPor: string): Promise<ConfigTv> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("senhaCifrada", sql.VarBinary(512), senha ? criptografarSegredo(senha) : null);
  request.input("atualizadoPor", sql.NVarChar(150), atualizadoPor);

  await request.query(`
    MERGE INTO dbo.portal_tv_config AS destino
    USING (SELECT 1 AS [id]) AS origem
      ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [vnc_senha_cifrada] = @senhaCifrada,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [vnc_senha_cifrada], [atualizado_em], [atualizado_por])
      VALUES (1, @senhaCifrada, SYSDATETIME(), @atualizadoPor);
  `);

  return buscarConfigTv();
}

/* Senha decifrada -- só para o agente do terminal (GET /api/tv/agente/config), nunca para o navegador. */
export async function buscarSenhaVncParaAgente(): Promise<string | null> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ vnc_senha_cifrada: Buffer | null }>(`
    SELECT [vnc_senha_cifrada] FROM dbo.portal_tv_config WHERE [id] = 1;
  `);

  const cifrada = result.recordset[0]?.vnc_senha_cifrada;
  return cifrada ? descriptografarSegredo(cifrada) : null;
}
