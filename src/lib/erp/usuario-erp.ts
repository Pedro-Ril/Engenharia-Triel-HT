/*
 * Auditoria no ERP: as rotas de escrita da API Oracle aceitam o header
 * X-Usuario-Portal e gravam esse login (em maiúsculas) no lugar de "API"
 * -- em TROTEIRO.ALTERADO_POR ({Login:PEDRO.RIL}{Prog:PORTAL}...) e nos logs
 * F3I_LOG_* (roteiro, fator de conversão, peso do item). Sem o header, o
 * ERP continua gravando "API".
 *
 * O valor vem sempre da SESSÃO do Portal (sam_account_name do AD), no
 * servidor: nunca do navegador, que poderia mandar o nome de outra pessoa.
 */
export const HEADER_USUARIO_PORTAL = "X-Usuario-Portal";

/* O formato que a API aceita: letras, números, ponto, hífen e _, até 60. */
export function cabecalhoUsuarioErp(samAccountName: string | null | undefined): Record<string, string> {
  const login = (samAccountName ?? "").trim();
  return /^[A-Za-z0-9._-]{1,60}$/.test(login) ? { [HEADER_USUARIO_PORTAL]: login } : {};
}
