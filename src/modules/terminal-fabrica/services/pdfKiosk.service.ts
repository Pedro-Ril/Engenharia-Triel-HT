const API_BASE = "/api/terminal-fabrica";

/*
 * Busca os bytes do PDF já montado (todas as folhas juntas — ver
 * src/lib/pdf/roteiro-pdf.ts) pra renderizar com o visualizador
 * próprio do terminal (ver PdfViewerKiosk.tsx). O tempo de espera
 * aqui é quase todo do servidor (ler a pasta de rede + juntar as
 * folhas) — a transferência do PDF em si é rápida, então não faz
 * sentido medir "progresso de download" (não existe uma fase
 * lenta de download pra acompanhar).
 */
export async function buscarPdfDetalhamentoItem(codigo: string): Promise<ArrayBuffer> {
  const codigoLimpo = String(codigo || "").trim();

  if (!codigoLimpo) {
    throw new Error("Código do item inválido.");
  }

  const response = await fetch(`${API_BASE}/item-pdf/${encodeURIComponent(codigoLimpo)}`, {
    cache: "no-store",
  });

  if (response.status === 404) {
    throw new Error("Não localizou PDFs para este item.");
  }

  if (!response.ok) {
    throw new Error("Erro ao abrir PDF do item.");
  }

  return response.arrayBuffer();
}

/*
 * Checagem leve de disponibilidade (só lista a pasta, sem juntar
 * as folhas) — usada pra decidir se o botão "Ver desenho" fica
 * habilitado, já que nem todo item tem 2D e 3D ao mesmo tempo.
 */
export async function verificarPdfDisponivel(codigo: string): Promise<boolean> {
  const codigoLimpo = String(codigo || "").trim();

  if (!codigoLimpo) {
    throw new Error("Código do item inválido.");
  }

  const response = await fetch(
    `${API_BASE}/item-pdf/${encodeURIComponent(codigoLimpo)}/existe`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Erro ao verificar disponibilidade do desenho.");
  }

  const json = await response.json();
  return Boolean(json?.data?.disponivel);
}
