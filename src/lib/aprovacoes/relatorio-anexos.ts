import "server-only";

import { randomInt } from "node:crypto";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import officeCrypto from "officecrypto-tool";
import * as XLSX from "xlsx";

import type { AnexoEmail } from "@/lib/smtp/enviar-email";

import type { RelatorioSolicitacao } from "./aprovacoes";

/*
 * O relatório vai por anexo, não no corpo do e-mail: os dois arquivos
 * saem protegidos por senha e o corpo carrega só o resumo. Repetir
 * nome, salário e valores no corpo em texto puro anularia a proteção
 * dos anexos.
 *
 * PDF: criptografia nativa do jsPDF (padrão do formato, aberta por
 * qualquer leitor). XLSX: o `xlsx` monta a planilha e o
 * `officecrypto-tool` cifra no padrão do Office (contêiner OLE), que é
 * o que o Excel pede senha para abrir.
 */

/* Sem 0/O/1/I/l: a senha vai ser digitada por uma pessoa lendo de um e-mail. */
const ALFABETO_SENHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAMANHO_SENHA = 10;

export function gerarSenhaRelatorio(): string {
  let senha = "";
  for (let i = 0; i < TAMANHO_SENHA; i += 1) {
    senha += ALFABETO_SENHA[randomInt(ALFABETO_SENHA.length)];
  }
  return senha;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataBr(valorIso: string | null): string {
  if (!valorIso) return "-";
  const [ano, mes, dia] = valorIso.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : "-";
}

function formatarDataHoraBr(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/*
 * Layout do PDF -- mesmo padrão do relatório do Estoque de Equipamentos
 * Usados (src/modules/estoque-equipamentos-usados/utils/pdf-export.ts):
 * faixa vermelha com o número em chip, títulos de seção com marcador,
 * tabela zebrada e rodapé paginado. As constantes são repetidas aqui
 * (e não importadas de lá) porque aquele arquivo é utilitário de um
 * módulo cliente, amarrado aos tipos de equipamento -- este roda no
 * servidor. Se um terceiro relatório aparecer, vale extrair a faixa e o
 * rodapé para um módulo comum.
 *
 * Paleta: --primary e os tokens de status de src/app/globals.css, versão
 * clara -- o PDF não segue o tema do usuário.
 */
const COR_PRIMARIA: [number, number, number] = [183, 28, 28];
const COR_PRIMARIA_ESCURA: [number, number, number] = [127, 20, 20];
const COR_TEXTO: [number, number, number] = [33, 33, 33];
const COR_TEXTO_SUAVE: [number, number, number] = [110, 110, 110];
const COR_LINHA: [number, number, number] = [230, 230, 230];
const COR_FUNDO_ALTERNADO: [number, number, number] = [248, 249, 251];
const COR_FAIXA_CLARA: [number, number, number] = [255, 214, 214];
const COR_SUCESSO_FUNDO: [number, number, number] = [236, 253, 243];
const COR_SUCESSO_TEXTO: [number, number, number] = [22, 101, 52];

/* Paisagem: são 10 colunas de dados, não cabem em retrato. */
const MARGEM = 14;
const LARGURA_PAGINA = 297;
const ALTURA_PAGINA = 210;
const ALTURA_FAIXA = 30;
const TOPO_CONTEUDO = ALTURA_FAIXA + 12;
const RODAPE_Y = ALTURA_PAGINA - 12;

const TITULO_PAGINA = "Relatório de Reajuste Salarial";
const ASSINATURA = "Portal Triel-HT · Reajuste Salarial";

/* Efeito de letter-spacing manual -- jsPDF não tem a propriedade nativa,
   mas um espaço entre cada letra reproduz o mesmo "ar" do rótulo em
   caixa alta usado nos cabeçalhos de seção do portal. */
function espacar(texto: string): string {
  return texto.toUpperCase().split("").join(" ");
}

function desenharFaixaCabecalho(doc: jsPDF, relatorio: RelatorioSolicitacao): void {
  doc.setFillColor(...COR_PRIMARIA);
  doc.rect(0, 0, LARGURA_PAGINA, ALTURA_FAIXA, "F");
  doc.setFillColor(...COR_PRIMARIA_ESCURA);
  doc.rect(0, ALTURA_FAIXA - 1.2, LARGURA_PAGINA, 1.2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COR_FAIXA_CLARA);
  doc.text(espacar(ASSINATURA), MARGEM, 10);

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(TITULO_PAGINA, MARGEM, 21);

  const rotuloNumero = `Nº ${relatorio.numero}`;
  doc.setFontSize(13);
  const larguraChip = doc.getTextWidth(rotuloNumero) + 12;
  const xChip = LARGURA_PAGINA - MARGEM - larguraChip;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(xChip, 8, larguraChip, 10, 2, 2, "F");
  doc.setTextColor(...COR_PRIMARIA);
  doc.text(rotuloNumero, xChip + larguraChip / 2, 14.7, { align: "center" });

  /* O relatório só existe quando não sobrou ninguém pendente -- ver
     montarRelatorioSolicitacao. */
  const rotuloStatus = "Concluída";
  doc.setFontSize(9);
  const larguraStatus = doc.getTextWidth(rotuloStatus) + 10;
  const xStatus = LARGURA_PAGINA - MARGEM - larguraStatus;
  doc.setFillColor(...COR_SUCESSO_FUNDO);
  doc.roundedRect(xStatus, 21, larguraStatus, 6.5, 1.5, 1.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COR_SUCESSO_TEXTO);
  doc.text(rotuloStatus, xStatus + larguraStatus / 2, 25.4, { align: "center" });
}

function desenharTituloSecao(doc: jsPDF, titulo: string, y: number): void {
  doc.setFillColor(...COR_PRIMARIA);
  doc.rect(MARGEM, y - 3.6, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COR_PRIMARIA);
  doc.text(espacar(titulo), MARGEM + 5, y);
}

function desenharRodapes(doc: jsPDF, geradoEm: Date): void {
  const totalPaginas = doc.getNumberOfPages();

  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);

    doc.setDrawColor(...COR_LINHA);
    doc.setLineWidth(0.2);
    doc.line(MARGEM, RODAPE_Y - 4, LARGURA_PAGINA - MARGEM, RODAPE_Y - 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_TEXTO_SUAVE);
    doc.text(ASSINATURA, MARGEM, RODAPE_Y);
    doc.text(
      `Página ${pagina} de ${totalPaginas}  ·  Gerado em ${formatarDataHoraBr(geradoEm.toISOString())}`,
      LARGURA_PAGINA - MARGEM,
      RODAPE_Y,
      { align: "right" }
    );
  }
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

const CABECALHO = [
  "Colaborador",
  "Departamento",
  "Setor",
  "Admissão",
  "Salário atual",
  "Reajuste",
  "%",
  "Novo salário",
  "Decidido por",
  "Observação",
];

function montarLinhas(relatorio: RelatorioSolicitacao): (string | number)[][] {
  return relatorio.aprovados.map((item) => [
    item.funcionarioNome,
    item.departamento ?? "-",
    item.setor ?? "-",
    formatarDataBr(item.dataAdmissao),
    item.salarioAtual,
    item.valorReajuste,
    Number(item.percentualReajuste),
    item.novoSalario,
    item.decididoPorNome ?? "-",
    item.observacao ?? "",
  ]);
}

/* Só sobre os aprovados -- que é tudo o que o relatório contém. */
function somarReajustes(relatorio: RelatorioSolicitacao): number {
  return relatorio.aprovados.reduce((total, item) => total + item.valorReajuste, 0);
}

function nomeBase(relatorio: RelatorioSolicitacao): string {
  return `reajuste-salarial-solicitacao-${relatorio.numero}`;
}

function gerarPdf(relatorio: RelatorioSolicitacao, senha: string): Buffer {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    encryption: {
      userPassword: senha,
      ownerPassword: senha,
      /* Deixa imprimir e copiar; o que a senha protege é a abertura do arquivo. */
      userPermissions: ["print", "copy"],
    },
  });

  const geradoEm = new Date();
  const totalReajuste = somarReajustes(relatorio);

  desenharFaixaCabecalho(doc, relatorio);

  const linhasSolicitacao: [string, string][] = [
    ["Solicitante", relatorio.criadoPorNome],
    ["Enviada em", formatarDataHoraBr(relatorio.criadoEm)],
    [
      "Colaboradores",
      `${relatorio.aprovados.length} aprovado(s) de ${relatorio.totalItens}` +
        (relatorio.totalReprovados > 0 ? ` — ${relatorio.totalReprovados} reprovado(s)` : ""),
    ],
    ["Total do reajuste", formatarMoeda(totalReajuste)],
    ...(relatorio.observacao ? ([["Observação", relatorio.observacao]] as [string, string][]) : []),
  ];

  desenharTituloSecao(doc, "Dados da Solicitação", TOPO_CONTEUDO);

  autoTable(doc, {
    startY: TOPO_CONTEUDO + 4,
    margin: { top: ALTURA_FAIXA + 6, left: MARGEM, right: MARGEM },
    body: linhasSolicitacao,
    styles: {
      fontSize: 10,
      cellPadding: 3,
      textColor: COR_TEXTO,
      lineColor: COR_LINHA,
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold", textColor: COR_PRIMARIA },
      1: { cellWidth: "auto" },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    didDrawPage: () => desenharFaixaCabecalho(doc, relatorio),
  });

  const cursorY = finalY(doc) + 12;
  desenharTituloSecao(doc, "Colaboradores Aprovados", cursorY);

  autoTable(doc, {
    startY: cursorY + 4,
    margin: { top: ALTURA_FAIXA + 6, left: MARGEM, right: MARGEM },
    head: [CABECALHO],
    body: montarLinhas(relatorio).map((linha) => [
      linha[0],
      linha[1],
      linha[2],
      linha[3],
      formatarMoeda(Number(linha[4])),
      formatarMoeda(Number(linha[5])),
      `${Number(linha[6]).toFixed(2)}%`,
      formatarMoeda(Number(linha[7])),
      linha[8],
      linha[9],
    ]),
    foot: [
      [
        `TOTAL — ${relatorio.aprovados.length} colaborador(es)`,
        "",
        "",
        "",
        "",
        formatarMoeda(totalReajuste),
        "",
        "",
        "",
        "",
      ],
    ],
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: COR_TEXTO,
      lineColor: COR_LINHA,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: COR_PRIMARIA,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    footStyles: {
      fillColor: COR_FUNDO_ALTERNADO,
      textColor: COR_TEXTO,
      fontStyle: "bold",
      fontSize: 8.5,
      lineColor: COR_LINHA,
      lineWidth: 0.1,
    },
    /* Dinheiro e percentual alinhados à direita -- mesma regra da tela. */
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    didDrawPage: () => desenharFaixaCabecalho(doc, relatorio),
  });

  desenharRodapes(doc, geradoEm);

  return Buffer.from(doc.output("arraybuffer"));
}

async function gerarXlsx(relatorio: RelatorioSolicitacao, senha: string): Promise<Buffer> {
  const totalReajuste = somarReajustes(relatorio);

  const dados: (string | number)[][] = [
    [`Reajuste salarial — solicitação #${relatorio.numero}`],
    [`Solicitante: ${relatorio.criadoPorNome}`],
    [`Enviada em: ${formatarDataHoraBr(relatorio.criadoEm)}`],
    [
      `Aprovados: ${relatorio.aprovados.length} de ${relatorio.totalItens}` +
        (relatorio.totalReprovados > 0 ? ` — ${relatorio.totalReprovados} reprovado(s)` : ""),
    ],
    ...(relatorio.observacao ? [[`Observação: ${relatorio.observacao}`]] : []),
    [],
    CABECALHO,
    ...montarLinhas(relatorio),
    [
      `TOTAL — ${relatorio.aprovados.length} colaborador(es)`,
      "",
      "",
      "",
      "",
      totalReajuste,
      "",
      "",
      "",
      "",
    ],
  ];

  const planilha = XLSX.utils.aoa_to_sheet(dados);
  planilha["!cols"] = [
    { wch: 34 },
    { wch: 22 },
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 8 },
    { wch: 14 },
    { wch: 24 },
    { wch: 34 },
  ];

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Aprovados");

  const semSenha = XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return officeCrypto.encrypt(semSenha, { password: senha });
}

export async function montarAnexosRelatorio(
  relatorio: RelatorioSolicitacao,
  senha: string
): Promise<AnexoEmail[]> {
  const base = nomeBase(relatorio);

  return [
    {
      nomeArquivo: `${base}.pdf`,
      conteudo: gerarPdf(relatorio, senha),
      tipoConteudo: "application/pdf",
    },
    {
      nomeArquivo: `${base}.xlsx`,
      conteudo: await gerarXlsx(relatorio, senha),
      tipoConteudo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ];
}
