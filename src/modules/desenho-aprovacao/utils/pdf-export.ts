export function getRevisionSvgUrl(desenhoId: string, revisaoId: string) {
  return `/api/desenho-aprovacao/${encodeURIComponent(desenhoId)}/revisoes/${encodeURIComponent(
    revisaoId
  )}/svg`;
}

function sanitizeFileName(value: string) {
  const semCaracteresDeControle = Array.from(value)
    .map((char) => (char.charCodeAt(0) < 32 ? "-" : char))
    .join("");

  const sanitized = semCaracteresDeControle
    .trim()
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "desenho-aprovacao";
}

async function getResponseErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const payload: unknown = await response.json();

    if (
      typeof payload === "object" &&
      payload !== null &&
      !Array.isArray(payload) &&
      "message" in payload &&
      typeof payload.message === "string" &&
      payload.message.trim()
    ) {
      return payload.message.trim();
    }
  } catch {
    // A resposta pode ser o próprio SVG ou texto simples.
  }

  return fallbackMessage;
}

/*
 * Carrega o SVG de uma revisão e o converte pra PDF no navegador (jsPDF +
 * svg2pdf.js, imports dinâmicos pra não pesar o bundle inicial). O SVG já
 * tem proporção/viewBox de uma folha A3 horizontal (420x297) — renderiza
 * a partir de 0,0 usando as dimensões reais da página do jsPDF, sem
 * adicionar uma segunda margem externa (a margem técnica já existe dentro
 * do próprio SVG).
 */
export async function createPdfFromSvg({
  svgUrl,
  fileName,
  title,
}: {
  svgUrl: string;
  fileName: string;
  title: string;
}) {
  const response = await fetch(svgUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      await getResponseErrorMessage(response, "Não foi possível carregar o SVG da revisão.")
    );
  }

  const svgContent = await response.text();
  const parsedDocument = new DOMParser().parseFromString(svgContent, "image/svg+xml");

  if (parsedDocument.querySelector("parsererror")) {
    throw new Error("O SVG da revisão possui um formato inválido.");
  }

  const parsedSvg = parsedDocument.querySelector("svg");

  if (!parsedSvg) {
    throw new Error("A resposta recebida não contém um SVG válido.");
  }

  const svgElement = document.importNode(parsedSvg, true);
  const temporaryContainer = document.createElement("div");

  temporaryContainer.setAttribute("aria-hidden", "true");

  Object.assign(temporaryContainer.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    pointerEvents: "none",
    opacity: "0",
  });

  temporaryContainer.appendChild(svgElement);
  document.body.appendChild(temporaryContainer);

  try {
    const [{ jsPDF }, { svg2pdf }] = await Promise.all([
      import("jspdf"),
      import("svg2pdf.js"),
    ]);

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a3",
      compress: true,
    });

    pdf.setProperties({
      title,
      subject: "Desenho de aprovação",
      author: "Portal da Engenharia - TRIEL-HT",
      creator: "Portal da Engenharia - TRIEL-HT",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    await svg2pdf(svgElement, pdf, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    pdf.save(`${sanitizeFileName(fileName)}.pdf`);
  } finally {
    temporaryContainer.remove();
  }
}
