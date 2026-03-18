import {
  EstruturaApiItem,
  EstruturaApiResponse,
  EstruturaConsultaResultado,
  EstruturaDeleteInvalidadosResponse,
  EstruturaDeleteInvalidadosLoteRequest,
  EstruturaDeleteInvalidadosLoteResponse,
  EstruturaTreeNode,
} from "../types/estruturaProduto.types";

const API_BASE = "http://proserver.trielht.com.br:1000/api/estrutura";

export async function buscarEstruturaProduto(
  codPai: string
): Promise<EstruturaConsultaResultado> {
  const codigo = codPai.trim();

  if (!codigo) {
    throw new Error("Informe o código do item pai.");
  }

  const response = await fetch(`${API_BASE}/${encodeURIComponent(codigo)}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      json?.message ||
        json?.error ||
        `Erro ao consultar estrutura. HTTP ${response.status}`
    );
  }

  if (!json?.success) {
    throw new Error("A API retornou a consulta sem sucesso.");
  }

  const payload = json as EstruturaApiResponse;

  return {
    codItemPai: payload.codItemPai,
    descricaoPai: payload.data?.[0]?.DESC_TECNICA_PAI_RAIZ ?? "",
    total: payload.total ?? 0,
    data: Array.isArray(payload.data) ? payload.data : [],
  };
}

export async function removerItensInvalidosEstrutura(
  codPai: string,
  ids: number[]
): Promise<EstruturaDeleteInvalidadosResponse> {
  const codigo = codPai.trim();

  if (!codigo) {
    throw new Error("Informe o código do item pai.");
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("Nenhum ID inválido foi informado para remoção.");
  }

  const idsNormalizados = [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];

  if (idsNormalizados.length === 0) {
    throw new Error("Nenhum ID válido foi informado para remoção.");
  }

  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(codigo)}/invalidados`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: idsNormalizados,
      }),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Erro ao remover itens inválidos. HTTP ${response.status}`
    );
  }

  if (!data?.success) {
    throw new Error(
      data?.message || "A API retornou a exclusão sem sucesso."
    );
  }

  return data as EstruturaDeleteInvalidadosResponse;
}

export async function removerItensInvalidosEstruturaLote(
  payload: EstruturaDeleteInvalidadosLoteRequest
): Promise<EstruturaDeleteInvalidadosLoteResponse> {
  const codItemPaiRaiz = String(payload?.codItemPaiRaiz ?? "").trim();

  if (!codItemPaiRaiz) {
    throw new Error("Informe o código do item pai raiz.");
  }

  if (!Array.isArray(payload?.grupos) || payload.grupos.length === 0) {
    throw new Error("Nenhum grupo foi informado para remoção em lote.");
  }

  const gruposNormalizados = payload.grupos
    .map((grupo) => ({
      codPaiDireto: String(grupo?.codPaiDireto ?? "").trim(),
      ids: Array.isArray(grupo?.ids)
        ? [
            ...new Set(
              grupo.ids
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0)
            ),
          ]
        : [],
    }))
    .filter((grupo) => grupo.codPaiDireto && grupo.ids.length > 0);

  if (gruposNormalizados.length === 0) {
    throw new Error("Nenhum grupo válido foi informado para remoção em lote.");
  }

  const response = await fetch(`${API_BASE}/invalidados/lote`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      codItemPaiRaiz,
      grupos: gruposNormalizados,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Erro ao remover itens inválidos em lote. HTTP ${response.status}`
    );
  }

  if (!data?.success) {
    throw new Error(
      data?.message || "A API retornou a exclusão em lote sem sucesso."
    );
  }

  return data as EstruturaDeleteInvalidadosLoteResponse;
}

function normalizar(valor?: string | null): string {
  return (valor ?? "").trim();
}

function criarMapaDescricoes(
  codPai: string,
  descricaoPai: string,
  data: EstruturaApiItem[]
): Map<string, string> {
  const mapa = new Map<string, string>();

  if (codPai) {
    mapa.set(normalizar(codPai), normalizar(descricaoPai));
  }

  for (const item of data) {
    if (item.COD_ITEM_PAI_RAIZ) {
      mapa.set(
        normalizar(item.COD_ITEM_PAI_RAIZ),
        normalizar(item.DESC_TECNICA_PAI_RAIZ)
      );
    }

    if (item.COD_ITEM_PAI) {
      mapa.set(
        normalizar(item.COD_ITEM_PAI),
        normalizar(item.DESC_TECNICA_PAI)
      );
    }

    if (item.COD_ITEM_FILHO) {
      mapa.set(
        normalizar(item.COD_ITEM_FILHO),
        normalizar(item.DESC_TECNICA_FILHO)
      );
    }
  }

  return mapa;
}

function criarIdNode(item: EstruturaApiItem, indice: number): string {
  return [
    normalizar(item.ORDEM_HIERARQUICA),
    normalizar(item.COD_ITEM_PAI),
    normalizar(item.COD_ITEM_FILHO),
    String(item.SEQ_ORD ?? ""),
    normalizar(item.DT_INI),
    normalizar(item.DT_FIM),
    normalizar(item.STATUS_VALIDADE),
    String(indice),
  ].join("|");
}

function obterOrdemPai(ordem: string): string | null {
  const valor = normalizar(ordem);
  if (!valor) return null;

  const partes = valor.split(".");
  if (partes.length <= 1) return null;

  partes.pop();
  return partes.join(".");
}

function compararOrdemHierarquica(a: string, b: string): number {
  const pa = normalizar(a)
    .split(".")
    .map((n) => Number(n));

  const pb = normalizar(b)
    .split(".")
    .map((n) => Number(n));

  const tamanho = Math.max(pa.length, pb.length);

  for (let i = 0; i < tamanho; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;

    if (va !== vb) {
      return va - vb;
    }
  }

  return 0;
}

function ordenarArvore(node: EstruturaTreeNode): void {
  node.children.sort((a, b) => {
    const aHier = normalizar(a.registros?.[0]?.ORDEM_HIERARQUICA);
    const bHier = normalizar(b.registros?.[0]?.ORDEM_HIERARQUICA);

    if (aHier && bHier) {
      const compHier = compararOrdemHierarquica(aHier, bHier);
      if (compHier !== 0) return compHier;
    }

    const aSeq = Number(a.registros?.[0]?.SEQ_ORD ?? Number.MAX_SAFE_INTEGER);
    const bSeq = Number(b.registros?.[0]?.SEQ_ORD ?? Number.MAX_SAFE_INTEGER);

    if (!Number.isNaN(aSeq) && !Number.isNaN(bSeq) && aSeq !== bSeq) {
      return aSeq - bSeq;
    }

    const aNum = Number(a.codigo);
    const bNum = Number(b.codigo);

    if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
      return aNum - bNum;
    }

    return a.codigo.localeCompare(b.codigo, "pt-BR");
  });

  for (const child of node.children) {
    ordenarArvore(child);
  }
}

function atualizarStatusNode(
  node: EstruturaTreeNode,
  item: EstruturaApiItem
): void {
  const statusAtual = normalizar(node.statusValidade).toUpperCase();
  const novoStatus = normalizar(item.STATUS_VALIDADE).toUpperCase();

  if (!statusAtual) {
    node.statusValidade = novoStatus || undefined;
    return;
  }

  if (novoStatus === "INVALIDO") {
    node.statusValidade = "INVALIDO";
  }
}

export function montarArvoreEstrutura(
  codPai: string,
  descricaoPai: string,
  data: EstruturaApiItem[]
): EstruturaTreeNode {
  const codigoRaiz = normalizar(codPai);
  const descricaoRaiz = normalizar(descricaoPai);
  const mapaDescricoes = criarMapaDescricoes(codigoRaiz, descricaoRaiz, data);

  const root: EstruturaTreeNode = {
    id: codigoRaiz,
    codigo: codigoRaiz,
    descricao: mapaDescricoes.get(codigoRaiz) || descricaoRaiz || "Item raiz",
    nivel: 0,
    caminho: codigoRaiz,
    children: [],
    registros: [],
    statusValidade: undefined,
    parentCode: undefined,
  };

  const nodesByOrdem = new Map<string, EstruturaTreeNode[]>();

  const rowsOrdenadas = [...data].sort((a, b) =>
    compararOrdemHierarquica(
      normalizar(a.ORDEM_HIERARQUICA),
      normalizar(b.ORDEM_HIERARQUICA)
    )
  );

  const adicionarNodeNaOrdem = (ordem: string, node: EstruturaTreeNode) => {
    const lista = nodesByOrdem.get(ordem) ?? [];
    lista.push(node);
    nodesByOrdem.set(ordem, lista);
  };

  rowsOrdenadas.forEach((item, indice) => {
    const ordem = normalizar(item.ORDEM_HIERARQUICA);
    if (!ordem) return;

    const codigoFilho = normalizar(item.COD_ITEM_FILHO);
    const codigoPaiItem = normalizar(item.COD_ITEM_PAI);

    const descricaoNode =
      mapaDescricoes.get(codigoFilho) ||
      normalizar(item.DESC_TECNICA_FILHO) ||
      "";

    const parentOrdem = obterOrdemPai(ordem);

    let parentNode: EstruturaTreeNode = root;

    if (parentOrdem) {
      const paisPossiveis = nodesByOrdem.get(parentOrdem) ?? [];

      if (paisPossiveis.length > 0) {
        parentNode = paisPossiveis[paisPossiveis.length - 1];
      }
    }

    const node: EstruturaTreeNode = {
      id: criarIdNode(item, indice),
      codigo: codigoFilho,
      descricao: descricaoNode,
      nivel: Number(item.NIVEL ?? ordem.split(".").length),
      caminho:
        normalizar(item.CAMINHO_ESTRUTURA) ||
        `${codigoPaiItem} -> ${codigoFilho}`,
      children: [],
      registros: [item],
      statusValidade: normalizar(item.STATUS_VALIDADE) || undefined,
      parentCode: parentNode.codigo,
    };

    parentNode.children.push(node);
    adicionarNodeNaOrdem(ordem, node);
    atualizarStatusNode(node, item);
  });

  ordenarArvore(root);
  return root;
}