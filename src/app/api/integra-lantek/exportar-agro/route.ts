import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import fs from "fs/promises";
import path from "path";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { obterConfigParaRotas } from "@/lib/integra-lantek/integra-lantek-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TabelaProcessamentoRow = {
  id: string;
  numLote: string;
  numOrdem: string;
  codItem: string;
  codDesenho: string;
  descTecnica: string;
  qtde: number | "";
  codItemMp: string;
  descTecnicaMp: string;
  material: string;
  espessura: string;
  operacao: string;
  maquina: string;
  cliente: string;
  pdv: string;
  dxfCaminho?: string;
};

const DESTINO_ARQUIVO = "Lantek.xls";

function resolverCodigoCaminho(row: TabelaProcessamentoRow) {
  const codItem = String(row.codItem ?? "").trim();
  const codDesenho = String(row.codDesenho ?? "").trim();

  if (codDesenho && codDesenho !== codItem) {
    return codDesenho;
  }

  return codItem;
}

function montarCaminhoDxfPadrao(codigoArquivo: string, pastaDxf: string) {
  if (!codigoArquivo) return "";
  return path.join(pastaDxf, `${codigoArquivo}.dxf`);
}

function resolverCaminhoDxf(
  row: TabelaProcessamentoRow,
  codigoCaminho: string,
  pastaDxf: string
) {
  const caminhoEncontrado = String(row.dxfCaminho ?? "").trim();
  if (caminhoEncontrado) return caminhoEncontrado;

  return montarCaminhoDxfPadrao(codigoCaminho, pastaDxf);
}

function formatarEspessura(valor: string | number | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "";

  const numero = Number(String(valor).replace(",", "."));

  if (Number.isNaN(numero)) return "";

  return Number(numero.toString());
}

export async function POST(request: NextRequest) {
  const acesso = await verificarAcessoModuloApi("integra-lantek-agro");
  if (acesso.negado) return acesso.negado;

  try {
    const body = await request.json();
    const rows = Array.isArray(body?.rows)
      ? (body.rows as TabelaProcessamentoRow[])
      : [];

    if (!rows.length) {
      return NextResponse.json(
        { error: "Não há registros para exportar." },
        { status: 400 }
      );
    }

    let config;
    try {
      config = await obterConfigParaRotas();
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      throw error;
    }

    const destinoPasta = config.pastaExportacaoAgro;

    const cabecalho = [
      "Código/ Nome do item",
      "Quantidade",
      "(Não usado)",
      "(Não usado)",
      "(Não usado)",
      "Banco de dados",
      "Máquina",
      "Material",
      "Esp. (mm)",
      "Prioridade",
      "Local dos arquivos",
      "Ordem",
      "Lote",
      "Cliente",
      "PDV",
      "idfx2",
      "idfx3",
      "idfx4",
      "idfx5",
      "Peça de preenchimento?",
      "Preenchimento de furos?",
    ];

    const linhas = rows.map((row) => {
      const codigoCaminho = resolverCodigoCaminho(row);

      return [
        `${row.codItem || ""}_${row.numOrdem || ""}`,
        row.qtde === "" ? "" : row.qtde,
        "",
        "",
        "",
        "Trabalhos 'TRIEL-HT'",
        row.maquina || "",
        row.material || "",
        formatarEspessura(row.espessura),
        0,
        resolverCaminhoDxf(row, codigoCaminho, config.pastaDxf),
        row.numOrdem || "",
        row.numLote || "",
        row.cliente || "",
        row.pdv || "",
        "",
        "",
        "",
        "",
        "OFF",
        "OFF",
      ];
    });

    const dadosPlanilha = [cabecalho, ...linhas];
    const worksheet = XLSX.utils.aoa_to_sheet(dadosPlanilha);

    worksheet["!cols"] = [
      { wch: 24 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
      { wch: 24 },
      { wch: 12 },
      { wch: 10 },
      { wch: 52 },
      { wch: 14 },
      { wch: 12 },
      { wch: 30 },
      { wch: 16 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 24 },
      { wch: 24 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lantek");

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xls",
    });

    const caminhoCompleto = path.join(destinoPasta, DESTINO_ARQUIVO);

    await fs.mkdir(destinoPasta, { recursive: true });
    await fs.writeFile(caminhoCompleto, buffer);

    return NextResponse.json({
      success: true,
      message: "Arquivo exportado com sucesso.",
      path: caminhoCompleto,
      fileName: DESTINO_ARQUIVO,
      totalRegistros: rows.length,
    });
  } catch (error) {
    console.error("Erro ao exportar XLS:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao gerar/salvar a planilha.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
