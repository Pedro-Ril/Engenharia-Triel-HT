import type jsPDF from "jspdf";

/*
 * Padrão visual dos PDFs do portal -- o mesmo de Equipamentos Usados
 * (src/modules/estoque-equipamentos-usados/utils/pdf-export.ts): faixa
 * vermelha no topo com o módulo em caixa alta espaçada + título, chip
 * branco à direita, títulos de seção com o quadradinho vermelho, tabelas
 * zebradas e rodapé "Página X de Y · Gerado em". Cores da versão clara
 * dos tokens de src/app/globals.css (o PDF não segue o tema do usuário).
 *
 * Só funções de desenho (jsPDF roda no navegador); sem "server-only".
 */

export type CorRgb = [number, number, number];

export const COR_PRIMARIA: CorRgb = [183, 28, 28];
export const COR_PRIMARIA_ESCURA: CorRgb = [127, 20, 20];
export const COR_TEXTO: CorRgb = [33, 33, 33];
export const COR_TEXTO_SUAVE: CorRgb = [110, 110, 110];
export const COR_LINHA: CorRgb = [230, 230, 230];
export const COR_FUNDO_ALTERNADO: CorRgb = [248, 249, 251];
export const COR_FAIXA_CLARA: CorRgb = [255, 214, 214];
export const COR_BRANCO: CorRgb = [255, 255, 255];

export const MARGEM = 14;
export const ALTURA_FAIXA = 30;
export const TOPO_CONTEUDO = ALTURA_FAIXA + 12;
/* Margem superior das páginas que uma tabela abre sozinha (a faixa é redesenhada por cima). */
export const MARGEM_TOPO_TABELA = ALTURA_FAIXA + 6;

export interface SeloPdf {
  texto: string;
  fundo: CorRgb;
  cor: CorRgb;
}

export interface CabecalhoPdf {
  /* Ex.: "Chamados" -> "PORTAL TRIEL-HT · CHAMADOS" na faixa. */
  modulo: string;
  titulo: string;
  /* Chip branco no canto direito (ex.: "Nº 2127"). */
  chip?: string;
  /* Selo colorido logo abaixo do chip (ex.: status). */
  selo?: SeloPdf;
}

export function larguraPagina(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

export function alturaPagina(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

/* Onde o conteúdo pode ir até antes de bater no rodapé. */
export function limiteConteudoY(doc: jsPDF): number {
  return alturaPagina(doc) - 22;
}

/*
 * As fontes padrão do jsPDF só têm Latin-1 (WinAnsi): acento e cedilha
 * saem certos, mas emoji e outros símbolos virariam lixo -- troca pelos
 * equivalentes simples ou remove.
 */
export function textoPdf(valor: string | null | undefined): string {
  if (!valor) return "";

  return valor
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[–]/g, "-")
    .replace(/ /g, " ")
    .replace(/[^\u0009\u000A\u000D -~ -ÿ—•€]/g, "");
}

/* "Letter-spacing" manual do rótulo em caixa alta (jsPDF não tem nativo). */
export function espacar(texto: string): string {
  return texto.toUpperCase().split("").join(" ");
}

export function formatarDataHoraPdf(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

export function desenharFaixa(doc: jsPDF, cabecalho: CabecalhoPdf): void {
  const largura = larguraPagina(doc);

  doc.setFillColor(...COR_PRIMARIA);
  doc.rect(0, 0, largura, ALTURA_FAIXA, "F");
  doc.setFillColor(...COR_PRIMARIA_ESCURA);
  doc.rect(0, ALTURA_FAIXA - 1.2, largura, 1.2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COR_FAIXA_CLARA);
  doc.text(espacar(`Portal Triel-HT · ${cabecalho.modulo}`), MARGEM, 10);

  /* Título não pode invadir o chip à direita. */
  const reservaDireita = cabecalho.chip ? 70 : 0;
  doc.setFontSize(16);
  doc.setTextColor(...COR_BRANCO);
  const titulo = doc.splitTextToSize(textoPdf(cabecalho.titulo), largura - MARGEM * 2 - reservaDireita)[0] ?? "";
  doc.text(titulo, MARGEM, 21);

  if (cabecalho.chip) {
    doc.setFontSize(13);
    const larguraChip = doc.getTextWidth(cabecalho.chip) + 12;
    const xChip = largura - MARGEM - larguraChip;
    doc.setFillColor(...COR_BRANCO);
    doc.roundedRect(xChip, 8, larguraChip, 10, 2, 2, "F");
    doc.setTextColor(...COR_PRIMARIA);
    doc.text(cabecalho.chip, xChip + larguraChip / 2, 14.7, { align: "center" });
  }

  if (cabecalho.selo) {
    doc.setFontSize(9);
    const larguraSelo = doc.getTextWidth(cabecalho.selo.texto) + 10;
    const xSelo = largura - MARGEM - larguraSelo;
    doc.setFillColor(...cabecalho.selo.fundo);
    doc.roundedRect(xSelo, 21, larguraSelo, 6.5, 1.5, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...cabecalho.selo.cor);
    doc.text(cabecalho.selo.texto, xSelo + larguraSelo / 2, 25.4, { align: "center" });
  }
}

export function desenharTituloSecao(doc: jsPDF, titulo: string, y: number, x = MARGEM): void {
  doc.setFillColor(...COR_PRIMARIA);
  doc.rect(x, y - 3.6, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COR_PRIMARIA);
  doc.text(espacar(titulo), x + 5, y);
}

export function desenharRodapes(doc: jsPDF, modulo: string, geradoEm: Date): void {
  const totalPaginas = doc.getNumberOfPages();
  const largura = larguraPagina(doc);
  const rodapeY = alturaPagina(doc) - 12;

  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);

    doc.setDrawColor(...COR_LINHA);
    doc.setLineWidth(0.2);
    doc.line(MARGEM, rodapeY - 4, largura - MARGEM, rodapeY - 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_TEXTO_SUAVE);
    doc.text(`Portal Triel-HT · ${modulo}`, MARGEM, rodapeY);
    doc.text(
      `Página ${pagina} de ${totalPaginas}  ·  Gerado em ${formatarDataHoraPdf(geradoEm)}`,
      largura - MARGEM,
      rodapeY,
      { align: "right" }
    );
  }
}

/* Onde a última tabela do jspdf-autotable terminou. */
export function fimUltimaTabela(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/* Estilos base das tabelas (zebradas, linha fina) -- mesmos de Equipamentos Usados. */
export const ESTILO_TABELA = {
  fontSize: 9,
  cellPadding: 2.5,
  textColor: COR_TEXTO,
  lineColor: COR_LINHA,
  lineWidth: 0.1,
} as const;

export const ESTILO_CABECALHO_TABELA = {
  fillColor: COR_PRIMARIA,
  textColor: COR_BRANCO,
  fontStyle: "bold",
  fontSize: 8.5,
} as const;

/* Nome de arquivo seguro: sem acento, espaço vira hífen. */
export function nomeArquivoSeguro(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
