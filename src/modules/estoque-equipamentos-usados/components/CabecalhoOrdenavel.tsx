import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHeaderCell } from "@/components/ui/Table";

import type { DirecaoOrdenacao, OrdenacaoEquipamentos } from "../types/estoque.types";
import styles from "./CabecalhoOrdenavel.module.css";

interface CabecalhoOrdenavelProps {
  coluna: OrdenacaoEquipamentos;
  rotulo: string;
  ordenacao: { coluna: OrdenacaoEquipamentos; direcao: DirecaoOrdenacao };
  onOrdenar: (coluna: OrdenacaoEquipamentos) => void;
  align?: "left" | "center" | "right";
}

/* Título de coluna que ordena a lista ao clicar (clicar de novo inverte). */
export function CabecalhoOrdenavel({ coluna, rotulo, ordenacao, onOrdenar, align }: CabecalhoOrdenavelProps) {
  const ativa = ordenacao.coluna === coluna;
  const Seta = !ativa ? ArrowUpDown : ordenacao.direcao === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHeaderCell
      align={align}
      aria-sort={ativa ? (ordenacao.direcao === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={[styles.botao, ativa ? styles.ativo : ""].filter(Boolean).join(" ")}
        onClick={() => onOrdenar(coluna)}
        title={`Ordenar por ${rotulo.toLowerCase()}`}
      >
        {rotulo}
        <Seta size={13} className={styles.seta} aria-hidden />
      </button>
    </TableHeaderCell>
  );
}
