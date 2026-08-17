import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

interface RegistrarTentativaLoginParams {
  usuarioId: string | null;
  samAccountNameTentado: string;
  sucesso: boolean;
  motivoFalha?: string | null;
  ipOrigem?: string | null;
  userAgent?: string | null;
}

/*
 * Registra toda tentativa de login (sucesso ou falha),
 * inclusive quando o usuário digitado nem existe no AD
 * (usuarioId fica NULL nesse caso). Usado pela tela
 * "Minha Conta" para o usuário ver o próprio histórico.
 *
 * Falha ao registrar o histórico não deve impedir o login
 * — por isso os erros são só logados, nunca propagados.
 */
export async function registrarTentativaLogin(
  params: RegistrarTentativaLoginParams
): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("usuarioId", sql.UniqueIdentifier, params.usuarioId);

    request.input(
      "samAccountNameTentado",
      sql.NVarChar(150),
      params.samAccountNameTentado.toLowerCase()
    );

    request.input("sucesso", sql.Bit, params.sucesso);

    request.input(
      "motivoFalha",
      sql.NVarChar(200),
      params.motivoFalha ?? null
    );

    request.input("ipOrigem", sql.VarChar(64), params.ipOrigem ?? null);

    request.input(
      "userAgent",
      sql.NVarChar(300),
      params.userAgent ?? null
    );

    await request.query(`
      INSERT INTO dbo.portal_login_historico
        ([usuario_id], [sam_account_name_tentado], [sucesso], [motivo_falha], [ip_origem], [user_agent])
      VALUES
        (@usuarioId, @samAccountNameTentado, @sucesso, @motivoFalha, @ipOrigem, @userAgent);
    `);
  } catch (error) {
    console.error("Erro ao registrar histórico de login:", error);
  }
}

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;

/*
 * Só IPv4 é considerado — descarta IPv6 puro (ex: "::1") e
 * extrai o endereço real de IPv4 mapeado em IPv6 (ex:
 * "::ffff:192.168.1.10"). Aplicado tanto na captura (novos
 * logins, aqui) quanto na leitura (listarHistoricoDoUsuario),
 * para o comportamento ficar consistente independente de
 * quando o registro foi gravado.
 */
function normalizarIpv4(valor: string | null): string | null {
  if (!valor) return null;

  const semPrefixoV6 = valor.trim().replace(/^::ffff:/i, "");

  return IPV4_PATTERN.test(semPrefixoV6) ? semPrefixoV6 : null;
}

export function extrairIpOrigem(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");

  const candidato = forwardedFor
    ? (forwardedFor.split(",")[0]?.trim() ?? null)
    : request.headers.get("x-real-ip");

  return normalizarIpv4(candidato);
}

export interface TentativaLoginHistorico {
  id: string;
  sucesso: boolean;
  motivoFalha: string | null;
  ipOrigem: string | null;
  criadoEm: string;
}

/*
 * Histórico usado pela tela "Minha Conta". Casa por
 * usuario_id (sempre preenchido em tentativas bem-sucedidas)
 * OU por sam_account_name_tentado, para incluir tentativas
 * com senha errada anteriores ao primeiro login bem-sucedido
 * (quando ainda não existia um usuario_id).
 */
export async function listarHistoricoDoUsuario(
  usuarioId: string,
  samAccountName: string
): Promise<TentativaLoginHistorico[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);
  request.input("samAccountName", sql.NVarChar(150), samAccountName.toLowerCase());

  const result = await request.query<TentativaLoginHistorico>(`
    SELECT TOP (50)
      CONVERT(VARCHAR(36), [id]) AS [id],
      CAST([sucesso] AS BIT) AS [sucesso],
      [motivo_falha] AS [motivoFalha],
      [ip_origem] AS [ipOrigem],
      CONVERT(VARCHAR(33), [criado_em], 126) AS [criadoEm]
    FROM dbo.portal_login_historico
    WHERE [usuario_id] = @usuarioId
       OR [sam_account_name_tentado] = @samAccountName
    ORDER BY [criado_em] DESC;
  `);

  return result.recordset.map((row) => ({
    ...row,
    ipOrigem: normalizarIpv4(row.ipOrigem),
  }));
}
