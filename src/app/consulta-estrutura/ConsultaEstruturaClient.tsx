"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./estrutura-produto.module.css";
import EstruturaTree from "@/modules/consulta-estrutura/components/EstruturaTree";
import {
  buscarEstruturaProduto,
  montarArvoreEstrutura,
  removerItensInvalidosEstruturaLote,
} from "@/modules/consulta-estrutura/services/estruturaProduto.service";
import {
  EstruturaApiItem,
  EstruturaConsultaResultado,
  EstruturaDeleteInvalidadosLoteGrupoDetalhe,
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

function normalizar(valor?: string | null) {
  return (valor ?? "").trim();
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

type ResultadoExclusaoResumo = {
  mensagem: string;
  commit: boolean;
  rollback: boolean;
  grupos: number;
  ids: number;
  encontrados: number;
  deletados: number;
  gruposComSucesso: string[];
  gruposComFalha: string[];
};

export default function ConsultaEstruturaClient() {
  const searchParams = useSearchParams();
  const autoSearchDoneRef = useRef(false);

  const [codigoPai, setCodigoPai] = useState("");
  const [loading, setLoading] = useState(false);
  const [removendoInvalidos, setRemovendoInvalidos] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] =
    useState<EstruturaConsultaResultado | null>(null);
  const [arvore, setArvore] = useState<EstruturaTreeNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<EstruturaTreeNode | null>(
    null
  );
  const [mostrarSomenteInvalidos, setMostrarSomenteInvalidos] = useState(false);
  const [modalRemocaoOpen, setModalRemocaoOpen] = useState(false);
  const [modalResultadoOpen, setModalResultadoOpen] = useState(false);
  const [resultadoExclusaoSucesso, setResultadoExclusaoSucesso] =
    useState<boolean>(true);
  const [resultadoExclusaoResumo, setResultadoExclusaoResumo] =
    useState<ResultadoExclusaoResumo | null>(null);

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

  const totalInvalidosOcorrencias = useMemo(() => {
    return (
      resultado?.data.filter(
        (item) => item.STATUS_VALIDADE?.toUpperCase() === "INVALIDO"
      ).length ?? 0
    );
  }, [resultado]);

  const registrosInvalidos = useMemo(() => {
    if (!resultado) return [];

    const mapa = new Map<number, EstruturaApiItem>();

    for (const item of resultado.data) {
      if (
        item.STATUS_VALIDADE?.toUpperCase() === "INVALIDO" &&
        typeof item.ID_ESTRUTURA === "number"
      ) {
        if (!mapa.has(item.ID_ESTRUTURA)) {
          mapa.set(item.ID_ESTRUTURA, item);
        }
      }
    }

    return Array.from(mapa.values());
  }, [resultado]);

  const gruposInvalidosPorPai = useMemo(() => {
    const grupos = new Map<string, EstruturaApiItem[]>();

    for (const item of registrosInvalidos) {
      const codPaiDireto = normalizar(item.COD_ITEM_PAI);
      if (!codPaiDireto) continue;

      const listaAtual = grupos.get(codPaiDireto) ?? [];
      listaAtual.push(item);
      grupos.set(codPaiDireto, listaAtual);
    }

    return Array.from(grupos.entries()).map(([codPaiDireto, itens]) => {
      const ids = [
        ...new Set(
          itens
            .map((item) => item.ID_ESTRUTURA)
            .filter((id): id is number => typeof id === "number")
        ),
      ];

      return {
        codPaiDireto,
        itens,
        ids,
      };
    });
  }, [registrosInvalidos]);

  const totalIdsInvalidos = useMemo(() => {
    return registrosInvalidos.length;
  }, [registrosInvalidos]);

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

  async function handleConfirmarRemocaoInvalidos() {
    if (!resultado) return;
    if (gruposInvalidosPorPai.length === 0) return;

    try {
      setRemovendoInvalidos(true);
      setErro("");

      const payload = {
        codItemPaiRaiz: resultado.codItemPai,
        grupos: gruposInvalidosPorPai.map((grupo) => ({
          codPaiDireto: grupo.codPaiDireto,
          ids: grupo.ids,
        })),
      };

      const response = await removerItensInvalidosEstruturaLote(payload);

      await handleBuscar(resultado.codItemPai);
      setModalRemocaoOpen(false);

      const resumo = response?.resumo ?? {};
      const detalhesGrupos: EstruturaDeleteInvalidadosLoteGrupoDetalhe[] =
        Array.isArray(response?.detalhesGrupos) ? response.detalhesGrupos : [];

      const gruposComSucesso = detalhesGrupos
        .filter((grupo) => grupo.status === "sucesso")
        .map((grupo) => `${grupo.codPaiDireto} (${grupo.totalDeletados ?? 0})`);

      const gruposComFalha = detalhesGrupos
        .filter((grupo) => grupo.status === "falha_validacao")
        .map((grupo) => grupo.codPaiDireto);

      setResultadoExclusaoSucesso(true);
      setResultadoExclusaoResumo({
        mensagem: response.message || "Exclusão concluída.",
        commit: !!response.committed,
        rollback: !!response.rollbackExecutado,
        grupos: resumo.totalGruposRecebidos ?? detalhesGrupos.length,
        ids: resumo.totalIdsRecebidos ?? 0,
        encontrados: resumo.totalEncontrados ?? 0,
        deletados: resumo.totalDeletados ?? 0,
        gruposComSucesso,
        gruposComFalha,
      });
      setModalResultadoOpen(true);
    } catch (error) {
      console.error(error);

      const mensagem =
        error instanceof Error
          ? error.message
          : "Erro ao remover itens inválidos.";

      setErro(mensagem);
      setResultadoExclusaoSucesso(false);
      setResultadoExclusaoResumo({
        mensagem,
        commit: false,
        rollback: false,
        grupos: 0,
        ids: 0,
        encontrados: 0,
        deletados: 0,
        gruposComSucesso: [],
        gruposComFalha: [],
      });
      setModalResultadoOpen(true);
    } finally {
      setRemovendoInvalidos(false);
    }
  }

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
            disabled={loading || removendoInvalidos}
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
                <span className={styles.summaryLabel}>
                  Ocorrências inválidas
                </span>
                <strong className={styles.invalidText}>
                  {totalInvalidosOcorrencias}
                </strong>
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

              <button
                type="button"
                className={styles.deleteInvalidButton}
                disabled={
                  loading ||
                  removendoInvalidos ||
                  !resultado ||
                  gruposInvalidosPorPai.length === 0
                }
                onClick={() => {
                  setErro("");
                  setModalRemocaoOpen(true);
                }}
              >
                {removendoInvalidos
                  ? "Removendo..."
                  : `Remover inválidos (${totalIdsInvalidos})`}
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

      {modalRemocaoOpen && resultado && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            if (!removendoInvalidos) {
              setModalRemocaoOpen(false);
            }
          }}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Confirmar exclusão</h3>
                <p className={styles.modalSubtitle}>
                  Revise os itens inválidos encontrados em todos os níveis da
                  estrutura antes de confirmar a exclusão.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => setModalRemocaoOpen(false)}
                disabled={removendoInvalidos}
              >
                ×
              </button>
            </div>

            <div className={styles.modalSummary}>
              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>Item pai raiz</span>
                <strong>{resultado.codItemPai}</strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>Descrição do pai</span>
                <strong>{resultado.descricaoPai || "-"}</strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>
                  Ocorrências inválidas
                </span>
                <strong className={styles.invalidText}>
                  {totalInvalidosOcorrencias}
                </strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>
                  IDs inválidos únicos
                </span>
                <strong className={styles.invalidText}>
                  {registrosInvalidos.length}
                </strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>
                  Pais diretos envolvidos
                </span>
                <strong>{gruposInvalidosPorPai.length}</strong>
              </div>
            </div>

            <div className={styles.modalTableWrapper}>
              <table className={styles.modalTable}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Qtd.</th>
                    <th>Nível</th>
                    <th>Cód. pai</th>
                    <th>Descrição do pai</th>
                    <th>Ordem hierárquica</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosInvalidos.map((item, index) => (
                    <tr key={`${item.ID_ESTRUTURA}-${index}`}>
                      <td>{item.ID_ESTRUTURA ?? "-"}</td>
                      <td>{item.COD_ITEM_FILHO ?? "-"}</td>
                      <td>{item.DESC_TECNICA_FILHO ?? "-"}</td>
                      <td>{formatarNumero(item.QTDE_CORRIGIDA ?? item.QTDE)}</td>
                      <td>{item.NIVEL ?? "-"}</td>
                      <td>{item.COD_ITEM_PAI ?? "-"}</td>
                      <td>{item.DESC_TECNICA_PAI ?? "-"}</td>
                      <td>{item.ORDEM_HIERARQUICA ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondaryButton}
                onClick={() => setModalRemocaoOpen(false)}
                disabled={removendoInvalidos}
              >
                Cancelar
              </button>

              <button
                type="button"
                className={styles.modalDangerButton}
                onClick={handleConfirmarRemocaoInvalidos}
                disabled={removendoInvalidos || gruposInvalidosPorPai.length === 0}
              >
                {removendoInvalidos
                  ? "Excluindo inválidos..."
                  : "Confirmar exclusão dos inválidos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalResultadoOpen && resultadoExclusaoResumo && (
        <div
          className={styles.modalOverlay}
          onClick={() => setModalResultadoOpen(false)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>
                  {resultadoExclusaoSucesso
                    ? "Resultado da exclusão"
                    : "Erro na exclusão"}
                </h3>
                <p className={styles.modalSubtitle}>
                  {resultadoExclusaoSucesso
                    ? "Confira o retorno da operação executada."
                    : "A operação não foi concluída. Confira os detalhes abaixo."}
                </p>
              </div>

              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => setModalResultadoOpen(false)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalSummary}>
              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>Mensagem</span>
                <strong>{resultadoExclusaoResumo.mensagem}</strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>Commit realizado</span>
                <strong
                  className={
                    resultadoExclusaoResumo.commit
                      ? styles.validText
                      : styles.invalidText
                  }
                >
                  {resultadoExclusaoResumo.commit ? "Sim" : "Não"}
                </strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>Rollback executado</span>
                <strong
                  className={
                    resultadoExclusaoResumo.rollback
                      ? styles.invalidText
                      : styles.validText
                  }
                >
                  {resultadoExclusaoResumo.rollback ? "Sim" : "Não"}
                </strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>Grupos processados</span>
                <strong>{resultadoExclusaoResumo.grupos}</strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>IDs recebidos</span>
                <strong>{resultadoExclusaoResumo.ids}</strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>Encontrados</span>
                <strong>{resultadoExclusaoResumo.encontrados}</strong>
              </div>

              <div className={styles.modalSummaryCard}>
                <span className={styles.summaryLabel}>Deletados</span>
                <strong className={styles.validText}>
                  {resultadoExclusaoResumo.deletados}
                </strong>
              </div>
            </div>

            <div className={styles.modalBody}>
              {resultadoExclusaoResumo.gruposComSucesso.length > 0 && (
                <div className={styles.resultSection}>
                  <h4 className={styles.resultSectionTitle}>
                    Grupos com sucesso
                  </h4>
                  <div className={styles.resultTagList}>
                    {resultadoExclusaoResumo.gruposComSucesso.map((grupo) => (
                      <span key={grupo} className={styles.resultTagSuccess}>
                        {grupo}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {resultadoExclusaoResumo.gruposComFalha.length > 0 && (
                <div className={styles.resultSection}>
                  <h4 className={styles.resultSectionTitle}>
                    Grupos com falha de validação
                  </h4>
                  <div className={styles.resultTagList}>
                    {resultadoExclusaoResumo.gruposComFalha.map((grupo) => (
                      <span key={grupo} className={styles.resultTagError}>
                        {grupo}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondaryButton}
                onClick={() => setModalResultadoOpen(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}