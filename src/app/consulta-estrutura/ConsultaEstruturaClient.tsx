"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./estrutura-produto.module.css";
import EstruturaTree from "@/modules/consulta-estrutura/components/EstruturaTree";
import {
  buscarEstruturaProduto,
  montarArvoreEstrutura,
} from "@/modules/consulta-estrutura/services/estruturaProduto.service";
import {
  EstruturaConsultaResultado,
  EstruturaTreeNode,
} from "@/modules/consulta-estrutura/types/estruturaProduto.types";
import {
  exportarExcelEstrutura,
  exportarPdfEstrutura,
} from "@/modules/consulta-estrutura/services/exportEstrutura";

function formatarData(data?: string | null) {
  if (!data) return "-";

  const date = new Date(data);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatarNumero(valor?: number | null) {
  if (valor === null || valor === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(valor);
}

function isNodeInvalid(node: EstruturaTreeNode): boolean {
  return (
    node.statusValidade?.toUpperCase() === "INVALIDO" ||
    node.registros.some(
      (registro) => registro.STATUS_VALIDADE?.toUpperCase() === "INVALIDO"
    )
  );
}

function filtrarArvoreSomenteInvalidos(
  node: EstruturaTreeNode
): EstruturaTreeNode | null {
  const filhosFiltrados = node.children
    .map((child) => filtrarArvoreSomenteInvalidos(child))
    .filter((child): child is EstruturaTreeNode => child !== null);

  const invalido = isNodeInvalid(node);

  if (!invalido && filhosFiltrados.length === 0) {
    return null;
  }

  return {
    ...node,
    children: filhosFiltrados,
  };
}

function existeNodeNaArvore(
  node: EstruturaTreeNode | null,
  targetId?: string
): boolean {
  if (!node || !targetId) return false;
  if (node.id === targetId) return true;

  return node.children.some((child) => existeNodeNaArvore(child, targetId));
}

export default function ConsultaEstruturaClient() {
  const searchParams = useSearchParams();
  const autoSearchDoneRef = useRef(false);

  const [codigoPai, setCodigoPai] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] =
    useState<EstruturaConsultaResultado | null>(null);
  const [arvore, setArvore] = useState<EstruturaTreeNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<EstruturaTreeNode | null>(
    null
  );
  const [mostrarSomenteInvalidos, setMostrarSomenteInvalidos] = useState(false);

  async function handleBuscar(codigoParam?: string) {
    const codigoConsulta = (codigoParam ?? codigoPai).trim();

    if (!codigoConsulta) {
      setErro("Informe o código do item pai.");
      setResultado(null);
      setArvore(null);
      setSelectedNode(null);
      return;
    }

    try {
      setLoading(true);
      setErro("");

      const dados = await buscarEstruturaProduto(codigoConsulta);
      const arvoreMontada = montarArvoreEstrutura(
        dados.codItemPai,
        dados.descricaoPai,
        dados.data
      );

      setCodigoPai(codigoConsulta);
      setResultado(dados);
      setArvore(arvoreMontada);
      setSelectedNode(arvoreMontada);
    } catch (error) {
      console.error(error);
      setResultado(null);
      setArvore(null);
      setSelectedNode(null);
      setErro(
        error instanceof Error ? error.message : "Erro ao consultar estrutura."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const itemPai = (searchParams.get("itemPai") ?? "").trim();

    if (!itemPai) return;
    if (autoSearchDoneRef.current) return;

    autoSearchDoneRef.current = true;
    setCodigoPai(itemPai);
    handleBuscar(itemPai);
  }, [searchParams]);

  const totalInvalidos = useMemo(() => {
    return (
      resultado?.data.filter(
        (item) => item.STATUS_VALIDADE?.toUpperCase() === "INVALIDO"
      ).length ?? 0
    );
  }, [resultado]);

  const arvoreFiltrada = useMemo(() => {
    if (!arvore) return null;
    if (!mostrarSomenteInvalidos) return arvore;

    return filtrarArvoreSomenteInvalidos(arvore);
  }, [arvore, mostrarSomenteInvalidos]);

  useEffect(() => {
    if (!arvoreFiltrada) {
      setSelectedNode(null);
      return;
    }

    if (!selectedNode || !existeNodeNaArvore(arvoreFiltrada, selectedNode.id)) {
      setSelectedNode(arvoreFiltrada);
    }
  }, [arvoreFiltrada, selectedNode]);

  const registrosSelecionados = useMemo(() => {
    return selectedNode?.registros ?? [];
  }, [selectedNode]);

  const selectedNodeIsInvalid = useMemo(() => {
    if (!selectedNode) return false;
    return isNodeInvalid(selectedNode);
  }, [selectedNode]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Consulta de Estrutura de Produto</h1>
          <p className={styles.subtitle}>
            Pesquise o item pai e visualize a estrutura em formato de árvore.
          </p>
        </div>
      </div>

      <div className={styles.searchCard}>
        <div className={styles.searchRow}>
          <div className={styles.inputGroup}>
            <label htmlFor="codigoPai" className={styles.label}>
              Código do item pai
            </label>
            <input
              id="codigoPai"
              type="text"
              value={codigoPai}
              onChange={(e) => setCodigoPai(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleBuscar();
                }
              }}
              placeholder="Ex.: 282177"
              className={styles.input}
            />
          </div>

          <button
            type="button"
            onClick={() => handleBuscar()}
            disabled={loading}
            className={styles.searchButton}
          >
            {loading ? "Consultando..." : "Consultar"}
          </button>
        </div>

        {erro && <div className={styles.errorBox}>{erro}</div>}

        {resultado && (
          <>
            <div className={styles.summary}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Item pai</span>
                <strong>{resultado.codItemPai}</strong>
              </div>

              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Descrição</span>
                <strong>{resultado.descricaoPai || "-"}</strong>
              </div>

              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total de registros</span>
                <strong>{resultado.total}</strong>
              </div>

              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Itens inativos</span>
                <strong className={styles.invalidText}>{totalInvalidos}</strong>
              </div>
            </div>

            <div className={styles.filterBar}>
              <label className={styles.filterToggle}>
                <input
                  type="checkbox"
                  checked={mostrarSomenteInvalidos}
                  onChange={(e) => setMostrarSomenteInvalidos(e.target.checked)}
                />
                <span className={styles.filterToggleText}>
                  Mostrar apenas itens inativos
                </span>
              </label>

              <span className={styles.filterHint}>
                Exibe somente os nós inválidos e o caminho até eles.
              </span>
            </div>

            <div className={styles.exportBar}>
              <button
                type="button"
                className={styles.exportButton}
                onClick={() => {
                  if (!arvoreFiltrada) return;

                  exportarExcelEstrutura(
                    arvoreFiltrada,
                    mostrarSomenteInvalidos
                      ? `estrutura_invalidos_${resultado.codItemPai}`
                      : `estrutura_completa_${resultado.codItemPai}`
                  );
                }}
              >
                Exportar Excel
              </button>

              <button
                type="button"
                className={styles.exportButtonPdf}
                onClick={() => {
                  if (!arvoreFiltrada) return;

                  exportarPdfEstrutura(
                    arvoreFiltrada,
                    mostrarSomenteInvalidos
                      ? `estrutura_invalidos_${resultado.codItemPai}`
                      : `estrutura_completa_${resultado.codItemPai}`
                  );
                }}
              >
                Exportar PDF
              </button>
            </div>
          </>
        )}
      </div>

      <div className={styles.contentGrid}>
        <section className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h2>Árvore da Estrutura</h2>
          </div>

          <EstruturaTree
            root={arvoreFiltrada}
            selectedNodeId={selectedNode?.id}
            onSelectNode={setSelectedNode}
          />
        </section>

        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h2>Detalhes do Nó</h2>
          </div>

          {!selectedNode ? (
            <div className={styles.emptyState}>
              Selecione um item da árvore para ver os detalhes.
            </div>
          ) : (
            <div className={styles.details}>
              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Código</span>
                <strong>{selectedNode.codigo}</strong>
              </div>

              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Descrição</span>
                <strong>{selectedNode.descricao || "-"}</strong>
              </div>

              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Nível</span>
                <strong>{selectedNode.nivel}</strong>
              </div>

              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Caminho</span>
                <strong>{selectedNode.caminho}</strong>
              </div>

              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Status do nó</span>
                <strong
                  className={
                    selectedNodeIsInvalid
                      ? styles.statusChipInvalid
                      : styles.statusChipNeutral
                  }
                >
                  {selectedNodeIsInvalid
                    ? "Item com validade inativa"
                    : "Sem invalidez neste nó"}
                </strong>
              </div>

              <div className={styles.detailBlock}>
                <span className={styles.detailLabel}>Registros vinculados</span>
                <strong>{registrosSelecionados.length}</strong>
              </div>

              {registrosSelecionados.length > 0 && (
                <div className={styles.recordsList}>
                  {registrosSelecionados.map((registro, index) => (
                    <div
                      key={`${registro.CAMINHO_ESTRUTURA}-${index}`}
                      className={styles.recordCard}
                    >
                      <div className={styles.recordRow}>
                        <span className={styles.recordLabel}>Pai</span>
                        <span>
                          {registro.COD_ITEM_PAI} - {registro.DESC_TECNICA_PAI}
                        </span>
                      </div>

                      <div className={styles.recordRow}>
                        <span className={styles.recordLabel}>Filho</span>
                        <span>
                          {registro.COD_ITEM_FILHO} -{" "}
                          {registro.DESC_TECNICA_FILHO}
                        </span>
                      </div>

                      <div className={styles.recordRow}>
                        <span className={styles.recordLabel}>Quantidade</span>
                        <span>{formatarNumero(registro.QTDE_CORRIGIDA)}</span>
                      </div>

                      <div className={styles.recordRow}>
                        <span className={styles.recordLabel}>Validade</span>
                        <span
                          className={
                            registro.STATUS_VALIDADE?.toUpperCase() ===
                            "INVALIDO"
                              ? styles.invalidText
                              : styles.validText
                          }
                        >
                          {registro.STATUS_VALIDADE || "-"}
                        </span>
                      </div>

                      <div className={styles.recordRow}>
                        <span className={styles.recordLabel}>Data início</span>
                        <span>{formatarData(registro.DT_INI)}</span>
                      </div>

                      <div className={styles.recordRow}>
                        <span className={styles.recordLabel}>Data fim</span>
                        <span>{formatarData(registro.DT_FIM)}</span>
                      </div>

                      <div className={styles.recordRow}>
                        <span className={styles.recordLabel}>
                          Ordem hierárquica
                        </span>
                        <span>{registro.ORDEM_HIERARQUICA}</span>
                      </div>

                      <div className={styles.recordRow}>
                        <span className={styles.recordLabel}>Caminho</span>
                        <span>{registro.CAMINHO_ESTRUTURA}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}