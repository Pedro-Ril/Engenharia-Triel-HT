import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { EstruturaTreeNode } from "../types/estruturaProduto.types";

type FlatRow = {
  nivel: number;
  codigo: string;
  descricao: string;
  quantidade: number | string;
  status: string;
  dataInicio: string;
  dataFim: string;
};

function formatarData(data?: string | null): string {
  if (!data) return "-";

  const date = new Date(data);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function flattenTree(node: EstruturaTreeNode, rows: FlatRow[] = []): FlatRow[] {
  const primeiroRegistro = node.registros?.[0];

  const qtde =
    primeiroRegistro?.QTDE_CORRIGIDA ??
    primeiroRegistro?.QTDE ??
    "";

  const status = primeiroRegistro?.STATUS_VALIDADE ?? "";

  rows.push({
    nivel: node.nivel,
    codigo: node.codigo,
    descricao: node.descricao,
    quantidade: qtde,
    status,
    dataInicio: formatarData(primeiroRegistro?.DT_INI),
    dataFim: formatarData(primeiroRegistro?.DT_FIM),
  });

  node.children.forEach((child) => flattenTree(child, rows));

  return rows;
}

export function exportarExcelEstrutura(
  root: EstruturaTreeNode,
  nomeArquivo: string
) {
  const data = flattenTree(root).map((row) => ({
    NIVEL: row.nivel,
    ITEM: `${" ".repeat(row.nivel * 4)}${row.codigo}`,
    DESCRICAO: row.descricao || "-",
    QUANTIDADE: row.quantidade,
    STATUS: row.status || "-",
    DATA_INICIO: row.dataInicio,
    DATA_FIM: row.dataFim,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  worksheet["!cols"] = [
    { wch: 8 },  // NIVEL
    { wch: 28 }, // ITEM
    { wch: 60 }, // DESCRICAO
    { wch: 14 }, // QUANTIDADE
    { wch: 14 }, // STATUS
    { wch: 14 }, // DATA_INICIO
    { wch: 14 }, // DATA_FIM
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Estrutura");

  XLSX.writeFile(workbook, `${nomeArquivo}.xlsx`);
}

export function exportarPdfEstrutura(
  root: EstruturaTreeNode,
  nomeArquivo: string
) {
  const rows = flattenTree(root).map((row) => [
    String(row.nivel),
    `${" ".repeat(row.nivel * 4)}${row.codigo}`,
    row.descricao || "-",
    row.quantidade === "" ? "-" : String(row.quantidade),
    row.status || "-",
    row.dataInicio,
    row.dataFim,
  ]);

  const doc = new jsPDF("l", "mm", "a4");

  doc.setFontSize(14);
  doc.setTextColor(183, 28, 28);
  doc.text("Estrutura de Produto", 14, 15);

  autoTable(doc, {
    startY: 22,
    head: [[
      "Nível",
      "Item",
      "Descrição",
      "Quantidade",
      "Status",
      "Data Início",
      "Data Fim",
    ]],
    body: rows,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [40, 40, 40],
      lineColor: [230, 230, 230],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [183, 28, 28],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 249, 251],
    },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 35 },
      2: { cellWidth: 95 },
      3: { cellWidth: 22 },
      4: { cellWidth: 25 },
      5: { cellWidth: 24 },
      6: { cellWidth: 24 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        const valor = String(data.cell.raw || "").toUpperCase();
        if (valor === "INVALIDO") {
          data.cell.styles.textColor = [198, 40, 40];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  doc.save(`${nomeArquivo}.pdf`);
}