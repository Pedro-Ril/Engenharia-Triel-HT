import {
  Estrutura3DXNode,
  Estrutura3DXResponse,
  RoteiroApiResponse,
  RoteiroItem,
  RoteiroTreeNode,
} from "../types/cadastroRoteiro.types";

const API_STRUCTURE = "http://localhost:3333/api/search/structure";
const API_ROTEIRO = "http://proserver.trielht.com.br:1000/api/roteiro";

const EMPR_ID_FIXO = 2;

function normalizarTexto(valor?: string | null) {
  return String(valor ?? "").trim();
}

function obterCodigoNode(node: Estrutura3DXNode) {
  return normalizarTexto(node.codigo);
}

function coletarCodigos(node: Estrutura3DXNode, codigos = new Set<string>()) {
  const codigo = obterCodigoNode(node);

  if (codigo) {
    codigos.add(codigo);
  }

  for (const child of node.children ?? []) {
    coletarCodigos(child, codigos);
  }

  return codigos;
}

async function buscarRoteiroItem(codigo: string): Promise<RoteiroItem[]> {
  const url = new URL(`${API_ROTEIRO}/${encodeURIComponent(codigo)}`);
  url.searchParams.set("cod_emp", String(EMPR_ID_FIXO));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    return [];
  }

  const payload = json as RoteiroApiResponse;

  return Array.isArray(payload.data) ? payload.data : [];
}

async function buscarRoteirosEmLote(codigos: string[]) {
  const mapa = new Map<string, RoteiroItem[]>();

  await Promise.all(
    codigos.map(async (codigo) => {
      const roteiros = await buscarRoteiroItem(codigo);
      mapa.set(codigo, roteiros);
    })
  );

  return mapa;
}

function montarArvoreComRoteiros(
  node: Estrutura3DXNode,
  roteirosPorCodigo: Map<string, RoteiroItem[]>,
  indexPath = "0"
): RoteiroTreeNode | null {
  const codigo = obterCodigoNode(node);

  if (!codigo) {
    return null;
  }

  const children = (node.children ?? [])
    .map((child, index) =>
      montarArvoreComRoteiros(child, roteirosPorCodigo, `${indexPath}.${index}`)
    )
    .filter((child): child is RoteiroTreeNode => child !== null);

  return {
    ...node,
    id: `${indexPath}-${codigo || node.physicalId || "sem-codigo"}`,
    codigoNormalizado: codigo,
    descricaoNormalizada: normalizarTexto(node.descricao),
    roteiros: roteirosPorCodigo.get(codigo) ?? [],
    children,
  };
}

function contarItensUnicos(
  node: RoteiroTreeNode | null,
  codigos = new Set<string>()
): number {
  if (!node) return 0;

  const codigo = String(node.codigoNormalizado || "").trim();

  if (codigo) {
    codigos.add(codigo);
  }

  for (const child of node.children) {
    contarItensUnicos(child, codigos);
  }

  return codigos.size;
}

export async function buscarEstruturaComRoteiros(
  codItemPai: string
): Promise<{
  codigo: string;
  totalItens: number;
  totalInstancias: number;
  tree: RoteiroTreeNode;
}> {
  const codigo = codItemPai.trim();

  if (!codigo) {
    throw new Error("Informe o código do item pai.");
  }

  const url = new URL(`${API_STRUCTURE}/${encodeURIComponent(codigo)}`);
  url.searchParams.set("empr_id", String(EMPR_ID_FIXO));

  const response = await fetch(url.toString(), {
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

  if (!json?.success || !json?.data?.tree) {
    throw new Error("A API retornou a estrutura sem sucesso.");
  }

  const estrutura = json as Estrutura3DXResponse;

  const codigos = Array.from(coletarCodigos(estrutura.data.tree));
  const roteirosPorCodigo = await buscarRoteirosEmLote(codigos);

  const tree = montarArvoreComRoteiros(
    estrutura.data.tree,
    roteirosPorCodigo
  );

  if (!tree) {
    throw new Error("Nenhum item com código foi encontrado na estrutura.");
  }

  return {
    codigo: estrutura.codigo,
    totalItens: contarItensUnicos(tree),
    totalInstancias: estrutura.data.totalInstancias,
    tree,
  };
}

export type DeletarOperacaoRoteiroPayload = {
  codItem: string;
  alternativo: number;
  seq: number;
};

export async function deletarOperacaoRoteiro({
  codItem,
  alternativo,
  seq,
}: DeletarOperacaoRoteiroPayload) {
  const response = await fetch(`${API_ROTEIRO}/operacao`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cod_emp: EMPR_ID_FIXO,
      cod_item: codItem,
      alternativo,
      seq,
    }),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    throw new Error(
      json?.message ||
        json?.error ||
        `Erro ao deletar operação do roteiro. HTTP ${response.status}`
    );
  }

  return json;
}

export type DeletarRoteiroCompletoPayload = {
  codItem: string;
};

export async function deletarRoteiroCompleto({
  codItem,
}: DeletarRoteiroCompletoPayload) {
  const response = await fetch(`${API_ROTEIRO}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cod_emp: EMPR_ID_FIXO,
      cod_item: codItem,
    }),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    throw new Error(
      json?.message ||
        json?.error ||
        `Erro ao deletar roteiro completo. HTTP ${response.status}`
    );
  }

  return json;
}

export async function buscarRoteirosDoItem(codigo: string): Promise<RoteiroItem[]> {
  return buscarRoteiroItem(codigo);
}