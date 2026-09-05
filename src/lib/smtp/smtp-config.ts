import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { criptografarSegredo, descriptografarSegredo } from "@/lib/crypto/segredo";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export type CriptografiaSmtp = "nenhuma" | "ssl" | "tls";

/*
 * Configuração completa, com a senha já decifrada — só deve circular
 * dentro do backend (envio de e-mail), nunca ser serializada para o
 * cliente.
 */
export interface ConfiguracaoSmtp {
  host: string;
  porta: number;
  criptografia: CriptografiaSmtp;
  autenticacaoAtiva: boolean;
  usuario: string | null;
  senha: string | null;
  remetenteNome: string | null;
  remetenteEmail: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

/*
 * Versão segura para expor na tela de administração — nunca inclui
 * a senha, só sinaliza se já existe uma configurada.
 */
export interface ConfiguracaoSmtpSemSenha {
  host: string;
  porta: number;
  criptografia: CriptografiaSmtp;
  autenticacaoAtiva: boolean;
  usuario: string | null;
  senhaConfigurada: boolean;
  remetenteNome: string | null;
  remetenteEmail: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

interface ConfiguracaoSmtpRow {
  host: string;
  porta: number;
  criptografia: CriptografiaSmtp;
  autenticacao_ativa: boolean;
  usuario: string | null;
  senha_cifrada: Buffer | null;
  remetente_nome: string | null;
  remetente_email: string;
  atualizado_em: Date;
  atualizado_por: string | null;
}

const colunasConfiguracao = `
  [host],
  [porta],
  [criptografia],
  CAST([autenticacao_ativa] AS BIT) AS [autenticacao_ativa],
  [usuario],
  [senha_cifrada],
  [remetente_nome],
  [remetente_email],
  [atualizado_em],
  [atualizado_por]
`;

export async function getConfiguracaoSmtp(): Promise<ConfiguracaoSmtp | null> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ConfiguracaoSmtpRow>(`
    SELECT ${colunasConfiguracao}
    FROM dbo.portal_configuracao_smtp
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (!row) {
    return null;
  }

  return {
    host: row.host,
    porta: row.porta,
    criptografia: row.criptografia,
    autenticacaoAtiva: row.autenticacao_ativa,
    usuario: row.usuario,
    senha: row.senha_cifrada ? descriptografarSegredo(row.senha_cifrada) : null,
    remetenteNome: row.remetente_nome,
    remetenteEmail: row.remetente_email,
    atualizadoEm: row.atualizado_em.toISOString(),
    atualizadoPor: row.atualizado_por,
  };
}

export async function getConfiguracaoSmtpSemSenha(): Promise<ConfiguracaoSmtpSemSenha | null> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<Omit<ConfiguracaoSmtpRow, "senha_cifrada">>(`
    SELECT
      [host], [porta], [criptografia],
      CAST([autenticacao_ativa] AS BIT) AS [autenticacao_ativa],
      [usuario], [remetente_nome], [remetente_email], [atualizado_em], [atualizado_por]
    FROM dbo.portal_configuracao_smtp
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (!row) {
    return null;
  }

  return {
    host: row.host,
    porta: row.porta,
    criptografia: row.criptografia,
    autenticacaoAtiva: row.autenticacao_ativa,
    usuario: row.usuario,
    senhaConfigurada: true,
    remetenteNome: row.remetente_nome,
    remetenteEmail: row.remetente_email,
    atualizadoEm: row.atualizado_em.toISOString(),
    atualizadoPor: row.atualizado_por,
  };
}

export async function salvarConfiguracaoSmtp(params: {
  host: string;
  porta: number;
  criptografia: CriptografiaSmtp;
  autenticacaoAtiva: boolean;
  usuario: string | null;
  /* null = manter a senha já cadastrada sem alterá-la. */
  senha: string | null;
  remetenteNome: string | null;
  remetenteEmail: string;
  atualizadoPor: string;
}): Promise<ConfiguracaoSmtpSemSenha> {
  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .query<{ id: number }>(`SELECT [id] FROM dbo.portal_configuracao_smtp WHERE [id] = 1;`);

  const jaConfigurado = existente.recordset.length > 0;

  if (params.autenticacaoAtiva && !params.usuario) {
    throw new ValidationError("Informe o usuário para autenticar no servidor SMTP.");
  }

  if (params.autenticacaoAtiva && !jaConfigurado && !params.senha) {
    throw new ValidationError("Informe a senha na primeira configuração do SMTP.");
  }

  const request = pool.request();

  request.input("host", sql.NVarChar(200), params.host);
  request.input("porta", sql.Int, params.porta);
  request.input("criptografia", sql.VarChar(10), params.criptografia);
  request.input("autenticacaoAtiva", sql.Bit, params.autenticacaoAtiva);
  request.input("usuario", sql.NVarChar(200), params.usuario);
  request.input("remetenteNome", sql.NVarChar(150), params.remetenteNome);
  request.input("remetenteEmail", sql.NVarChar(256), params.remetenteEmail);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  if (params.senha) {
    request.input("senhaCifrada", sql.VarBinary(512), criptografarSegredo(params.senha));
  } else if (!jaConfigurado) {
    /*
     * Precisa existir mesmo vazio na primeira gravação (INSERT sempre
     * referencia @senhaCifrada nas VALUES) — cenário legítimo quando
     * o servidor SMTP não exige autenticação nenhuma. No UPDATE isso
     * não é necessário: a query nem inclui essa coluna quando a senha
     * não foi redigitada (ver "query" abaixo), preservando o que já
     * estava salvo.
     */
    request.input("senhaCifrada", sql.VarBinary(512), null);
  }

  const query = jaConfigurado
    ? `
      UPDATE dbo.portal_configuracao_smtp
      SET
        [host] = @host,
        [porta] = @porta,
        [criptografia] = @criptografia,
        [autenticacao_ativa] = @autenticacaoAtiva,
        [usuario] = @usuario,
        [remetente_nome] = @remetenteNome,
        [remetente_email] = @remetenteEmail,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
        ${params.senha ? ", [senha_cifrada] = @senhaCifrada" : ""}
      OUTPUT
        INSERTED.[host], INSERTED.[porta], INSERTED.[criptografia],
        CAST(INSERTED.[autenticacao_ativa] AS BIT) AS [autenticacao_ativa],
        INSERTED.[usuario], INSERTED.[remetente_nome], INSERTED.[remetente_email],
        INSERTED.[atualizado_em], INSERTED.[atualizado_por]
      WHERE [id] = 1;
    `
    : `
      INSERT INTO dbo.portal_configuracao_smtp
        ([id], [host], [porta], [criptografia], [autenticacao_ativa], [usuario], [senha_cifrada], [remetente_nome], [remetente_email], [atualizado_por])
      OUTPUT
        INSERTED.[host], INSERTED.[porta], INSERTED.[criptografia],
        CAST(INSERTED.[autenticacao_ativa] AS BIT) AS [autenticacao_ativa],
        INSERTED.[usuario], INSERTED.[remetente_nome], INSERTED.[remetente_email],
        INSERTED.[atualizado_em], INSERTED.[atualizado_por]
      VALUES
        (1, @host, @porta, @criptografia, @autenticacaoAtiva, @usuario, @senhaCifrada, @remetenteNome, @remetenteEmail, @atualizadoPor);
    `;

  const result = await request.query<Omit<ConfiguracaoSmtpRow, "senha_cifrada">>(query);
  const row = result.recordset[0];

  return {
    host: row.host,
    porta: row.porta,
    criptografia: row.criptografia,
    autenticacaoAtiva: row.autenticacao_ativa,
    usuario: row.usuario,
    senhaConfigurada: true,
    remetenteNome: row.remetente_nome,
    remetenteEmail: row.remetente_email,
    atualizadoEm: row.atualizado_em.toISOString(),
    atualizadoPor: row.atualizado_por,
  };
}
