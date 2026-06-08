import {
  AnaliseExcelResponse,
  ItemFoccoApiItem,
  ItemFoccoApiResponse,
  ItemFoccoOpcao,
  ResultadoItemFocco,
} from "../types/revisaoProjetoTypes";

const ERP_ITEM_API_BASE = "http://proserver.trielht.com.br:1000/api/item";

export async function analisarEstruturaExcel(
  arquivo: File
): Promise<AnaliseExcelResponse> {
  const formData = new FormData();
  formData.append("arquivo", arquivo);

  console.log("📤 Enviando arquivo para API:", {
    nome: arquivo.name,
    tamanho: arquivo.size,
    tipo: arquivo.type,
  });

  const response = await fetch("/api/revisao-projeto/analisar-excel", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  console.log("📥 RETORNO COMPLETO DA API:", data);

  if (data?.estrutura?.length) {
    console.log("🌳 PRIMEIRA RAIZ:", data.estrutura[0]);

    const itensM2Convertidos: any[] = [];

    function percorrer(nodes: any[]) {
      for (const node of nodes) {
        if (
          node.codigo === "7126509" ||
          node.unidadeOriginal === "M2" ||
          node.unidadeOriginal === "M²" ||
          node.mpConvertidaKg
        ) {
          itensM2Convertidos.push({
            linhaExcel: node.linhaExcel,
            codigo: node.codigo,
            descricao: node.descricao,
            quantidade: node.quantidade,
            unidade: node.unidade,
            quantidadeOriginal: node.quantidadeOriginal,
            unidadeOriginal: node.unidadeOriginal,
            pesoKg: node.pesoKg,
            mpConvertidaKg: node.mpConvertidaKg,
            pesoKgPaiImediato: node.pesoKgPaiImediato,
            codigoPaiImediato: node.codigoPaiImediato,
            descricaoPaiImediato: node.descricaoPaiImediato,
          });
        }

        if (node.filhos?.length) {
          percorrer(node.filhos);
        }
      }
    }

    percorrer(data.estrutura);

    console.table(itensM2Convertidos);
  }

  if (!response.ok || !data.success) {
    throw new Error(data?.message || "Erro ao analisar estrutura.");
  }

  return data;
}

function normalizarStatus(valor: string | null | undefined) {
  return String(valor || "").trim().toUpperCase();
}

function itemFoccoEstaAtivo(item: ItemFoccoApiItem) {
  return (
    normalizarStatus(item.SIT_CAPA) === "ATIVO" &&
    normalizarStatus(item.SIT_EMPR) === "ATIVO" &&
    normalizarStatus(item.SIT_ENG) === "ATIVO"
  );
}

function converterItemFoccoParaOpcao(item: ItemFoccoApiItem): ItemFoccoOpcao {
  return {
    emprId: item.EMPR_ID,
    codItem: String(item.COD_ITEM || ""),
    descTecnica: item.DESC_TECNICA || "",
    descResumo: item.DESC_RESUM || "",
    codDesenho: item.COD_DESENHO || "",
    tpItem: item.TP_ITEM || "",
    sitCapa: item.SIT_CAPA,
    sitEmpr: item.SIT_EMPR,
    sitEng: item.SIT_ENG,
  };
}

function retornoNaoEncontrado(codDesenho: string): ResultadoItemFocco {
  return {
    codDesenho,
    encontrado: false,

    codItemFocco: null,
    descricaoFocco: null,
    tpItemFocco: null,

    totalEncontrado: 0,
    precisaEscolher: false,
    opcoes: [],
  };
}

export async function buscarItemFoccoPorCodDesenho(
  codDesenho: string
): Promise<ResultadoItemFocco> {
  const codigoLimpo = String(codDesenho || "").trim();

  if (!codigoLimpo) {
    return retornoNaoEncontrado(codigoLimpo);
  }

  const url = `${ERP_ITEM_API_BASE}?cod_desenho=${encodeURIComponent(
    codigoLimpo
  )}`;

  console.log("🔎 Consultando item FOCCO por desenho:", {
    codDesenho: codigoLimpo,
    url,
  });

  try {
    const response = await fetch(url);
    const data = (await response.json()) as ItemFoccoApiResponse;

    console.log("📥 Retorno FOCCO:", {
      codDesenho: codigoLimpo,
      response: data,
    });

    if (!response.ok || !data.success || !Array.isArray(data.data)) {
      return retornoNaoEncontrado(codigoLimpo);
    }

    const itensAtivos = data.data.filter(itemFoccoEstaAtivo);
    const opcoes = itensAtivos.map(converterItemFoccoParaOpcao);

    console.log("✅ Itens FOCCO ativos considerados:", {
      codDesenho: codigoLimpo,
      totalApi: data.data.length,
      totalAtivos: itensAtivos.length,
      opcoes,
    });

    if (opcoes.length === 0) {
      return retornoNaoEncontrado(codigoLimpo);
    }

    if (opcoes.length === 1) {
      const item = opcoes[0];

      return {
        codDesenho: codigoLimpo,
        encontrado: true,

        codItemFocco: item.codItem,
        descricaoFocco: item.descTecnica || item.descResumo || null,
        tpItemFocco: item.tpItem || null,

        totalEncontrado: opcoes.length,
        precisaEscolher: false,
        opcoes,
      };
    }

    return {
      codDesenho: codigoLimpo,
      encontrado: true,

      codItemFocco: null,
      descricaoFocco: null,
      tpItemFocco: null,

      totalEncontrado: opcoes.length,
      precisaEscolher: true,
      opcoes,
    };
  } catch (error) {
    console.error("❌ Erro ao consultar item FOCCO:", {
      codDesenho: codigoLimpo,
      error,
    });

    return retornoNaoEncontrado(codigoLimpo);
  }
}