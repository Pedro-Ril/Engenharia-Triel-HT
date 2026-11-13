"use client";

import { useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  FileText,
  FolderInput,
  GripVertical,
  MoreHorizontal,
  Plus,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";

import type { NoArvore } from "../types/blocoNotas.types";
import { tituloOuPadrao } from "../utils/arvore";
import styles from "./BlocoNotas.module.css";

export interface AcoesArvore {
  onSelecionar: (id: string) => void;
  onAlternar: (id: string) => void;
  onNovaSubpagina: (paiId: string) => void;
  onFavoritar: (no: NoArvore) => void;
  onMover: (no: NoArvore) => void;
  onExcluir: (no: NoArvore) => void;
  /* Nova ordem das irmãs depois de arrastar (mesmo pai). */
  onReordenar: (paiId: string | null, ids: string[]) => void;
}

interface ArvorePaginasProps extends AcoesArvore {
  arvore: NoArvore[];
  selecionadaId: string | null;
  expandidos: Set<string>;
}

/*
 * Árvore de páginas do caderno. Arrastar (pela alça) reordena entre
 * irmãs; para trocar de pai existe "Mover para..." no menu da página --
 * arrastar entre níveis numa árvore é impreciso demais no mouse.
 */
export function ArvorePaginas({ arvore, selecionadaId, expandidos, ...acoes }: ArvorePaginasProps) {
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /* Pai de cada página e lista de irmãs, para saber o que reordenar ao soltar. */
  const irmasPorPai = new Map<string | null, string[]>();
  const paiPorId = new Map<string, string | null>();
  const registrar = (lista: NoArvore[], paiId: string | null) => {
    irmasPorPai.set(paiId, lista.map((no) => no.id));
    for (const no of lista) {
      paiPorId.set(no.id, paiId);
      registrar(no.filhos, no.id);
    }
  };
  registrar(arvore, null);

  function aoSoltar(event: DragEndEvent) {
    const ativo = String(event.active.id);
    const alvo = event.over ? String(event.over.id) : null;
    if (!alvo || ativo === alvo) return;

    const paiAtivo = paiPorId.get(ativo) ?? null;
    if ((paiPorId.get(alvo) ?? null) !== paiAtivo) return;

    const irmas = [...(irmasPorPai.get(paiAtivo) ?? [])];
    const de = irmas.indexOf(ativo);
    const para = irmas.indexOf(alvo);
    if (de < 0 || para < 0) return;
    irmas.splice(para, 0, irmas.splice(de, 1)[0]);
    acoes.onReordenar(paiAtivo, irmas);
  }

  return (
    <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
      <ListaNivel
        nos={arvore}
        profundidade={0}
        selecionadaId={selecionadaId}
        expandidos={expandidos}
        menuAbertoId={menuAbertoId}
        setMenuAbertoId={setMenuAbertoId}
        acoes={acoes}
      />
    </DndContext>
  );
}

interface ListaNivelProps {
  nos: NoArvore[];
  profundidade: number;
  selecionadaId: string | null;
  expandidos: Set<string>;
  menuAbertoId: string | null;
  setMenuAbertoId: (id: string | null) => void;
  acoes: AcoesArvore;
}

function ListaNivel(props: ListaNivelProps) {
  return (
    <SortableContext items={props.nos.map((no) => no.id)} strategy={verticalListSortingStrategy}>
      <ul className={styles.arvoreLista} role={props.profundidade === 0 ? "tree" : "group"}>
        {props.nos.map((no) => (
          <ItemArvore key={no.id} no={no} {...props} />
        ))}
      </ul>
    </SortableContext>
  );
}

function ItemArvore({ no, ...props }: ListaNivelProps & { no: NoArvore }) {
  const { profundidade, selecionadaId, expandidos, menuAbertoId, setMenuAbertoId, acoes } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: no.id,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const temFilhos = no.filhos.length > 0;
  const expandido = expandidos.has(no.id);
  const selecionada = selecionadaId === no.id;
  const menuAberto = menuAbertoId === no.id;

  useEffect(() => {
    if (!menuAberto) return;
    function aoClicarFora(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuAbertoId(null);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [menuAberto, setMenuAbertoId]);

  function executar(acao: () => void) {
    setMenuAbertoId(null);
    acao();
  }

  return (
    <li
      ref={setNodeRef}
      role="treeitem"
      aria-expanded={temFilhos ? expandido : undefined}
      aria-selected={selecionada}
      className={isDragging ? styles.arvoreItemArrastando : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div
        className={`${styles.arvoreLinha} ${selecionada ? styles.arvoreLinhaSelecionada : ""}`}
        style={{ paddingLeft: 4 + profundidade * 16 }}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={styles.arvoreAlca}
          aria-label={`Arrastar "${tituloOuPadrao(no.titulo)}" para reordenar`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={13} />
        </button>

        <button
          type="button"
          className={`${styles.arvoreSeta} ${expandido ? styles.arvoreSetaAberta : ""}`}
          onClick={() => acoes.onAlternar(no.id)}
          aria-label={expandido ? "Recolher subpáginas" : "Mostrar subpáginas"}
          disabled={!temFilhos}
        >
          {temFilhos && <ChevronRight size={14} />}
        </button>

        <button type="button" className={styles.arvoreTitulo} onClick={() => acoes.onSelecionar(no.id)}>
          <FileText size={15} className={styles.arvoreIcone} />
          <span className={no.titulo.trim() ? undefined : styles.semTitulo}>{tituloOuPadrao(no.titulo)}</span>
          {no.favorita && <Star size={12} className={styles.estrelaMini} aria-label="Favorita" />}
        </button>

        <div className={styles.arvoreAcoes} ref={menuRef}>
          <button
            type="button"
            className={styles.arvoreAcao}
            onClick={() => acoes.onNovaSubpagina(no.id)}
            aria-label={`Nova subpágina em "${tituloOuPadrao(no.titulo)}"`}
            title="Nova subpágina"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className={styles.arvoreAcao}
            onClick={() => setMenuAbertoId(menuAberto ? null : no.id)}
            aria-label={`Mais ações de "${tituloOuPadrao(no.titulo)}"`}
            aria-expanded={menuAberto}
            title="Mais ações"
          >
            <MoreHorizontal size={14} />
          </button>

          {menuAberto && (
            <div className={styles.menu} role="menu">
              <button type="button" role="menuitem" onClick={() => executar(() => acoes.onFavoritar(no))}>
                {no.favorita ? <StarOff size={14} /> : <Star size={14} />}
                {no.favorita ? "Tirar das favoritas" : "Adicionar às favoritas"}
              </button>
              <button type="button" role="menuitem" onClick={() => executar(() => acoes.onNovaSubpagina(no.id))}>
                <Plus size={14} /> Nova subpágina
              </button>
              <button type="button" role="menuitem" onClick={() => executar(() => acoes.onMover(no))}>
                <FolderInput size={14} /> Mover para...
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuPerigo}
                onClick={() => executar(() => acoes.onExcluir(no))}
              >
                <Trash2 size={14} /> Mover para a lixeira
              </button>
            </div>
          )}
        </div>
      </div>

      {temFilhos && expandido && <ListaNivel {...props} nos={no.filhos} profundidade={profundidade + 1} />}
    </li>
  );
}
