/*
 * Valida o parâmetro "next" usado para voltar à página de
 * origem depois do login. `valor.startsWith("/")` sozinho
 * também aceita URLs "protocol-relative" como "//evil.com"
 * (o navegador trata como http(s)://evil.com) — usado tanto no
 * lado servidor (app/login/page.tsx) quanto no cliente
 * (LoginModal.tsx), por isso não importa nada server-only.
 */
export function proximaRotaSegura(valor: string | null | undefined): string {
  if (!valor || !valor.startsWith("/")) {
    return "/";
  }

  try {
    const url = new URL(valor, "http://localhost");
    return url.origin === "http://localhost"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
}
