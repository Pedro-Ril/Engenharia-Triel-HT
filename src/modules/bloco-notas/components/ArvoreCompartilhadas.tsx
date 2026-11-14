"use client";

import { ChevronRight, Eye, FileText, PencilLine } from "lucide-react";

import type { PaginaCompartilhadaComigo } from "../types/blocoNotas.types";
import { tituloOuPadrao } from "../utils/arvore";
import styles from "./BlocoNotas.module.css";

interface NoCompartilhado extends PaginaCompartilhadaComigo {
  filhos: NoCompartilhado[];
}

function montar(lista: PaginaCompartilhadaComigo[]): NoCompartilhado[] {
  const porId = new Map<string, NoCompartilhado>();
  for (const item of lista) porId.set(item.id, { ...item, filhos: [] });
  const raizes: NoCompartilhado[] = [];
  for (const no of porId.values()) {
    const pai = no.paiId ? porId.get(no.paiId) : undefined;
    if (pai) pai.filhos.push(no);
    else raizes.push(no);
  }
  const ordenar = (nos: NoCompartilhado[]) => {
    nos.sort((a, b) => a.ordem - b.ordem);
    nos.forEach((no) => ordenar(no.filhos));
  };
  ordenar(raizes);
  return raizes;
}

interface ArvoreCompartilhadasProps {
  paginas: PaginaCompartilhadaComigo[];
  selecionadaId: string | null;
  expandidos: Set<string>;
  onSelecionar: (id: string) => void;
  onAlternar: (id: string) => void;
}

/*
 * "Compartilhadas comigo": páginas que outras pessoas abriram para mim,
 * agrupadas por dono. Só navegação -- mover, excluir, favoritar e criar
 * subpáginas continuam sendo do dono.
 */
export function ArvoreCompartilhadas({ paginas, ...props }: ArvoreCompartilhadasProps) {
  const raizes = montar(paginas);
  const porDono = new Map<string, NoCompartilhado[]>();
  for (const raiz of raizes) {
    porDono.set(raiz.donoNome, [...(porDono.get(raiz.donoNome) ?? []), raiz]);
  }

  return (
    <div className={styles.compartilhadasGrupos}>
      {[...porDono.entries()].map(([dono, nos]) => (
        <div key={dono}>
          <span className={styles.compartilhadasDono}>de {dono}</span>
          <Nivel nos={nos} profundidade={0} {...props} />
        </div>
      ))}
    </div>
  );
}

function Nivel({
  nos,
  profundidade,
  ...props
}: Omit<ArvoreCompartilhadasProps, "paginas"> & { nos: NoCompartilhado[]; profundidade: number }) {
  return (
    <ul className={styles.arvoreLista} role={profundidade === 0 ? "tree" : "group"}>
      {nos.map((no) => {
        const temFilhos = no.filhos.length > 0;
        const expandido = props.expandidos.has(no.id);
        const selecionada = props.selecionadaId === no.id;
        return (
          <li key={no.id} role="treeitem" aria-expanded={temFilhos ? expandido : undefined} aria-selected={selecionada}>
            <div
              className={`${styles.arvoreLinha} ${selecionada ? styles.arvoreLinhaSelecionada : ""}`}
              style={{ paddingLeft: 4 + profundidade * 16 }}
            >
              <button
                type="button"
                className={`${styles.arvoreSeta} ${expandido ? styles.arvoreSetaAberta : ""}`}
                onClick={() => props.onAlternar(no.id)}
                aria-label={expandido ? "Recolher subpáginas" : "Mostrar subpáginas"}
                disabled={!temFilhos}
              >
                {temFilhos && <ChevronRight size={14} />}
              </button>
              <button type="button" className={styles.arvoreTitulo} onClick={() => props.onSelecionar(no.id)}>
                <FileText size={15} className={styles.arvoreIcone} />
                <span className={no.titulo.trim() ? undefined : styles.semTitulo}>{tituloOuPadrao(no.titulo)}</span>
                {no.permissao === "ver" ? (
                  <Eye size={12} className={styles.iconeCompartilhada} aria-label="Só leitura" />
                ) : (
                  <PencilLine size={12} className={styles.iconeCompartilhada} aria-label="Pode editar" />
                )}
              </button>
            </div>
            {temFilhos && expandido && <Nivel {...props} nos={no.filhos} profundidade={profundidade + 1} />}
          </li>
        );
      })}
    </ul>
  );
}
