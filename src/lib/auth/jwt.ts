import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "portal_sessao";

/*
 * O token guarda só identidade (quem você é), nunca
 * permissões. `eh_administrador` e o acesso por módulo
 * são sempre consultados frescos no banco a cada
 * requisição — ver src/lib/auth/autorizacao.ts.
 */
export interface NovaSessaoPayload {
  sub: string;
  nomeExibicao: string;
  email: string | null;
}

export interface SessionPayload extends NovaSessaoPayload {
  /* Unix seconds — usado para checar sessao_invalidada_em. */
  iat: number;
}

function getSessionSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "A variável de ambiente AUTH_SESSION_SECRET não foi configurada."
    );
  }

  return new TextEncoder().encode(secret);
}

function getSessionTtlSeconds(): number {
  const horas = Number(process.env.AUTH_SESSION_TTL_HOURS);
  const horasValidas = Number.isFinite(horas) && horas > 0 ? horas : 10;

  return horasValidas * 60 * 60;
}

export async function createSessionToken(
  payload: NovaSessaoPayload
): Promise<{ token: string; expiraEmSegundos: number }> {
  const expiraEmSegundos = getSessionTtlSeconds();

  const token = await new SignJWT({
    nomeExibicao: payload.nomeExibicao,
    email: payload.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${expiraEmSegundos}s`)
    .sign(getSessionSecretKey());

  return { token, expiraEmSegundos };
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecretKey());

    if (typeof payload.sub !== "string" || typeof payload.iat !== "number") {
      return null;
    }

    return {
      sub: payload.sub,
      nomeExibicao:
        typeof payload.nomeExibicao === "string" ? payload.nomeExibicao : "",
      email: typeof payload.email === "string" ? payload.email : null,
      iat: payload.iat,
    };
  } catch {
    return null;
  }
}
