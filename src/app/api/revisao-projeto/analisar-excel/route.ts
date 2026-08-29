import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";

type EstruturaNode = {
  linhaExcel: number;

  nivel: number;
  nivelOriginal: string;

  codigo: string;
  descricao: string;

  quantidade: number | null;
  unidade: string;

  quantidadeOriginal: number | null;
  unidadeOriginal: string;

  pesoKg: number | null;
  unidadePeso: string;

  mpConvertidaKg: boolean;
  pesoKgPaiImediato: number | null;

  codigoPaiImediato: string | null;
  descricaoPaiImediato: string | null;

  filhos: EstruturaNode[];
};

type ColunasDetectadas = {
  nivel: number;
  codigo: number;
  descricao: number;
  quantidade: number;
  unidade: number;
  pesoKg: number;
  unidadePeso: number;
};

function limparTexto(valor: unknown): string {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function normalizarHeader(valor: unknown): string {
  return limparTexto(valor)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "")
    .replace(/[()./\\_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function arredondar(valor: number | null): number | null {
  if (valor === null || valor === undefined) return null;
  if (Number.isNaN(valor)) return null;

  return Number(valor.toFixed(6));
}

function parseNumero(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === "") {
    return null;
  }

  if (typeof valor === "number") {
    if (Number.isNaN(valor)) return null;
    return arredondar(Math.abs(valor));
  }

  let texto = String(valor).trim();

  if (!texto) return null;

  texto = texto
    .replace(/\s+/g, "")
    .replace("−", "-")
    .replace(/[A-Za-zÀ-ÿ²]+/g, "");

  const temVirgula = texto.includes(",");
  const temPonto = texto.includes(".");

  if (temVirgula && temPonto) {
    const ultimaVirgula = texto.lastIndexOf(",");
    const ultimoPonto = texto.lastIndexOf(".");

    if (ultimaVirgula > ultimoPonto) {
      texto = texto.replace(/\./g, "").replace(",", ".");
    } else {
      texto = texto.replace(/,/g, "");
    }
  } else if (temVirgula) {
    texto = texto.replace(",", ".");
  }

  const numero = Number(texto);

  if (Number.isNaN(numero)) return null;

  return arredondar(Math.abs(numero));
}

function normalizarUnidade(valor: unknown): string {
  return limparTexto(valor)
    .toUpperCase()
    .replace("²", "2")
    .replace(/\s+/g, "");
}

function unidadeEhM2(valor: unknown): boolean {
  return normalizarUnidade(valor) === "M2";
}

function getNivel(valor: unknown): number | null {
  const texto = limparTexto(valor);

  if (!texto) return null;

  const pontosInicio = texto.match(/^\.+/);

  if (pontosInicio) {
    return pontosInicio[0].length;
  }

  const numero = Number(texto.replace(",", "."));

  if (!Number.isNaN(numero)) {
    return Math.abs(Math.trunc(numero));
  }

  return null;
}

function getCellValue(
  sheet: XLSX.WorkSheet,
  rowZeroBased: number,
  colZeroBased: number
): unknown {
  const address = XLSX.utils.encode_cell({
    r: rowZeroBased,
    c: colZeroBased,
  });

  const cell = sheet[address];

  if (!cell) return "";

  return cell.v;
}

function localizarColunaPorHeader(
  sheet: XLSX.WorkSheet,
  headerRow: number,
  range: XLSX.Range,
  opcoes: string[]
): number | null {
  const opcoesNormalizadas = opcoes.map(normalizarHeader);

  for (let col = range.s.c; col <= range.e.c; col++) {
    const header = normalizarHeader(getCellValue(sheet, headerRow, col));

    if (!header) continue;

    const encontrou = opcoesNormalizadas.some((opcao) => {
      return header === opcao || header.includes(opcao);
    });

    if (encontrou) {
      return col;
    }
  }

  return null;
}

function detectarColunas(sheet: XLSX.WorkSheet, range: XLSX.Range): ColunasDetectadas {
  const headerRow = range.s.r;

  const nivel = localizarColunaPorHeader(sheet, headerRow, range, [
    "NIVEL EXPLOSAO",
    "NIVEL",
  ]);

  const codigo = localizarColunaPorHeader(sheet, headerRow, range, [
    "N COMPONENTE",
    "NO COMPONENTE",
    "COD COMPONENTE",
    "CODIGO COMPONENTE",
  ]);

  const descricao = localizarColunaPorHeader(sheet, headerRow, range, [
    "TEXTO",
    "DESCRICAO",
    "DESCRICAO ITEM",
  ]);

  const quantidade = localizarColunaPorHeader(sheet, headerRow, range, [
    "QTD COMPONENTE",
    "QTDE COMPONENTE",
    "QTD COMP",
    "QUANTIDADE",
  ]);

  const unidade = localizarColunaPorHeader(sheet, headerRow, range, [
    "UNID MED COMPONENTE",
    "UNIDADE MED COMPONENTE",
    "UM COMPONENTE",
  ]);

  const pesoKg = localizarColunaPorHeader(sheet, headerRow, range, [
    "THEO GEWICHT",
    "THEO WEIGHT",
    "PESO",
    "PESO KG",
  ]);

  const unidadePeso = localizarColunaPorHeader(sheet, headerRow, range, [
    "UNIDADE DE PESO",
    "UNID PESO",
    "UM PESO",
  ]);

  const colunas: ColunasDetectadas = {
    nivel: nivel ?? 0, // A
    codigo: codigo ?? 3, // D
    descricao: descricao ?? 4, // E

    // Na planilha atual:
    // M = quantidade, N = unidade, Q = peso, R = unidade peso
    quantidade: quantidade ?? 12, // M
    unidade: unidade ?? 13, // N
    pesoKg: pesoKg ?? 16, // Q
    unidadePeso: unidadePeso ?? 17, // R
  };

  console.log("🧭 COLUNAS DETECTADAS:", {
    nivel: colunas.nivel + 1,
    codigo: colunas.codigo + 1,
    descricao: colunas.descricao + 1,
    quantidade: colunas.quantidade + 1,
    unidade: colunas.unidade + 1,
    pesoKg: colunas.pesoKg + 1,
    unidadePeso: colunas.unidadePeso + 1,
  });

  return colunas;
}

function montarArvore(sheet: XLSX.WorkSheet): EstruturaNode[] {
  const ref = sheet["!ref"];

  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const colunas = detectarColunas(sheet, range);

  const raizes: EstruturaNode[] = [];
  const pilha: EstruturaNode[] = [];

  console.log("==========================================");
  console.log("📊 INICIANDO LEITURA DA PLANILHA");
  console.log("Range:", ref);
  console.log("Linha inicial:", range.s.r + 1);
  console.log("Linha final:", range.e.r + 1);
  console.log("==========================================");

  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const linhaExcel = row + 1;

    const nivelOriginal = limparTexto(
      getCellValue(sheet, row, colunas.nivel)
    );

    const nivel = getNivel(nivelOriginal);

    const codigo = limparTexto(
      getCellValue(sheet, row, colunas.codigo)
    );

    const descricao = limparTexto(
      getCellValue(sheet, row, colunas.descricao)
    );

    const quantidadeOriginal = parseNumero(
      getCellValue(sheet, row, colunas.quantidade)
    );

    const unidadeOriginal = limparTexto(
      getCellValue(sheet, row, colunas.unidade)
    );

    const pesoKg = parseNumero(
      getCellValue(sheet, row, colunas.pesoKg)
    );

    const unidadePeso = limparTexto(
      getCellValue(sheet, row, colunas.unidadePeso)
    );

    if (!nivel || !codigo) {
      continue;
    }

    const paiImediato = nivel > 1 ? pilha[nivel - 2] || null : null;

    let quantidadeFinal = quantidadeOriginal;
    let unidadeFinal = unidadeOriginal;

    let mpConvertidaKg = false;
    let pesoKgPaiImediato: number | null = null;

    const ehM2 = unidadeEhM2(unidadeOriginal);

    if (codigo === "7126509" || ehM2 || linhaExcel === 7) {
      console.log("🔎 ANTES DA REGRA:", {
        linhaExcel,
        nivelOriginal,
        nivel,
        codigo,
        descricao,
        quantidadeOriginal,
        unidadeOriginal,
        unidadeNormalizada: normalizarUnidade(unidadeOriginal),
        pesoKg,
        unidadePeso,
        ehM2,
        paiImediato: paiImediato
          ? {
              linhaExcel: paiImediato.linhaExcel,
              codigo: paiImediato.codigo,
              descricao: paiImediato.descricao,
              pesoKg: paiImediato.pesoKg,
              unidadePeso: paiImediato.unidadePeso,
              quantidade: paiImediato.quantidade,
              unidade: paiImediato.unidade,
            }
          : null,
      });
    }

    if (ehM2 && paiImediato) {
      quantidadeFinal = paiImediato.pesoKg;
      unidadeFinal = paiImediato.unidadePeso || "KG";

      mpConvertidaKg = true;
      pesoKgPaiImediato = paiImediato.pesoKg;
    }

    if (codigo === "7126509" || ehM2 || linhaExcel === 7) {
      console.log("✅ DEPOIS DA REGRA:", {
        linhaExcel,
        codigo,
        descricao,
        quantidadeFinal,
        unidadeFinal,
        quantidadeOriginal,
        unidadeOriginal,
        pesoKg,
        unidadePeso,
        mpConvertidaKg,
        pesoKgPaiImediato,
        codigoPaiImediato: paiImediato?.codigo || null,
        descricaoPaiImediato: paiImediato?.descricao || null,
      });
    }

    const node: EstruturaNode = {
      linhaExcel,

      nivel,
      nivelOriginal,

      codigo,
      descricao,

      quantidade: quantidadeFinal,
      unidade: unidadeFinal,

      quantidadeOriginal,
      unidadeOriginal,

      pesoKg,
      unidadePeso,

      mpConvertidaKg,
      pesoKgPaiImediato,

      codigoPaiImediato: paiImediato?.codigo || null,
      descricaoPaiImediato: paiImediato?.descricao || null,

      filhos: [],
    };

    pilha[nivel - 1] = node;
    pilha.length = nivel;

    if (paiImediato) {
      paiImediato.filhos.push(node);
    } else {
      raizes.push(node);
    }
  }

  console.log("==========================================");
  console.log("✅ ÁRVORE MONTADA");
  console.log("Total de raízes:", raizes.length);
  console.log("==========================================");

  return raizes;
}

function contarItens(nodes: EstruturaNode[]): number {
  return nodes.reduce((total, node) => {
    return total + 1 + contarItens(node.filhos || []);
  }, 0);
}

function contarMpConvertidas(nodes: EstruturaNode[]): number {
  return nodes.reduce((total, node) => {
    return (
      total +
      (node.mpConvertidaKg ? 1 : 0) +
      contarMpConvertidas(node.filhos || [])
    );
  }, 0);
}

function coletarDebugM2(nodes: EstruturaNode[]) {
  const debugM2: Array<{
    linhaExcel: number;
    nivel: number;
    codigo: string;
    descricao: string;
    quantidade: number | null;
    unidade: string;
    quantidadeOriginal: number | null;
    unidadeOriginal: string;
    unidadeNormalizada: string;
    pesoKg: number | null;
    unidadePeso: string;
    mpConvertidaKg: boolean;
    pesoKgPaiImediato: number | null;
    codigoPaiImediato: string | null;
  }> = [];

  function percorrer(lista: EstruturaNode[]) {
    for (const node of lista) {
      if (
        node.codigo === "7126509" ||
        unidadeEhM2(node.unidadeOriginal) ||
        node.mpConvertidaKg
      ) {
        debugM2.push({
          linhaExcel: node.linhaExcel,
          nivel: node.nivel,
          codigo: node.codigo,
          descricao: node.descricao,
          quantidade: node.quantidade,
          unidade: node.unidade,
          quantidadeOriginal: node.quantidadeOriginal,
          unidadeOriginal: node.unidadeOriginal,
          unidadeNormalizada: normalizarUnidade(node.unidadeOriginal),
          pesoKg: node.pesoKg,
          unidadePeso: node.unidadePeso,
          mpConvertidaKg: node.mpConvertidaKg,
          pesoKgPaiImediato: node.pesoKgPaiImediato,
          codigoPaiImediato: node.codigoPaiImediato,
        });
      }

      if (node.filhos?.length) {
        percorrer(node.filhos);
      }
    }
  }

  percorrer(nodes);

  return debugM2;
}

async function handlePOST(request: NextRequest) {
  const acesso = await verificarAcessoModuloApi("revisao-projeto");
  if (acesso.negado) return acesso.negado;

  try {
    console.log("==========================================");
    console.log("🚀 API /api/revisao-projeto/analisar-excel CHAMADA");
    console.log("==========================================");

    const formData = await request.formData();
    const arquivo = formData.get("arquivo");

    if (!(arquivo instanceof File)) {
      console.log("❌ Nenhum arquivo recebido.");

      return NextResponse.json(
        {
          success: false,
          message: "Nenhum arquivo foi enviado.",
        },
        { status: 400 }
      );
    }

    console.log("📁 Arquivo recebido:", {
      nome: arquivo.name,
      tamanho: arquivo.size,
      tipo: arquivo.type,
    });

    const buffer = Buffer.from(await arquivo.arrayBuffer());

    const workbook = XLSX.read(buffer, {
      type: "buffer",
      raw: true,
      cellDates: true,
    });

    console.log("📄 Abas encontradas:", workbook.SheetNames);

    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      console.log("❌ A planilha não possui abas.");

      return NextResponse.json(
        {
          success: false,
          message: "A planilha não possui abas.",
        },
        { status: 400 }
      );
    }

    const sheet = workbook.Sheets[sheetName];

    console.log("📌 Aba usada:", sheetName);
    console.log("📌 Ref da aba:", sheet["!ref"]);

    const estrutura = montarArvore(sheet);

    const debugM2 = coletarDebugM2(estrutura);

    console.log("==========================================");
    console.log("📋 RESUMO DOS ITENS M2 / 7126509");
    console.table(debugM2);
    console.log("==========================================");

    console.log("📦 RESUMO FINAL:", {
      arquivo: arquivo.name,
      aba: sheetName,
      totalRaizes: estrutura.length,
      totalItens: contarItens(estrutura),
      totalMpConvertidas: contarMpConvertidas(estrutura),
    });

    return NextResponse.json({
      success: true,
      message: "Planilha analisada com sucesso.",
      arquivo: arquivo.name,
      aba: sheetName,
      totalRaizes: estrutura.length,
      totalItens: contarItens(estrutura),
      totalMpConvertidas: contarMpConvertidas(estrutura),
      debugM2,
      estrutura,
    });
  } catch (error) {
    console.error("❌ Erro ao analisar planilha:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Erro ao analisar a planilha.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("revisao-projeto/analisar-excel", handlePOST);