"use client";

import { useMemo, useState, type MouseEvent } from "react";
import styles from "./RevisaoProjetoPage.module.css";
import EstruturaTree from "./components/EstruturaTree";
import EscolherItemFoccoModal from "./components/EscolherItemFoccoModal";
import EstruturaContextMenu, {
  EstruturaFiltroTipo,
} from "./components/EstruturaContextMenu";
import ResumoItensFoccoModal, {
  ItemComEscolhaFocco,
} from "./components/ResumoItensFoccoModal";
import {
  analisarEstruturaExcel,
  buscarItemFoccoPorCodDesenho,
} from "./services/revisaoProjetoService";
import {
  EstruturaNode,
  ItemFoccoOpcao,
  ResultadoItemFocco,
} from "./types/revisaoProjetoTypes";

type FiltroArvore = {
  tipo: EstruturaFiltroTipo;
  baseNodeKey: string | null;
};

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  node: EstruturaNode | null;
  nodeKey: string | null;
};

function contarItens(nodes: EstruturaNode[]): number {
  return nodes.reduce((total, node) => {
    return total + 1 + contarItens(node.filhos || []);
  }, 0);
}

function formatarNumero(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(valor);
}

function formatarUnidade(unidade: string | null | undefined) {
  const valor = String(unidade || "").trim().toUpperCase();

  if (valor === "PC") return "UN";

  return valor || "-";
}

function getNodeKey(node: EstruturaNode, fallback = 0) {
  return `${node.codigo}-${node.linhaExcel ?? fallback}-${node.nivel ?? 0}`;
}

function montarNodeKey(node: EstruturaNode, parentKey: string, index: number) {
  return `${parentKey}-${node.codigo}-${node.linhaExcel ?? index}-${node.nivel ?? 0
    }`;
}

function extrairCodigoRaizDoArquivo(nomeArquivo: string): string {
  const nomeSemExtensao = nomeArquivo.replace(/\.[^/.]+$/, "");
  const nomeNormalizado = nomeSemExtensao.trim();

  if (nomeNormalizado.toUpperCase().startsWith("BOM_")) {
    return nomeNormalizado.substring(4).trim();
  }

  return nomeNormalizado;
}

function criarRaizNivelZero(
  arquivo: File,
  filhos: EstruturaNode[]
): EstruturaNode {
  const codigoRaiz = extrairCodigoRaizDoArquivo(arquivo.name);
  const base = filhos[0] ?? ({} as EstruturaNode);

  return {
    ...base,

    nivel: 0,
    nivelOriginal: "0",

    codigo: codigoRaiz,
    descricao: "Estrutura importada da planilha",

    quantidade: 1,
    quantidadeOriginal: 1,

    unidade: "UN",
    unidadeOriginal: "UN",

    pesoKg: 0,
    pesoKgPaiImediato: null,

    linhaExcel: 0,

    mpConvertidaKg: false,

    codigoPaiImediato: null,
    descricaoPaiImediato: null,

    codItemFocco: null,
    tpItemFocco: null,
    descricaoFocco: null,
    codDesenhoPesquisado: null,
    consultaFoccoRealizada: false,

    opcoesFocco: [],
    precisaEscolherFocco: false,

    filhos,
  };
}

function formatarTipoItemFocco(tpItem: string | null | undefined) {
  const valor = String(tpItem || "").trim();

  return valor || "Não identificado";
}

function coletarCodigosEstrutura(nodes: EstruturaNode[]): string[] {
  const codigos = new Set<string>();

  function percorrer(lista: EstruturaNode[]) {
    for (const node of lista) {
      const codigo = String(node.codigo || "").trim();

      if (codigo) {
        codigos.add(codigo);
      }

      if (node.filhos?.length) {
        percorrer(node.filhos);
      }
    }
  }

  percorrer(nodes);

  return Array.from(codigos);
}

function coletarItensComEscolhaFocco(
  nodes: EstruturaNode[]
): ItemComEscolhaFocco[] {
  const itens: ItemComEscolhaFocco[] = [];

  function percorrer(lista: EstruturaNode[], parentKey: string | null = null) {
    lista.forEach((node, index) => {
      const nodeKey = parentKey
        ? montarNodeKey(node, parentKey, index)
        : getNodeKey(node, index);

      if (node.precisaEscolherFocco) {
        itens.push({
          node,
          nodeKey,
        });
      }

      if (node.filhos?.length) {
        percorrer(node.filhos, nodeKey);
      }
    });
  }

  percorrer(nodes);

  return itens;
}

function getPredicadoFiltro(tipo: EstruturaFiltroTipo) {
  return (node: EstruturaNode) => {
    if (tipo === "precisaEscolherFocco") {
      return !!node.precisaEscolherFocco;
    }

    if (tipo === "semCodigoFocco") {
      return (
        !!node.consultaFoccoRealizada &&
        !node.codItemFocco &&
        !node.precisaEscolherFocco
      );
    }

    return false;
  };
}

function filtrarSubArvore(
  node: EstruturaNode,
  predicado: (node: EstruturaNode) => boolean
): EstruturaNode | null {
  const filhosFiltrados = (node.filhos || [])
    .map((filho) => filtrarSubArvore(filho, predicado))
    .filter((filho): filho is EstruturaNode => filho !== null);

  if (!predicado(node) && filhosFiltrados.length === 0) {
    return null;
  }

  return {
    ...node,
    filhos: filhosFiltrados,
  };
}

function coletarChavesExpansaoAteNivel(
  nodes: EstruturaNode[],
  nivelMaximoAberto: number,
  parentKey: string | null = null
): string[] {
  const chaves: string[] = [];

  nodes.forEach((node, index) => {
    const nodeKey = parentKey
      ? montarNodeKey(node, parentKey, index)
      : getNodeKey(node, index);

    if ((node.filhos?.length || 0) > 0 && node.nivel <= nivelMaximoAberto) {
      chaves.push(nodeKey);
    }

    if (node.filhos?.length) {
      chaves.push(
        ...coletarChavesExpansaoAteNivel(
          node.filhos,
          nivelMaximoAberto,
          nodeKey
        )
      );
    }
  });

  return chaves;
}

function filtrarArvorePorBase(
  nodes: EstruturaNode[],
  filtro: FiltroArvore | null
): EstruturaNode[] {
  if (!filtro) return nodes;

  const filtroAtivo = filtro;
  const baseNodeKey = filtroAtivo.baseNodeKey;
  const predicado = getPredicadoFiltro(filtroAtivo.tipo);

  if (!baseNodeKey) {
    return nodes
      .map((node) => filtrarSubArvore(node, predicado))
      .filter((node): node is EstruturaNode => node !== null);
  }

  function percorrer(
    lista: EstruturaNode[],
    parentKey: string | null = null
  ): EstruturaNode[] {
    const resultado: EstruturaNode[] = [];

    lista.forEach((node, index) => {
      const nodeKey = parentKey
        ? montarNodeKey(node, parentKey, index)
        : getNodeKey(node, index);

      if (nodeKey === baseNodeKey) {
        const subArvoreFiltrada = filtrarSubArvore(node, predicado);

        if (subArvoreFiltrada) {
          resultado.push(subArvoreFiltrada);
        }

        return;
      }

      const filhosFiltrados = percorrer(node.filhos || [], nodeKey);

      if (filhosFiltrados.length > 0) {
        resultado.push({
          ...node,
          filhos: filhosFiltrados,
        });
      }
    });

    return resultado;
  }

  return percorrer(nodes);
}

function coletarChavesExpansao(
  nodes: EstruturaNode[],
  parentKey: string | null = null
): string[] {
  const chaves: string[] = [];

  nodes.forEach((node, index) => {
    const nodeKey = parentKey
      ? montarNodeKey(node, parentKey, index)
      : getNodeKey(node, index);

    if (node.filhos?.length) {
      chaves.push(nodeKey);
      chaves.push(...coletarChavesExpansao(node.filhos, nodeKey));
    }
  });

  return chaves;
}

function coletarChavesExpansaoPorBase(
  nodes: EstruturaNode[],
  baseNodeKey: string | null
): string[] {
  if (!baseNodeKey) {
    return coletarChavesExpansao(nodes);
  }

  function percorrer(
    lista: EstruturaNode[],
    parentKey: string | null = null
  ): string[] {
    for (let index = 0; index < lista.length; index += 1) {
      const node = lista[index];

      const nodeKey = parentKey
        ? montarNodeKey(node, parentKey, index)
        : getNodeKey(node, index);

      if (nodeKey === baseNodeKey) {
        return coletarChavesExpansao([node], parentKey);
      }

      const chavesFilhas = percorrer(node.filhos || [], nodeKey);

      if (chavesFilhas.length > 0) {
        return chavesFilhas;
      }
    }

    return [];
  }

  return percorrer(nodes);
}

async function executarComLimite<T, R>(
  itens: T[],
  limite: number,
  executor: (item: T) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = [];
  let indiceAtual = 0;

  async function worker() {
    while (indiceAtual < itens.length) {
      const indice = indiceAtual;
      indiceAtual += 1;

      resultados[indice] = await executor(itens[indice]);
    }
  }

  const totalWorkers = Math.min(limite, itens.length);

  await Promise.all(Array.from({ length: totalWorkers }, () => worker()));

  return resultados;
}

function aplicarResultadoFoccoNaArvore(
  nodes: EstruturaNode[],
  mapaResultados: Map<string, ResultadoItemFocco>
): EstruturaNode[] {
  return nodes.map((node) => {
    const codigo = String(node.codigo || "").trim();
    const resultado = mapaResultados.get(codigo);

    return {
      ...node,
      codItemFocco: resultado?.codItemFocco ?? null,
      descricaoFocco: resultado?.descricaoFocco ?? null,
      tpItemFocco: resultado?.tpItemFocco ?? null,
      codDesenhoPesquisado: codigo,
      consultaFoccoRealizada: true,

      opcoesFocco: resultado?.opcoes ?? [],
      precisaEscolherFocco: resultado?.precisaEscolher ?? false,

      filhos: aplicarResultadoFoccoNaArvore(
        node.filhos || [],
        mapaResultados
      ),
    };
  });
}

function aplicarEscolhaFoccoNaArvore(
  nodes: EstruturaNode[],
  selectedNodeKey: string,
  opcao: ItemFoccoOpcao
): {
  novaEstrutura: EstruturaNode[];
  nodeAtualizado: EstruturaNode | null;
} {
  let nodeAtualizado: EstruturaNode | null = null;

  function percorrer(
    lista: EstruturaNode[],
    parentKey: string | null = null
  ): EstruturaNode[] {
    return lista.map((node, index) => {
      const nodeKey = parentKey
        ? montarNodeKey(node, parentKey, index)
        : getNodeKey(node, index);

      const filhosAtualizados = percorrer(node.filhos || [], nodeKey);

      if (nodeKey === selectedNodeKey) {
        const atualizado: EstruturaNode = {
          ...node,
          codItemFocco: opcao.codItem,
          descricaoFocco: opcao.descTecnica || opcao.descResumo || null,
          tpItemFocco: opcao.tpItem || null,
          codDesenhoPesquisado: opcao.codDesenho || node.codigo,
          consultaFoccoRealizada: true,
          precisaEscolherFocco: false,
          opcoesFocco: node.opcoesFocco || [],
          filhos: filhosAtualizados,
        };

        nodeAtualizado = atualizado;
        return atualizado;
      }

      return {
        ...node,
        filhos: filhosAtualizados,
      };
    });
  }

  const novaEstrutura = percorrer(nodes);

  return {
    novaEstrutura,
    nodeAtualizado,
  };
}

export default function RevisaoProjetoPage() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [estrutura, setEstrutura] = useState<EstruturaNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<EstruturaNode | null>(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string>("");
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<Set<string>>(
    () => new Set()
  );

  const [loading, setLoading] = useState(false);
  const [consultandoFocco, setConsultandoFocco] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [modalEscolhaOpen, setModalEscolhaOpen] = useState(false);
  const [nodeEscolhaFocco, setNodeEscolhaFocco] =
    useState<EstruturaNode | null>(null);

  const [modalResumoFoccoOpen, setModalResumoFoccoOpen] = useState(false);

  const [filtroArvore, setFiltroArvore] = useState<FiltroArvore | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    node: null,
    nodeKey: null,
  });

  const totalItens = useMemo(() => contarItens(estrutura), [estrutura]);

  const totalItensSemRaiz = useMemo(() => {
    return Math.max(totalItens - 1, 0);
  }, [totalItens]);

  const itensComEscolhaFocco = useMemo(() => {
    return coletarItensComEscolhaFocco(estrutura);
  }, [estrutura]);

  const estruturaFiltrada = useMemo(() => {
    return filtrarArvorePorBase(estrutura, filtroArvore);
  }, [estrutura, filtroArvore]);

  async function handleAnalisar() {
    if (!arquivo) {
      setErro("Selecione uma planilha Excel antes de analisar.");
      setSucesso("");
      return;
    }

    try {
      setLoading(true);
      setErro("");
      setSucesso("");
      setEstrutura([]);
      setSelectedNode(null);
      setSelectedNodeKey("");
      setExpandedNodeKeys(new Set());
      setFiltroArvore(null);
      setContextMenu({
        open: false,
        x: 0,
        y: 0,
        node: null,
        nodeKey: null,
      });
      setModalEscolhaOpen(false);
      setNodeEscolhaFocco(null);
      setModalResumoFoccoOpen(false);

      const retorno = await analisarEstruturaExcel(arquivo);
      const estruturaRetornada = retorno.estrutura || [];

      const raizNivelZero = criarRaizNivelZero(arquivo, estruturaRetornada);
      const raizKey = getNodeKey(raizNivelZero, 0);

      setEstrutura([raizNivelZero]);
      setSelectedNode(raizNivelZero);
      setSelectedNodeKey(raizKey);
      setExpandedNodeKeys(new Set([raizKey]));

      setSucesso("Planilha analisada com sucesso.");

      setTimeout(() => {
        setSucesso("");
      }, 5000);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao analisar estrutura da planilha."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAvancar() {
    if (estrutura.length === 0) {
      setErro("Analise uma estrutura antes de avançar.");
      return;
    }

    try {
      setConsultandoFocco(true);
      setErro("");
      setSucesso("");
      setModalResumoFoccoOpen(false);
      setFiltroArvore(null);

      const codigos = coletarCodigosEstrutura(estrutura);

      if (codigos.length === 0) {
        setErro("Nenhum código encontrado na estrutura para consultar no ERP.");
        return;
      }

      const resultados = await executarComLimite(
        codigos,
        8,
        buscarItemFoccoPorCodDesenho
      );

      const mapaResultados = new Map<string, ResultadoItemFocco>();

      for (const resultado of resultados) {
        mapaResultados.set(resultado.codDesenho, resultado);
      }

      const novaEstrutura = aplicarResultadoFoccoNaArvore(
        estrutura,
        mapaResultados
      );

      const novoNodeSelecionado = novaEstrutura[0] || null;
      const novoNodeKey = novoNodeSelecionado
        ? getNodeKey(novoNodeSelecionado, 0)
        : "";

      setEstrutura(novaEstrutura);
      setSelectedNode(novoNodeSelecionado);
      setSelectedNodeKey(novoNodeKey);
      setExpandedNodeKeys(
        new Set(coletarChavesExpansaoAteNivel(novaEstrutura, 0))
      );

      const totalNaoEncontrados = resultados.filter(
        (resultado) => !resultado.encontrado
      ).length;

      const totalEscolher = resultados.filter(
        (resultado) => resultado.precisaEscolher
      ).length;

      if (totalEscolher > 0) {
        setSucesso(
          `Consulta no ERP concluída. ${totalEscolher} item(ns) precisam de escolha manual.`
        );
      } else if (totalNaoEncontrados > 0) {
        setSucesso(
          `Consulta no ERP concluída. ${totalNaoEncontrados} item(ns) não identificado(s).`
        );
      } else {
        setSucesso("Consulta no ERP concluída com sucesso.");
      }

      setTimeout(() => {
        setSucesso("");
      }, 5000);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao consultar itens no ERP."
      );
    } finally {
      setConsultandoFocco(false);
    }
  }

  function handleSelectNode(node: EstruturaNode, nodeKey: string) {
    setSelectedNode(node);
    setSelectedNodeKey(nodeKey);
  }

  function handleToggleNode(nodeKey: string) {
    setExpandedNodeKeys((prev) => {
      const next = new Set(prev);

      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }

      return next;
    });
  }

  function abrirContextMenuArvore(
    event: MouseEvent<HTMLElement>,
    node: EstruturaNode | null,
    nodeKey: string | null
  ) {
    event.preventDefault();

    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      node,
      nodeKey,
    });
  }

  function fecharContextMenu() {
    setContextMenu((prev) => ({
      ...prev,
      open: false,
    }));
  }

  function handleExpandirTudoContexto() {
    const chaves = coletarChavesExpansaoPorBase(
      estrutura,
      contextMenu.nodeKey
    );

    setExpandedNodeKeys((prev) => {
      const next = new Set(prev);

      chaves.forEach((chave) => next.add(chave));

      return next;
    });
  }

function handleRecolherTudoContexto() {
  const estruturaBase = filtroArvore
    ? filtrarArvorePorBase(estrutura, filtroArvore)
    : estrutura;

  setExpandedNodeKeys(
    new Set(coletarChavesExpansaoAteNivel(estruturaBase, 0))
  );
}

  function handleAplicarFiltroContexto(tipo: EstruturaFiltroTipo) {
    const novoFiltro: FiltroArvore = {
      tipo,
      baseNodeKey: contextMenu.nodeKey,
    };

    const novaEstruturaFiltrada = filtrarArvorePorBase(estrutura, novoFiltro);

    setFiltroArvore(novoFiltro);
    setExpandedNodeKeys(
      new Set(coletarChavesExpansaoAteNivel(novaEstruturaFiltrada, 0))
    );

    const primeiroNode = novaEstruturaFiltrada[0] || null;

    if (primeiroNode) {
      const primeiraKey = getNodeKey(primeiroNode, 0);
      setSelectedNode(primeiroNode);
      setSelectedNodeKey(primeiraKey);
    } else {
      setSelectedNode(null);
      setSelectedNodeKey("");
    }
  }

  function handleLimparFiltros() {
    setFiltroArvore(null);

    if (estrutura[0]) {
      const raizKey = getNodeKey(estrutura[0], 0);
      setExpandedNodeKeys(new Set([raizKey]));
      setSelectedNode(estrutura[0]);
      setSelectedNodeKey(raizKey);
    } else {
      setExpandedNodeKeys(new Set());
      setSelectedNode(null);
      setSelectedNodeKey("");
    }
  }

  function abrirModalEscolhaFocco() {
    if (!selectedNode) return;

    setNodeEscolhaFocco(selectedNode);
    setModalEscolhaOpen(true);
  }

  function abrirEscolhaFoccoPeloResumo(item: ItemComEscolhaFocco) {
    setSelectedNode(item.node);
    setSelectedNodeKey(item.nodeKey);
    setNodeEscolhaFocco(item.node);
    setModalResumoFoccoOpen(false);
    setModalEscolhaOpen(true);
  }

  function fecharModalEscolhaFocco() {
    setModalEscolhaOpen(false);
    setNodeEscolhaFocco(null);
  }

  function handleEscolherItemFocco(opcao: ItemFoccoOpcao) {
    if (!selectedNodeKey) return;

    const { novaEstrutura, nodeAtualizado } = aplicarEscolhaFoccoNaArvore(
      estrutura,
      selectedNodeKey,
      opcao
    );

    setEstrutura(novaEstrutura);

    if (nodeAtualizado) {
      setSelectedNode(nodeAtualizado);
      setNodeEscolhaFocco(nodeAtualizado);
    }

    setModalEscolhaOpen(false);
    setNodeEscolhaFocco(null);
    setModalResumoFoccoOpen(false);

    setSucesso(
      `Item FOCCO ${opcao.codItem} selecionado para ${opcao.codDesenho}.`
    );

    setTimeout(() => {
      setSucesso("");
    }, 5000);
  }

  return (
    <div className={styles.page}>
      {sucesso && <div className={styles.toastSuccess}>✓ {sucesso}</div>}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Revisão de Projetos</h1>
          <p className={styles.subtitle}>
            Importe a estrutura em Excel para montar a árvore do produto e
            preparar o fluxo de revisão.
          </p>
        </div>
      </div>

      <div className={styles.searchCard}>
        <div className={styles.searchRow}>
          <div className={styles.inputGroup}>
            <label htmlFor="arquivoEstrutura" className={styles.label}>
              Planilha da estrutura
            </label>

            <div className={styles.fileInputWrapper}>
              <label
                htmlFor="arquivoEstrutura"
                className={styles.fileInputLabel}
                title={arquivo?.name || "Clique para selecionar uma planilha"}
              >
                {arquivo ? arquivo.name : "Clique para selecionar uma planilha"}
              </label>

              <input
                id="arquivoEstrutura"
                type="file"
                accept=".xlsx,.xls"
                className={styles.hiddenFileInput}
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] || null);
                  setErro("");
                  setSucesso("");
                  setEstrutura([]);
                  setSelectedNode(null);
                  setSelectedNodeKey("");
                  setExpandedNodeKeys(new Set());
                  setFiltroArvore(null);
                  setModalEscolhaOpen(false);
                  setNodeEscolhaFocco(null);
                  setModalResumoFoccoOpen(false);
                }}
              />
            </div>
          </div>

          <button
            type="button"
            className={styles.searchButton}
            onClick={handleAnalisar}
            disabled={loading || consultandoFocco}
          >
            {loading ? "Analisando..." : "Analisar"}
          </button>
        </div>

        {erro && <div className={styles.errorBox}>{erro}</div>}

        {estrutura.length > 0 && (
          <div className={styles.summary}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Item raiz</span>
              <strong>{estrutura[0]?.codigo || "-"}</strong>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Total de itens</span>
              <strong>{totalItensSemRaiz}</strong>
            </div>

            <div
              className={[
                styles.summaryCard,
                itensComEscolhaFocco.length > 0
                  ? styles.summaryCardClickable
                  : "",
              ].join(" ")}
              onClick={() => {
                if (itensComEscolhaFocco.length > 0) {
                  setModalResumoFoccoOpen(true);
                }
              }}
              role={itensComEscolhaFocco.length > 0 ? "button" : undefined}
              tabIndex={itensComEscolhaFocco.length > 0 ? 0 : undefined}
              onKeyDown={(event) => {
                if (
                  itensComEscolhaFocco.length > 0 &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  setModalResumoFoccoOpen(true);
                }
              }}
              title={
                itensComEscolhaFocco.length > 0
                  ? "Clique para visualizar os itens que precisam de escolha FOCCO"
                  : "Nenhum item com múltiplos códigos FOCCO"
              }
            >
              <span className={styles.summaryLabel}>Múltiplos FOCCO</span>
              <strong
                className={
                  itensComEscolhaFocco.length > 0
                    ? styles.warningText
                    : styles.validText
                }
              >
                {itensComEscolhaFocco.length}
              </strong>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Próxima etapa</span>
              <strong>
                {estrutura[0]?.consultaFoccoRealizada
                  ? "FOCCO consultado"
                  : "Comparar FOCCO"}
              </strong>
            </div>
          </div>
        )}
      </div>

      <div className={styles.contentGrid}>
        <section
          className={styles.leftPanel}
          onContextMenu={(event) => {
            abrirContextMenuArvore(event, null, null);
          }}
        >
          <div className={styles.panelHeader}>
            <h2>Árvore da Estrutura</h2>
          </div>

          {filtroArvore && (
            <div className={styles.filterInfoBox}>
              Filtro ativo:{" "}
              <strong>
                {filtroArvore.tipo === "precisaEscolherFocco"
                  ? "Itens que precisam escolher item FOCCO"
                  : "Itens sem código FOCCO"}
              </strong>
            </div>
          )}

          {estruturaFiltrada.length === 0 ? (
            <div className={styles.emptyState}>
              {estrutura.length === 0
                ? "Nenhuma estrutura carregada ainda."
                : "Nenhum item encontrado para o filtro aplicado."}
            </div>
          ) : (
            <div className={styles.treeWrapper}>
              {estruturaFiltrada.map((node, index) => {
                const nodeKey = getNodeKey(node, index);

                return (
                  <EstruturaTree
                    key={nodeKey}
                    node={node}
                    nodeKey={nodeKey}
                    selectedNodeKey={selectedNodeKey}
                    expandedNodeKeys={expandedNodeKeys}
                    onSelectNode={handleSelectNode}
                    onToggleNode={handleToggleNode}
                    onContextMenuNode={abrirContextMenuArvore}
                  />
                );
              })}
            </div>
          )}
        </section>

        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h2>Detalhes do Item</h2>
          </div>

          {!selectedNode ? (
            <div className={styles.emptyState}>
              Selecione um item da árvore para ver os detalhes.
            </div>
          ) : (
            <div className={styles.details}>
              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Código Ciber</span>
                <strong>{selectedNode.codigo}</strong>
              </div>

              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Descrição CIBER</span>
                <strong>{selectedNode.descricao || "-"}</strong>
              </div>

              {selectedNode.consultaFoccoRealizada && (
                <div className={styles.detailBlock}>
                  <span className={styles.detailLabel}>Código FOCCO</span>
                  <strong>
                    {selectedNode.precisaEscolherFocco
                      ? "Escolher item"
                      : selectedNode.codItemFocco || "?"}
                  </strong>
                </div>
              )}

              {selectedNode.precisaEscolherFocco && (
                <button
                  type="button"
                  className={styles.searchButton}
                  onClick={abrirModalEscolhaFocco}
                >
                  Escolher item FOCCO
                </button>
              )}

              {selectedNode.consultaFoccoRealizada && (
                <div className={styles.detailBlock}>
                  <span className={styles.detailLabel}>Descrição FOCCO</span>
                  <strong>
                    {selectedNode.precisaEscolherFocco
                      ? "Aguardando escolha"
                      : selectedNode.descricaoFocco || "Não identificado"}
                  </strong>
                </div>
              )}

              {selectedNode.consultaFoccoRealizada && (
                <div className={styles.detailBlock}>
                  <span className={styles.detailLabel}>Tipo do item FOCCO</span>
                  <strong>
                    {selectedNode.precisaEscolherFocco
                      ? "Aguardando escolha"
                      : formatarTipoItemFocco(selectedNode.tpItemFocco)}
                  </strong>
                </div>
              )}

              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Nível</span>
                <strong>{selectedNode.nivel}</strong>
              </div>

              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Qtde</span>
                <strong>
                  {formatarNumero(selectedNode.quantidade)}{" "}
                  {formatarUnidade(selectedNode.unidade)}
                </strong>
              </div>

              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Itens direto abaixo</span>
                <strong>{selectedNode.filhos?.length || 0}</strong>
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.modalSecondaryButton}>
          Voltar
        </button>

        <button
          type="button"
          className={styles.searchButton}
          disabled={estrutura.length === 0 || loading || consultandoFocco}
          onClick={handleAvancar}
        >
          {consultandoFocco ? "Consultando ERP..." : "Avançar"}
        </button>
      </div>

      <EstruturaContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        hasFilter={!!filtroArvore}
        onExpandirTudo={handleExpandirTudoContexto}
        onRecolherTudo={handleRecolherTudoContexto}
        onFiltrar={handleAplicarFiltroContexto}
        onLimparFiltros={handleLimparFiltros}
        onClose={fecharContextMenu}
      />

      <ResumoItensFoccoModal
        open={modalResumoFoccoOpen}
        itens={itensComEscolhaFocco}
        onClose={() => setModalResumoFoccoOpen(false)}
        onAbrirEscolha={abrirEscolhaFoccoPeloResumo}
      />

      <EscolherItemFoccoModal
        open={modalEscolhaOpen}
        node={nodeEscolhaFocco}
        onClose={fecharModalEscolhaFocco}
        onEscolher={handleEscolherItemFocco}
      />
    </div>
  );
}