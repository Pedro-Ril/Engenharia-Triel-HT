"use client";

import { useState } from "react";
import styles from "@/app/consulta-estrutura/estrutura-produto.module.css";
import { EstruturaTreeNode } from "../types/estruturaProduto.types";

type Props = {
  root: EstruturaTreeNode | null;
  selectedNodeId?: string;
  onSelectNode: (node: EstruturaTreeNode) => void;
};

type NodeProps = {
  node: EstruturaTreeNode;
  selectedNodeId?: string;
  onSelectNode: (node: EstruturaTreeNode) => void;
  initiallyExpanded?: boolean;
};

function isNodeInvalid(node: EstruturaTreeNode): boolean {
  return (
    node.statusValidade?.toUpperCase() === "INVALIDO" ||
    node.registros.some(
      (registro) => registro.STATUS_VALIDADE?.toUpperCase() === "INVALIDO"
    )
  );
}

function NodeItem({
  node,
  selectedNodeId,
  onSelectNode,
  initiallyExpanded = false,
}: NodeProps) {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const isSelected = selectedNodeId === node.id;

  const isInvalid = isNodeInvalid(node);

  const totalFilhos = node.children.length;
  const totalFilhosInvalidos = node.children.filter((child) =>
    isNodeInvalid(child)
  ).length;

  return (
    <div className={styles.treeNode}>
      <div
        className={[
          styles.treeRow,
          isSelected ? styles.treeRowSelected : "",
          isInvalid ? styles.treeRowInvalid : "",
        ].join(" ")}
        onClick={() => onSelectNode(node)}
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

        <span
          className={
            isInvalid ? styles.nodeStatusDotInvalid : styles.nodeStatusDot
          }
        />

        <div className={styles.treeContent}>
          <div className={styles.nodeTopLine}>
            <span className={styles.nodeCode}>{node.codigo}</span>

            {isInvalid && <span className={styles.invalidBadge}>Inativo</span>}
          </div>

          <span className={styles.nodeDescription}>
            {node.descricao || "Sem descrição"}
          </span>
        </div>

        {hasChildren && (
          <div className={styles.nodeBadges}>
            {totalFilhosInvalidos > 0 && (
              <span
                className={styles.nodeBadgeInvalid}
                title={`Itens inativos no próximo nível: ${totalFilhosInvalidos}`}
              >
                {totalFilhosInvalidos}
              </span>
            )}

            <span
              className={styles.nodeBadge}
              title={`Total de itens no próximo nível: ${totalFilhos}`}
            >
              {totalFilhos}
            </span>
          </div>
        )}
      </div>

      {hasChildren && expanded && (
        <div className={styles.treeChildren}>
          {node.children.map((child) => (
            <NodeItem
              key={child.id}
              node={child}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EstruturaTree({
  root,
  selectedNodeId,
  onSelectNode,
}: Props) {
  if (!root) {
    return (
      <div className={styles.emptyState}>
        Informe um código do item pai para visualizar a estrutura.
      </div>
    );
  }

  return (
    <div className={styles.treeWrapper}>
      <NodeItem
        node={root}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
        initiallyExpanded
      />
    </div>
  );
}