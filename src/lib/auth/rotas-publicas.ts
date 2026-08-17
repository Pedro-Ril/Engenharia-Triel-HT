/*
 * Lista estática (não vem do banco) das rotas acessíveis sem
 * login algum. É deliberadamente pequena e curada em código —
 * ver decisão de arquitetura no plano de implementação: o
 * middleware não pode depender do SQL Server (não roda no
 * runtime Node) nem é seguro cachear uma lista dinâmica sem
 * uma invalidação própria.
 *
 * O acesso público/restrito de cada FERRAMENTA (módulo) é uma
 * decisão separada, guardada em `portal_modulos` e aplicada no
 * layout de cada módulo (ver src/lib/auth/autorizacao.ts).
 */

const ROTAS_PUBLICAS_EXATAS = new Set<string>(["/", "/login"]);

const PREFIXOS_PUBLICOS = ["/atualizacoes", "/downloads", "/api/auth"];

export function ehRotaPublica(pathname: string): boolean {
  if (ROTAS_PUBLICAS_EXATAS.has(pathname)) {
    return true;
  }

  return PREFIXOS_PUBLICOS.some(
    (prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`)
  );
}
