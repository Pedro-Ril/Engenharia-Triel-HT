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

  doc.setFontSize(14);
  doc.text(`Reajuste salarial — solicitação #${relatorio.numero}`, 14, 15);

  doc.setFontSize(10);
  doc.text(`Solicitante: ${relatorio.criadoPorNome}`, 14, 22);
  doc.text(`Enviada em: ${formatarDataHoraBr(relatorio.criadoEm)}`, 14, 27);
  doc.text(
    `Aprovados: ${relatorio.aprovados.length} de ${relatorio.totalItens} colaborador(es)` +
      (relatorio.totalReprovados > 0 ? ` — ${relatorio.totalReprovados} reprovado(s)` : ""),
    14,
    32
  );

  const totalReajuste = somarReajustes(relatorio);

  let alturaTopo = 38;

  if (relatorio.observacao) {
    const linhas = doc.splitTextToSize(`Observação: ${relatorio.observacao}`, 265) as string[];
    doc.text(linhas, 14, alturaTopo);
    alturaTopo += linhas.length * 5 + 2;
  }

  autoTable(doc, {
    startY: alturaTopo,
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
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [153, 27, 27] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
  });

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
