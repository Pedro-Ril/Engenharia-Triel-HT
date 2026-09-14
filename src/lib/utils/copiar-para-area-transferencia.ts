/*
 * "navigator.clipboard" só existe em contexto seguro (HTTPS ou
 * localhost) — servido em HTTP puro (como o primeiro deploy deste
 * portal, direto na porta 80 sem TLS na frente, mesmo caso de
 * gerarId()/crypto.randomUUID()), o objeto "clipboard" some do
 * navigator e qualquer chamada direta quebra o botão de copiar sem
 * feedback nenhum (undefined.writeText). Cai pro truque antigo
 * (textarea invisível + document.execCommand("copy")), que ainda
 * funciona em contexto inseguro na maioria dos navegadores — API
 * descontinuada, mas é o único jeito de copiar sem HTTPS.
 */
export async function copiarParaAreaDeTransferencia(texto: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      /* segue pro fallback abaixo */
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = texto;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  let sucesso = false;
  try {
    sucesso = document.execCommand("copy");
  } catch {
    sucesso = false;
  }

  document.body.removeChild(textarea);
  return sucesso;
}
