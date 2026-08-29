/*
 * Lista estática (não vem do banco) das rotas acessíveis sem
 * login algum. É deliberadamente pequena e curada em código —
 * o proxy.ts hoje já roda em runtime Node e poderia consultar o
 * SQL Server pra isso, mas não vale a pena: essa lista raramente
 * muda, e mantê-la em código evita depender do banco só pra
 * decidir se uma rota exige login.
 *
 * O acesso público/restrito de cada FERRAMENTA (módulo) é uma
 * decisão separada, guardada em `portal_modulos` e aplicada no
 * layout de cada módulo (ver src/lib/auth/autorizacao.ts).
 */

const ROTAS_PUBLICAS_EXATAS = new Set<string>(["/", "/login", "/manutencao"]);

const PREFIXOS_PUBLICOS = [
  "/atualizacoes",
  "/downloads",
  "/api/downloads",
  "/api/auth",
  /*
   * Terminal de fábrica: kiosk de uso compartilhado no chão de
   * fábrica, sem usuário logado (ver src/app/terminal-fabrica).
   */
  "/terminal-fabrica",
  "/api/terminal-fabrica",
  /*
   * Chamados: qualquer pessoa abre um chamado sem precisar de
   * login (ver src/app/chamados e o plano de implementação do
   * módulo). `/chamados/atender` e `/api/chamados/fila`, apesar
   * do prefixo, exigem autenticação e o papel de atendente — a
   * checagem é feita dentro da própria rota/página
   * (requireAtendenteChamados), não aqui.
   */
  "/chamados",
  "/api/chamados",
];

export function ehRotaPublica(pathname: string): boolean {
  if (ROTAS_PUBLICAS_EXATAS.has(pathname)) {
    return true;
  }

  return PREFIXOS_PUBLICOS.some(
    (prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`)
  );
}
