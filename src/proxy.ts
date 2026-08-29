import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buscarStatusManutencaoCache } from "@/lib/auth/manutencao";
import { ehRotaPublica } from "@/lib/auth/rotas-publicas";
import { validarSessaoUsuario } from "@/lib/auth/autorizacao";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";

/*
 * "Proxy" (nome atual do antigo "middleware" no Next.js 16) sempre
 * roda em runtime Node (confirmado em build: "Route segment config
 * is not allowed in Proxy file... Proxy always runs on Node.js
 * runtime") — por isso dá pra consultar o SQL Server aqui direto,
 * diferente do antigo middleware em runtime edge. Duas
 * responsabilidades:
 *
 * 1. Modo manutenção: se estiver ativo, bloqueia todo mundo que não
 *    for administrador (ver Administração → Configurações →
 *    Manutenção). Só verifica de fato (JWT + banco) quando o modo
 *    está ligado — com o modo desligado (o caso comum) o custo
 *    extra é só ler o cache de 5s do status, sem round-trip por
 *    requisição.
 * 2. Sessão: confere se a rota exige login e, se exigir, se o
 *    cookie de sessão é válido. Não faz autorização por
 *    ferramenta — isso é responsabilidade do layout de cada módulo
 *    restrito (src/lib/auth/autorizacao.ts), que consulta o SQL
 *    Server de novo a cada requisição, sempre com o dado mais
 *    atual.
 *
 * A lista de rotas públicas é estática e curada em código
 * (src/lib/auth/rotas-publicas.ts) — não vem do banco.
 */
const ROTAS_LIVRES_DE_MANUTENCAO = ["/login", "/manutencao", "/api/auth"];

function ehRotaLivreDeManutencao(pathname: string): boolean {
  return ROTAS_LIVRES_DE_MANUTENCAO.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  try {
    const manutencao = await buscarStatusManutencaoCache();

    if (manutencao.ativo && !ehRotaLivreDeManutencao(pathname)) {
      const tokenManutencao = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      const sessaoManutencao = tokenManutencao
        ? await verifySessionToken(tokenManutencao)
        : null;
      const usuarioManutencao = sessaoManutencao
        ? await validarSessaoUsuario(sessaoManutencao)
        : null;

      if (!usuarioManutencao?.ehAdministrador) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { ok: false, message: manutencao.mensagem ?? "Sistema em manutenção." },
            { status: 503 }
          );
        }

        return NextResponse.redirect(new URL("/manutencao", request.url));
      }
    }
  } catch (error) {
    /*
     * Se a checagem de manutenção falhar (ex: banco fora do ar), não
     * trava o portal inteiro por causa disso — segue o fluxo normal
     * de sessão abaixo. O banco já é necessário pra quase tudo, então
     * um problema aqui vai aparecer de outro jeito de qualquer forma.
     */
    console.error("Erro ao checar modo manutenção no proxy:", error);
  }

  if (ehRotaPublica(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verifySessionToken(token) : null;

  if (sessao) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, message: "É necessário estar autenticado." },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);

  /*
   * Só marca "sessão expirada" quando havia mesmo um cookie (que
   * falhou na verificação — expirado, assinatura inválida, etc.).
   * Sem cookie nenhum é só alguém nunca logado abrindo um link
   * direto; a mensagem "sua sessão expirou" não faria sentido aí.
   */
  if (token) {
    loginUrl.searchParams.set("motivo", "sessao_expirada");
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2)$).*)",
  ],
};
