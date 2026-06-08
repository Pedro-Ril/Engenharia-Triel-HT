"use client";

import styles from "../RevisaoProjetoPage.module.css";
import { EstruturaNode } from "../types/revisaoProjetoTypes";

type Props = {
  node: EstruturaNode;
  nodeKey: string;
  selectedNodeKey?: string;

  expandedNodeKeys: Set<string>;

  onSelectNode: (node: EstruturaNode, nodeKey: string) => void;
  onToggleNode: (nodeKey: string) => void;

  onContextMenuNode: (
  event: React.MouseEvent<HTMLElement>,
  node: EstruturaNode,
  nodeKey: string
) => void;
};

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

function montarNodeKey(node: EstruturaNode, parentKey: string, index: number) {
  return `${parentKey}-${node.codigo}-${node.linhaExcel ?? index}-${
    node.nivel ?? 0
  }`;
}

function getTextoFocco(node: EstruturaNode) {
  if (!node.consultaFoccoRealizada) {
    return "";
  }

  if (node.precisaEscolherFocco) {
    return "Escolher item";
  }

  return node.codItemFocco || "?";
}

export default function EstruturaTree({
  node,
  nodeKey,
  selectedNodeKey,
  expandedNodeKeys,
  onSelectNode,
  onToggleNode,
  onContextMenuNode,
}: Props) {
  const filhos = node.filhos || [];
  const hasChildren = filhos.length > 0;

  const expanded = expandedNodeKeys.has(nodeKey);
  const isSelected = selectedNodeKey === nodeKey;
  const textoFocco = getTextoFocco(node);

  return (
    <div className={styles.treeNode}>
      <div
        className={[
          styles.treeRow,
          isSelected ? styles.treeRowSelected : "",
        ].join(" ")}
        onClick={() => onSelectNode(node, nodeKey)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenuNode(event, node, nodeKey);
        }}
      >
        <button
          type="button"
          className={styles.expandButton}
          onClick={(event) => {
            event.stopPropagation();

            if (hasChildren) {
              onToggleNode(nodeKey);
            }
          }}
        >
          {hasChildren ? (expanded ? "▾" : "▸") : "•"}
        </button>

        <span className={styles.nodeStatusDot} />

        <div className={styles.treeContent}>
          <div className={styles.nodeTopLine}>
            <span className={styles.nodeCode}>
              {node.codigo}

              {textoFocco && (
                <span className={styles.nodeFoccoCode}>
                  {" "}
                  ({textoFocco})
                </span>
              )}
            </span>
          </div>

          <span className={styles.nodeDescription}>
            {node.descricao || "Sem descrição"}
          </span>
        </div>

        <div className={styles.nodeBadges}>
          <span
            className={styles.nodeBadge}
            title={`Quantidade: ${formatarNumero(
              node.quantidade
            )} ${formatarUnidade(node.unidade)}`}
          >
            {formatarNumero(node.quantidade)} {formatarUnidade(node.unidade)}
          </span>

          {hasChildren && (
            <span
              className={styles.nodeBadge}
              title={`Total de itens no próximo nível: ${filhos.length}`}
            >
              {filhos.length}
            </span>
          )}
        </div>
      </div>

      {hasChildren && expanded && (
        <div className={styles.treeChildren}>
          {filhos.map((child, index) => {
            const childKey = montarNodeKey(child, nodeKey, index);

            return (
              <EstruturaTree
                key={childKey}
                node={child}
                nodeKey={childKey}
                selectedNodeKey={selectedNodeKey}
                expandedNodeKeys={expandedNodeKeys}
                onSelectNode={onSelectNode}
                onToggleNode={onToggleNode}
                onContextMenuNode={onContextMenuNode}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}