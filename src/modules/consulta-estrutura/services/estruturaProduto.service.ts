import {
  EstruturaApiItem,
  EstruturaApiResponse,
  EstruturaConsultaResultado,
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

  if (!response.ok) {
    throw new Error(`Erro ao consultar estrutura. HTTP ${response.status}`);
  }

  const json: EstruturaApiResponse = await response.json();

  if (!json.success) {
    throw new Error("A API retornou a consulta sem sucesso.");
  }

  return {
    codItemPai: json.codItemPai,
    descricaoPai: json.data?.[0]?.DESC_TECNICA_PAI_RAIZ ?? "",
    total: json.total ?? 0,
    data: Array.isArray(json.data) ? json.data : [],
  };
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
    mapa.set(codPai, descricaoPai || "");
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

export function montarArvoreEstrutura(
  codPai: string,
  descricaoPai: string,
  data: EstruturaApiItem[]
): EstruturaTreeNode {
  const mapaDescricoes = criarMapaDescricoes(codPai, descricaoPai, data);

  const root: EstruturaTreeNode = {
    id: codPai,
    codigo: codPai,
    descricao: mapaDescricoes.get(codPai) || descricaoPai || "Item raiz",
    nivel: 0,
    caminho: codPai,
    children: [],
    registros: [],
    statusValidade: undefined,
    parentCode: undefined,
  };

  const nodeMap = new Map<string, EstruturaTreeNode>();
  nodeMap.set(root.caminho, root);

  for (const item of data) {
    const caminho = normalizar(item.CAMINHO_ESTRUTURA);
    if (!caminho) continue;

    const partes = caminho
      .split("->")
      .map((parte) => parte.trim())
      .filter(Boolean);

    if (partes.length === 0) continue;

    let caminhoAtual = "";
    let parentNode: EstruturaTreeNode | null = null;

    for (let i = 0; i < partes.length; i++) {
      const codigoAtual = partes[i];
      caminhoAtual = i === 0 ? codigoAtual : `${caminhoAtual} -> ${codigoAtual}`;

      let currentNode = nodeMap.get(caminhoAtual);

      if (!currentNode) {
        currentNode = {
          id: caminhoAtual,
          codigo: codigoAtual,
          descricao: mapaDescricoes.get(codigoAtual) || "",
          nivel: i,
          caminho: caminhoAtual,
          children: [],
          registros: [],
          statusValidade: undefined,
          parentCode: parentNode ? parentNode.codigo : undefined,
        };

        nodeMap.set(caminhoAtual, currentNode);

        if (parentNode) {
          const jaExiste = parentNode.children.some(
            (child) => child.id === currentNode!.id
          );

          if (!jaExiste) {
            parentNode.children.push(currentNode);
          }
        }
      }

      if (i === partes.length - 1) {
        currentNode.registros.push(item);
        currentNode.statusValidade = item.STATUS_VALIDADE;
      }

      parentNode = currentNode;
    }
  }

  ordenarArvore(root);
  return root;
}

function ordenarArvore(node: EstruturaTreeNode): void {
  node.children.sort((a, b) => {
    const aNum = Number(a.codigo);
    const bNum = Number(b.codigo);

    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      return aNum - bNum;
    }

    return a.codigo.localeCompare(b.codigo, "pt-BR");
  });

  for (const child of node.children) {
    ordenarArvore(child);
  }
}