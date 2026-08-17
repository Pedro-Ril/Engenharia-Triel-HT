import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ehRotaPublica } from "@/lib/auth/rotas-publicas";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";

/*
 * "Proxy" (nome atual do antigo "middleware" no Next.js 16) só
 * confere se a rota exige login e, se exigir, se o cookie de
 * sessão é válido. Não faz autorização por ferramenta — isso é
 * responsabilidade do layout de cada módulo restrito
 * (src/lib/auth/autorizacao.ts), que consulta o SQL Server a
 * cada requisição, sempre com o dado mais atual.
 *
 * A lista de rotas públicas é estática e curada em código
 * (src/lib/auth/rotas-publicas.ts) — não vem do banco. É
 * pequena o suficiente para não valer a pena buscar do SQL
 * Server a cada navegação, o que também evitaria ter que lidar
 * com cache/invalidação aqui.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2)$).*)",
  ],
};
