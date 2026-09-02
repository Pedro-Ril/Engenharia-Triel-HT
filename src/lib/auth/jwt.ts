import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "portal_sessao";

/*
 * `secure: process.env.NODE_ENV === "production"` parecia certo, mas
 * "production" é o que o Next SEMPRE assume rodando via `next start`
 * — mesmo quando o servidor está exposto direto em HTTP puro (sem
 * Nginx/IIS terminando TLS na frente), como no deploy inicial deste
 * portal na porta 80. Um cookie "Secure" setado numa resposta HTTP
 * (não HTTPS) é descartado pelo navegador sem aviso nenhum — o login
 * parecia funcionar (a API respondia 200), mas a sessão nunca era
 * salva, e a navegação seguinte caía direto de volta pro /login.
 * Em vez de amarrar isso a NODE_ENV, olha o protocolo real da
 * requisição — e o cabeçalho X-Forwarded-Proto, pro dia em que um
 * proxy reverso (Nginx/IIS) passar a terminar HTTPS na frente do
 * Node (aí o Node só vê HTTP internamente, mas o proxy avisa nesse
 * cabeçalho que o cliente usou HTTPS de verdade).
 */
export function deveUsarCookieSeguro(request: Request): boolean {
  if (request.headers.get("x-forwarded-proto") === "https") {
    return true;
  }

  return new URL(request.url).protocol === "https:";
}

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
