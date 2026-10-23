import {
  PaiErp,
  ComponenteEstrutura,
  RecursoDisponivel,
  Estrutura3DXNode,
  Estrutura3DXResponse,
  RoteiroApiResponse,
  RoteiroItem,
  RoteiroTreeNode,
} from "../types/cadastroRoteiro.types";
import {
  contarItensEInstancias,
  removerForaDaListaDeMateriais,
} from "../utils/lista-materiais";

const API_STRUCTURE = "http://proserver.trielht.com.br:1001/api/search/structure";
/*
 * Leitura em massa da árvore continua na v1: é só consulta, e a árvore
 * pede o roteiro de CADA item da estrutura (centenas de chamadas) -- o
 * GET da v2 lê também estrutura, máquinas e consumos de cada um, pesado
 * demais para isso. Item único, gravação e exclusão vão pela v2.
 *
 * Por que a v2 na gravação: a v1 apaga e reinsere as operações, o que
 * levava junto os consumos e as máscaras e desligava as operações das
 * ordens e do MRP. A v2 só altera o que mudou, como a tela FENG0202.
 */
const API_ROTEIRO = "http://proserver.trielht.com.br:1000/api/roteiro";
const API_ROTEIRO_V2 = "http://proserver.trielht.com.br:1000/api/v2/roteiro";
const API_RECURSOS_V2 = "http://proserver.trielht.com.br:1000/api/v2/recursos";
const API_ESTRUTURA_V2 = "http://proserver.trielht.com.br:1000/api/v2/estrutura";
const API_ITEM = "http://proserver.trielht.com.br:1000/api/item";
/* Estrutura do ERP (a mesma da Consulta de Estrutura), usada nas peças Ciber. */
const API_ESTRUTURA = "http://proserver.trielht.com.br:1000/api/estrutura";

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

/*
 * Andamento da consulta, para a tela mostrar em que pé está: numa
 * estrutura grande a leitura dos roteiros leva vários segundos, e uma
 * barra parada sem número parece travada.
 */
export type ProgressoConsulta =
  | { etapa: "estrutura"; origem: OrigemEstrutura }
  | { etapa: "roteiros"; feitos: number; total: number };

/* Entre um aviso e outro: cada roteiro lido vira um render da tela, e
   centenas deles seguidos não acrescentam nada a quem está olhando. */
const INTERVALO_PROGRESSO_MS = 120;

async function buscarRoteirosEmLote(
  codigos: string[],
  onProgresso?: (progresso: ProgressoConsulta) => void
) {
  const mapa = new Map<string, RoteiroItem[]>();
  const total = codigos.length;
  let feitos = 0;
  let ultimoAviso = 0;

  onProgresso?.({ etapa: "roteiros", feitos: 0, total });

  await Promise.all(
    codigos.map(async (codigo) => {
      const roteiros = await buscarRoteiroItem(codigo);
      mapa.set(codigo, roteiros);
      feitos += 1;

      const agora = Date.now();

      /* O último sempre avisa, para a tela não parar em "618/619". */
      if (feitos === total || agora - ultimoAviso >= INTERVALO_PROGRESSO_MS) {
        ultimoAviso = agora;
        onProgresso?.({ etapa: "roteiros", feitos, total });
      }
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

/*
 * De onde vem a estrutura. "ciber": estruturas que não existem no 3DX --
 * a árvore sai do ERP (TCAD_EST_ITE), e só para itens Ciber, os de item
 * base 2316. Daí em diante (roteiros, cadastro, filtros) é tudo igual.
 */
export type OrigemEstrutura = "3dx" | "ciber";

export const ITEM_BASE_CIBER = "2316";

type LinhaEstruturaErp = {
  ID_ESTRUTURA: number;
  ORDEM_HIERARQUICA: string;
  NIVEL: number;
  COD_ITEM_FILHO: string;
  DESC_TECNICA_FILHO: string | null;
  SEQ_ORD: number | null;
  STATUS_VALIDADE: "VALIDO" | "INVALIDO";
  TP_ITEM_FILHO: string | null;
  COD_DESENHO_FILHO: string | null;
};

/* O item pai no cadastro do ERP: confere que é Ciber e dá descrição e tipo da raiz. */
async function buscarItemCiber(codigo: string) {
  const url = new URL(API_ITEM);
  url.searchParams.set("cod_emp", String(EMPR_ID_FIXO));
  url.searchParams.set("cod_item", codigo);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Erro ao consultar o item no ERP. HTTP ${response.status}`);
  }

  const item = (Array.isArray(json.data) ? json.data : []).find(
    (i: { COD_ITEM?: string }) => normalizarTexto(i.COD_ITEM).toUpperCase() === codigo.toUpperCase()
  );

  if (!item) {
    throw new Error(`O item ${codigo} não foi encontrado no cadastro do ERP.`);
  }

  const itemBase = normalizarTexto(item.COD_ITEM_BASE);

  if (itemBase !== ITEM_BASE_CIBER) {
    throw new Error(
      `O item ${codigo} não é Ciber: o item base dele é ${itemBase || "vazio"}, e não ${ITEM_BASE_CIBER}. Escolha "Triel-HT" em Origem da estrutura para buscar no 3DX.`
    );
  }

  return {
    descricao: normalizarTexto(item.DESC_TECNICA ?? item.DESC_RESUM),
    tipo: normalizarTexto(item.TP_ITEM),
    desenho: normalizarTexto(item.COD_DESENHO),
  };
}

/*
 * Estrutura Ciber, montada a partir do ERP no mesmo formato da do 3DX.
 * Só ligações vigentes: uma vencida sai com tudo o que está abaixo dela
 * (o filho de uma ligação vencida não tem pai na árvore e fica de fora).
 * Não há revisão -- o roteiro dessas peças vai sem.
 */
async function buscarEstruturaCiber(codigo: string): Promise<Estrutura3DXNode> {
  const raizErp = await buscarItemCiber(codigo);

  const response = await fetch(`${API_ESTRUTURA}/${encodeURIComponent(codigo)}`, { cache: "no-store" });
  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success || !Array.isArray(json.data)) {
    throw new Error(json?.message || `Erro ao consultar a estrutura no ERP. HTTP ${response.status}`);
  }

  const raiz: Estrutura3DXNode = {
    origem: "erp",
    physicalId: `erp-raiz-${codigo}`,
    codigo,
    codigoDesenho: raizErp.desenho,
    descricao: raizErp.descricao,
    tipoint: raizErp.tipo,
    revisao: "",
    nivel: 0,
    instancia: null,
    children: [],
  };

  const porCaminho = new Map<string, Estrutura3DXNode>([["", raiz]]);

  for (const linha of json.data as LinhaEstruturaErp[]) {
    if (linha.STATUS_VALIDADE !== "VALIDO") continue;

    const caminho = String(linha.ORDEM_HIERARQUICA);
    const caminhoPai = caminho.includes(".") ? caminho.slice(0, caminho.lastIndexOf(".")) : "";
    const pai = porCaminho.get(caminhoPai);

    if (!pai) continue;

    const no: Estrutura3DXNode = {
      origem: "erp",
      physicalId: `erp-${linha.ID_ESTRUTURA}`,
      codigo: normalizarTexto(linha.COD_ITEM_FILHO),
      codigoDesenho: normalizarTexto(linha.COD_DESENHO_FILHO),
      descricao: normalizarTexto(linha.DESC_TECNICA_FILHO),
      tipoint: normalizarTexto(linha.TP_ITEM_FILHO),
      revisao: "",
      nivel: Number(linha.NIVEL),
      instancia: {
        physicalId: `erp-${linha.ID_ESTRUTURA}`,
        nome: normalizarTexto(linha.COD_ITEM_FILHO),
        ordem: String(linha.SEQ_ORD ?? ""),
      },
      children: [],
    };

    pai.children = [...(pai.children ?? []), no];
    porCaminho.set(caminho, no);
  }

  return raiz;
}

export async function buscarEstruturaComRoteiros(
  codItemPai: string,
  onProgresso?: (progresso: ProgressoConsulta) => void,
  origem: OrigemEstrutura = "3dx"
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

  onProgresso?.({ etapa: "estrutura", origem });

  const arvore = origem === "ciber" ? await buscarEstruturaCiber(codigo) : await buscarEstrutura3dx(codigo);

  const codigos = Array.from(coletarCodigos(arvore));
  const roteirosPorCodigo = await buscarRoteirosEmLote(codigos, onProgresso);

  const tree = montarArvoreComRoteiros(arvore, roteirosPorCodigo);

  if (!tree) {
    throw new Error("Nenhum item com código foi encontrado na estrutura.");
  }

  return {
    codigo,
    totalItens: contarItensUnicos(tree),
    totalInstancias: contarItensEInstancias(arvore).totalInstancias,
    tree,
  };
}

async function buscarEstrutura3dx(codigo: string): Promise<Estrutura3DXNode> {
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

  /* Item fora da lista de materiais não entra na árvore (nem é lido no ERP). */
  return removerForaDaListaDeMateriais(estrutura.data.tree);
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
  const response = await fetch(`${API_ROTEIRO_V2}/operacao`, {
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
  const response = await fetch(`${API_ROTEIRO_V2}`, {
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

/*
 * Releitura do roteiro de UM item (depois de gravar ou excluir). Ao
 * contrário da leitura em massa, aqui falha LANÇA: devolver lista vazia
 * faria a tela pintar "Sem roteiro" num item que tem roteiro, só porque
 * o ERP não respondeu. Item sem roteiro volta como sucesso com lista
 * vazia (conferido na v1), então não cai aqui.
 */
export async function buscarRoteirosDoItem(codigo: string): Promise<RoteiroItem[]> {
  const url = new URL(`${API_ROTEIRO}/${encodeURIComponent(codigo)}`);
  url.searchParams.set("cod_emp", String(EMPR_ID_FIXO));

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    throw new Error(
      json?.message ||
        `Não foi possível reler o roteiro do item ${codigo} no ERP (HTTP ${response.status}).`
    );
  }

  const payload = json as RoteiroApiResponse;

  return Array.isArray(payload.data) ? payload.data : [];
}

export type RoteiroCompletoErp =
  | { ok: true; roteiros: RoteiroItem[]; componentes: ComponenteEstrutura[] }
  | { ok: false; mensagem: string };

/*
 * O roteiro de UM item, como está no ERP agora, com máquinas, consumos
 * e a estrutura. O modal de cadastro lê isto ao abrir: preenche recursos
 * e consumos da operação em edição e é a base do envio -- assim uma
 * operação incluída no ERP depois que a árvore carregou não some (a v2
 * exclui o que não vier no JSON).
 */
export async function buscarRoteiroCompletoErp(codItem: string): Promise<RoteiroCompletoErp> {
  const url = new URL(`${API_ROTEIRO_V2}/${encodeURIComponent(codItem)}`);
  url.searchParams.set("cod_emp", String(EMPR_ID_FIXO));

  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    const json = await response.json().catch(() => null);

    if (response.status === 404) {
      /*
       * Dois 404 diferentes: o da própria API (JSON) é item inexistente;
       * o do Express sem a rota (HTML "Cannot GET") é a v2 ainda não
       * carregada no servidor -- dizer "item não encontrado" ali faria a
       * pessoa procurar o problema no lugar errado.
       */
      if (!json) {
        return {
          ok: false,
          mensagem:
            "A API de roteiro v2 não está disponível no servidor do ERP (o serviço precisa ser reiniciado).",
        };
      }

      return {
        ok: false,
        mensagem: json.message || `O item ${codItem} não foi encontrado no ERP.`,
      };
    }

    if (!response.ok || !json?.success) {
      return {
        ok: false,
        mensagem:
          json?.message ||
          `Não foi possível ler o roteiro atual do ERP (HTTP ${response.status}).`,
      };
    }

    return {
      ok: true,
      roteiros: Array.isArray(json.data) ? (json.data as RoteiroItem[]) : [],
      componentes: Array.isArray(json.componentes)
        ? (json.componentes as ComponenteEstrutura[])
        : [],
    };
  } catch {
    return { ok: false, mensagem: "Sem comunicação com a API do ERP." };
  }
}

/* Máquinas ativas de um centro de trabalho -- as únicas aceitas como
   recurso de uma operação daquele centro. */
export async function buscarRecursosDoCentro(codCentro: string): Promise<RecursoDisponivel[]> {
  const url = new URL(API_RECURSOS_V2);
  url.searchParams.set("cod_emp", String(EMPR_ID_FIXO));
  url.searchParams.set("cod_centro_trab", codCentro);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success) {
    throw new Error(json?.message || "Não foi possível carregar as máquinas do centro.");
  }

  return Array.isArray(json.data) ? (json.data as RecursoDisponivel[]) : [];
}

export type PaisErp = { ok: true; pais: PaiErp[] } | { ok: false; mensagem: string };

/*
 * Implosão: os itens do ERP que usam este na estrutura (pais diretos).
 * Serve para quando a peça foi pesquisada sozinha e virou a raiz da
 * árvore -- aí o portal não tem pai nenhum para mostrar.
 */
export async function buscarPaisNoErp(codItem: string): Promise<PaisErp> {
  const url = new URL(`${API_ESTRUTURA_V2}/${encodeURIComponent(codItem)}/pais`);
  url.searchParams.set("cod_emp", String(EMPR_ID_FIXO));

  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    const json = await response.json().catch(() => null);

    /* 404 em HTML ("Cannot GET") = a rota ainda não está no servidor. */
    if (response.status === 404 && !json) {
      return {
        ok: false,
        mensagem: "A consulta de pais (implosão) ainda não está disponível no servidor do ERP.",
      };
    }

    if (!response.ok || !json?.success) {
      return {
        ok: false,
        mensagem: json?.message || `Não foi possível consultar os pais no ERP (HTTP ${response.status}).`,
      };
    }

    return { ok: true, pais: Array.isArray(json.data) ? (json.data as PaiErp[]) : [] };
  } catch {
    return { ok: false, mensagem: "Sem comunicação com a API do ERP." };
  }
}

/*
 * Item que chegou do 3DX sem descrição ou sem tipo: os dois vêm do
 * cadastro do item no ERP, numa chamada só por código. Só os códigos
 * que precisam (costumam ser poucos), até 6 pedidos por vez. Item que
 * falhar ou não existir no ERP fica de fora -- a tela continua com
 * "Sem descrição" e sem a badge de tipo para ele.
 *
 * Sem tipo é, na prática, revisão ainda em trabalho no 3DX: o atributo
 * só é preenchido quando a revisão é liberada. Sem completar, o item
 * sumia da árvore com o filtro "Fabricado" marcado.
 */
const DADOS_ITEM_EM_PARALELO = 6;

export type DadosItemErp = {
  descricao: string;
  /* TP_ITEM como o ERP devolve ("FABRICADO", "COMPRADO"...). */
  tipo: string;
};

export function codigosParaCompletarNoErp(
  tree: RoteiroTreeNode,
  codigos = new Set<string>()
): Set<string> {
  if (
    tree.codigoNormalizado &&
    (!tree.descricaoNormalizada || !normalizarTexto(tree.tipoint))
  ) {
    codigos.add(tree.codigoNormalizado);
  }

  for (const child of tree.children) {
    codigosParaCompletarNoErp(child, codigos);
  }

  return codigos;
}

async function buscarDadosItemNoErp(codigo: string): Promise<DadosItemErp | null> {
  const url = new URL(API_ITEM);
  url.searchParams.set("cod_emp", String(EMPR_ID_FIXO));
  url.searchParams.set("cod_item", codigo);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.success || !Array.isArray(json.data)) return null;

  const item = json.data.find(
    (i: { COD_ITEM?: string }) => normalizarTexto(i.COD_ITEM).toUpperCase() === codigo.toUpperCase()
  );

  if (!item) return null;

  return {
    descricao: normalizarTexto(item.DESC_TECNICA ?? item.DESC_RESUM),
    tipo: normalizarTexto(item.TP_ITEM ?? item.TP_ITEM_DESCRICAO),
  };
}

export async function buscarDadosItensNoErp(
  codigos: Iterable<string>
): Promise<Map<string, DadosItemErp>> {
  const fila = [...codigos];
  const dados = new Map<string, DadosItemErp>();

  async function trabalhar() {
    for (let codigo = fila.shift(); codigo; codigo = fila.shift()) {
      try {
        const item = await buscarDadosItemNoErp(codigo);
        if (item && (item.descricao || item.tipo)) dados.set(codigo, item);
      } catch {
        /* Fica como veio do 3DX; nada a fazer. */
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DADOS_ITEM_EM_PARALELO, fila.length) }, trabalhar));

  return dados;
}
