import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { criptografarSegredo, descriptografarSegredo } from "@/lib/crypto/segredo";

import { ValidationError } from "./errors";

/*
 * Configuração completa, com a senha da conta de serviço já
 * decifrada — só deve circular dentro do backend (LDAP), nunca
 * ser serializada para o cliente.
 */
export interface ConfiguracaoAd {
  url: string;
  baseDn: string;
  usuarioServico: string;
  senhaServico: string;
  grupoAdminDn: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

/*
 * Versão segura para expor na tela de administração — nunca
 * inclui a senha, só sinaliza se já existe uma configurada.
 */
export interface ConfiguracaoAdSemSenha {
  url: string;
  baseDn: string;
  usuarioServico: string;
  senhaConfigurada: boolean;
  grupoAdminDn: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

interface ConfiguracaoAdRow {
  url: string;
  base_dn: string;
  usuario_servico: string;
  senha_servico_cifrada: Buffer;
  grupo_admin_dn: string;
  atualizado_em: Date;
  atualizado_por: string | null;
}

const colunasConfiguracao = `
  [url],
  [base_dn],
  [usuario_servico],
  [senha_servico_cifrada],
  [grupo_admin_dn],
  [atualizado_em],
  [atualizado_por]
`;

export async function getConfiguracaoAd(): Promise<ConfiguracaoAd | null> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ConfiguracaoAdRow>(`
    SELECT ${colunasConfiguracao}
    FROM dbo.portal_configuracao_ad
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (!row) {
    return null;
  }

  return {
    url: row.url,
    baseDn: row.base_dn,
    usuarioServico: row.usuario_servico,
    senhaServico: descriptografarSegredo(row.senha_servico_cifrada),
    grupoAdminDn: row.grupo_admin_dn,
    atualizadoEm: row.atualizado_em.toISOString(),
    atualizadoPor: row.atualizado_por,
  };
}

export async function getConfiguracaoAdSemSenha(): Promise<
  ConfiguracaoAdSemSenha | null
> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<
    Omit<ConfiguracaoAdRow, "senha_servico_cifrada">
  >(`
    SELECT [url], [base_dn], [usuario_servico], [grupo_admin_dn], [atualizado_em], [atualizado_por]
    FROM dbo.portal_configuracao_ad
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (!row) {
    return null;
  }

  return {
    url: row.url,
    baseDn: row.base_dn,
    usuarioServico: row.usuario_servico,
    senhaConfigurada: true,
    grupoAdminDn: row.grupo_admin_dn,
    atualizadoEm: row.atualizado_em.toISOString(),
    atualizadoPor: row.atualizado_por,
  };
}

export async function salvarConfiguracaoAd(params: {
  url: string;
  baseDn: string;
  usuarioServico: string;
  /* null = manter a senha já cadastrada sem alterá-la. */
  senhaServico: string | null;
  grupoAdminDn: string;
  atualizadoPor: string;
}): Promise<ConfiguracaoAdSemSenha> {
  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .query<{ id: number }>(
      `SELECT [id] FROM dbo.portal_configuracao_ad WHERE [id] = 1;`
    );

  const jaConfigurado = existente.recordset.length > 0;

  if (!jaConfigurado && !params.senhaServico) {
    throw new ValidationError(
      "Informe a senha da conta de serviço na primeira configuração do AD."
    );
  }

  const request = pool.request();

  request.input("url", sql.NVarChar(200), params.url);
  request.input("baseDn", sql.NVarChar(300), params.baseDn);
  request.input("usuarioServico", sql.NVarChar(150), params.usuarioServico);
  request.input("grupoAdminDn", sql.NVarChar(300), params.grupoAdminDn);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  if (params.senhaServico) {
    request.input(
      "senhaServicoCifrada",
      sql.VarBinary(512),
      criptografarSegredo(params.senhaServico)
    );
  }

  const query = jaConfigurado
    ? `
      UPDATE dbo.portal_configuracao_ad
      SET
        [url] = @url,
        [base_dn] = @baseDn,
        [usuario_servico] = @usuarioServico,
        [grupo_admin_dn] = @grupoAdminDn,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
        ${params.senhaServico ? ", [senha_servico_cifrada] = @senhaServicoCifrada" : ""}
      OUTPUT
        INSERTED.[url],
        INSERTED.[base_dn],
        INSERTED.[usuario_servico],
        INSERTED.[grupo_admin_dn],
        INSERTED.[atualizado_em],
        INSERTED.[atualizado_por]
      WHERE [id] = 1;
    `
    : `
      INSERT INTO dbo.portal_configuracao_ad
        ([id], [url], [base_dn], [usuario_servico], [senha_servico_cifrada], [grupo_admin_dn], [atualizado_por])
      OUTPUT
        INSERTED.[url],
        INSERTED.[base_dn],
        INSERTED.[usuario_servico],
        INSERTED.[grupo_admin_dn],
        INSERTED.[atualizado_em],
        INSERTED.[atualizado_por]
      VALUES
        (1, @url, @baseDn, @usuarioServico, @senhaServicoCifrada, @grupoAdminDn, @atualizadoPor);
    `;

  const result = await request.query<
    Omit<ConfiguracaoAdRow, "senha_servico_cifrada">
  >(query);

  const row = result.recordset[0];

  return {
    url: row.url,
    baseDn: row.base_dn,
    usuarioServico: row.usuario_servico,
    senhaConfigurada: true,
    grupoAdminDn: row.grupo_admin_dn,
    atualizadoEm: row.atualizado_em.toISOString(),
    atualizadoPor: row.atualizado_por,
  };
}
