import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

/*
 * Token de dispositivo — irmão de src/lib/auth/jwt.ts, não extensão
 * dele: sujeito (terminal, não sam_account_name), tabela de apoio
 * (portal_tv_terminais, não portal_usuarios) e superfície de confiança
 * são completamente diferentes de uma sessão humana. Usa um secret
 * próprio (TV_TERMINAL_TOKEN_SECRET) — nunca reaproveitar
 * AUTH_SESSION_SECRET, pra um vazamento de um não comprometer o outro.
 *
 * Sem expiração (terminal é um processo não-interativo, não tem como
 * "relogar" sozinho) — revogação é feita via revogado_em na tabela,
 * comparado contra o iat do token, mesmo truque já usado pra sessão
 * humana (sessaoInvalidadaEm vs iat em autorizacao.ts).
 */
export interface TerminalTokenPayload {
  terminalId: string;
  iat: number;
}

function getTerminalTokenSecretKey(): Uint8Array {
  const secret = process.env.TV_TERMINAL_TOKEN_SECRET;

  if (!secret) {
    throw new Error(
      "A variável de ambiente TV_TERMINAL_TOKEN_SECRET não foi configurada."
    );
  }

  return new TextEncoder().encode(secret);
}

export async function criarTokenTerminal(terminalId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(terminalId)
    .setIssuedAt()
    .sign(getTerminalTokenSecretKey());
}

export async function verificarTokenTerminal(
  token: string
): Promise<TerminalTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getTerminalTokenSecretKey());

    if (typeof payload.sub !== "string" || typeof payload.iat !== "number") {
      return null;
    }

    return { terminalId: payload.sub, iat: payload.iat };
  } catch {
    return null;
  }
}

/*
 * Token de visualização — autoriza o servidor de sinalização (processo
 * Node separado, sem acesso ao banco nem à sessão de admin) a aceitar
 * uma conexão como "espectador" de um terminal específico. Emitido só
 * depois de passar por requireAdminApi() (ver
 * POST /api/admin/tv/terminais/[id]/visualizar), curta duração (evita
 * reaproveitar o token depois que o admin fechou a tela de
 * visualização), mesmo secret do token de dispositivo — o campo
 * `role: "viewer"` é o que distingue das duas formas no servidor de
 * sinalização (token de terminal nunca tem esse campo).
 */
export interface TokenVisualizacaoPayload {
  terminalId: string;
}

export async function criarTokenVisualizacao(terminalId: string): Promise<string> {
  return new SignJWT({ role: "viewer" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(terminalId)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(getTerminalTokenSecretKey());
}

/*
 * Só o hash vai pro banco (token_hash) — o valor em claro é devolvido
 * uma única vez na resposta do pareamento e nunca mais é recuperável,
 * mesmo hash usado depois pra confirmar qualquer verificação futura
 * que precise comparar contra o banco (a verificação de assinatura JWT
 * já basta pra rotas normais; o hash existe só como referência
 * auditável de "qual token está ativo" no admin).
 */
export function hashTokenTerminal(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/* Código de pareamento de 6 dígitos, exibido na tela do terminal. */
export function gerarCodigoPareamento(): string {
  const numero = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(numero).padStart(6, "0");
}
