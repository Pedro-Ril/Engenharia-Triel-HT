/*
 * "crypto.randomUUID()" só existe em contexto seguro (HTTPS ou
 * localhost) — servido em HTTP puro (como o primeiro deploy deste
 * portal, direto na porta 80 sem TLS na frente), o método some do
 * objeto "crypto" e qualquer chamada direta quebra a tela inteira
 * com "crypto.randomUUID is not a function". Usa só pra IDs
 * client-side temporários (chave de item de formulário, "key" de
 * lista) — nunca pra nada que precise de aleatoriedade
 * criptográfica de verdade.
 */
export function gerarId(): string {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
