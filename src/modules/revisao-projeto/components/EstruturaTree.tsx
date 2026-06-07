"use client";

import { useState } from "react";
import styles from "../RevisaoProjetoPage.module.css";
import { EstruturaNode } from "../types/revisaoProjetoTypes";

type Props = {
  node: EstruturaNode;
  nodeKey: string;
  selectedNodeKey?: string;
  onSelectNode: (node: EstruturaNode, nodeKey: string) => void;
  initiallyExpanded?: boolean;
};

function formatarNumero(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(valor);
}

function montarNodeKey(node: EstruturaNode, parentKey: string, index: number) {
  return `${parentKey}-${node.codigo}-${node.linhaExcel ?? index}-${
    node.nivel ?? 0
  }`;
}

export default function EstruturaTree({
  node,
  nodeKey,
  selectedNodeKey,
  onSelectNode,
  initiallyExpanded = false,
}: Props) {
  const filhos = node.filhos || [];
  const hasChildren = filhos.length > 0;

  const [expanded, setExpanded] = useState(initiallyExpanded);

  const isSelected = selectedNodeKey === nodeKey;

  return (
    <div className={styles.treeNode}>
      <div
        className={[
          styles.treeRow,
          isSelected ? styles.treeRowSelected : "",
        ].join(" ")}
        onClick={() => onSelectNode(node, nodeKey)}
      >
        <button
          type="button"
          className={styles.expandButton}
          onClick={(e) => {
            e.stopPropagation();

            if (hasChildren) {
              setExpanded((prev) => !prev);
            }
          }}
        >
          {hasChildren ? (expanded ? "▾" : "▸") : "•"}
        </button>

        <span className={styles.nodeStatusDot} />

        <div className={styles.treeContent}>
          <div className={styles.nodeTopLine}>
            <span className={styles.nodeCode}>{node.codigo}</span>
          </div>

          <span className={styles.nodeDescription}>
            {node.descricao || "Sem descrição"}
          </span>
        </div>

        <div className={styles.nodeBadges}>
          <span
            className={styles.nodeBadge}
            title={`Quantidade: ${formatarNumero(node.quantidade)} ${
              node.unidade || ""
            }`}
          >
            {formatarNumero(node.quantidade)} {node.unidade || ""}
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
                onSelectNode={onSelectNode}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}