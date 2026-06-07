"use client";

import { useMemo, useState } from "react";
import styles from "./RevisaoProjetoPage.module.css";
import EstruturaTree from "./components/EstruturaTree";
import { analisarEstruturaExcel } from "./services/revisaoProjetoService";
import { EstruturaNode } from "./types/revisaoProjetoTypes";

function contarItens(nodes: EstruturaNode[]): number {
  return nodes.reduce((total, node) => {
    return total + 1 + contarItens(node.filhos || []);
  }, 0);
}

function contarMpConvertida(nodes: EstruturaNode[]): number {
  return nodes.reduce((total, node) => {
    return (
      total +
      (node.mpConvertidaKg ? 1 : 0) +
      contarMpConvertida(node.filhos || [])
    );
  }, 0);
}

function formatarNumero(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(valor);
}

function getNodeKey(node: EstruturaNode, fallback = 0) {
  return `${node.codigo}-${node.linhaExcel ?? fallback}-${node.nivel ?? 0}`;
}

export default function RevisaoProjetoPage() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [estrutura, setEstrutura] = useState<EstruturaNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<EstruturaNode | null>(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const totalItens = useMemo(() => contarItens(estrutura), [estrutura]);

  const totalMpConvertida = useMemo(
    () => contarMpConvertida(estrutura),
    [estrutura]
  );

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

      const retorno = await analisarEstruturaExcel(arquivo);
      const estruturaRetornada = retorno.estrutura || [];

      setEstrutura(estruturaRetornada);

      const primeiroNode = estruturaRetornada[0] || null;
      setSelectedNode(primeiroNode);
      setSelectedNodeKey(primeiroNode ? getNodeKey(primeiroNode, 0) : "");

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

  function handleSelectNode(node: EstruturaNode, nodeKey: string) {
    setSelectedNode(node);
    setSelectedNodeKey(nodeKey);
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
                }}
              />
            </div>
          </div>

          <button
            type="button"
            className={styles.searchButton}
            onClick={handleAnalisar}
            disabled={loading}
          >
            {loading ? "Analisando..." : "Analisar"}
          </button>
        </div>

        {erro && <div className={styles.errorBox}>{erro}</div>}

        {estrutura.length > 0 && (
          <div className={styles.summary}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Raízes</span>
              <strong>{estrutura.length}</strong>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Total de itens</span>
              <strong>{totalItens}</strong>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>MP convertida</span>
              <strong className={styles.validText}>{totalMpConvertida}</strong>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Próxima etapa</span>
              <strong>Comparar FOCCO</strong>
            </div>
          </div>
        )}
      </div>

      <div className={styles.contentGrid}>
        <section className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h2>Árvore da Estrutura</h2>
          </div>

          {estrutura.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhuma estrutura carregada ainda.
            </div>
          ) : (
            <div className={styles.treeWrapper}>
              {estrutura.map((node, index) => {
                const nodeKey = getNodeKey(node, index);

                return (
                  <EstruturaTree
                    key={nodeKey}
                    node={node}
                    nodeKey={nodeKey}
                    selectedNodeKey={selectedNodeKey}
                    onSelectNode={handleSelectNode}
                    initiallyExpanded
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
                <span className={styles.detailLabel}>Qtde</span>
                <strong>
                  {formatarNumero(selectedNode.quantidade)}{" "}
                  {selectedNode.unidade || "-"}
                </strong>
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
          disabled={estrutura.length === 0}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}