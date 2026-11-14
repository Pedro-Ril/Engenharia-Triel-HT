"use client";

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
  Plus,
  Star,
  StarOff,
  Trash2,
  Users,
} from "lucide-react";

import { DropdownMenu } from "@/components/ui/DropdownMenu";

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
      <ListaNivel nos={arvore} profundidade={0} selecionadaId={selecionadaId} expandidos={expandidos} acoes={acoes} />
    </DndContext>
  );
}

interface ListaNivelProps {
  nos: NoArvore[];
  profundidade: number;
  selecionadaId: string | null;
  expandidos: Set<string>;
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
  const { profundidade, selecionadaId, expandidos, acoes } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: no.id,
  });

  const temFilhos = no.filhos.length > 0;
  const expandido = expandidos.has(no.id);
  const selecionada = selecionadaId === no.id;

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
          {no.compartilhada && (
            <Users size={12} className={styles.iconeCompartilhada} aria-label="Compartilhada" />
          )}
          {no.favorita && <Star size={12} className={styles.estrelaMini} aria-label="Favorita" />}
        </button>

        <div className={styles.arvoreAcoes}>
          <button
            type="button"
            className={styles.arvoreAcao}
            onClick={() => acoes.onNovaSubpagina(no.id)}
            aria-label={`Nova subpágina em "${tituloOuPadrao(no.titulo)}"`}
            title="Nova subpágina"
          >
            <Plus size={14} />
          </button>
          {/*
            Menu desenhado por cima da página (portal), não dentro da
            lateral: a lateral tem rolagem própria e cortava o menu. Perto
            do fim da tela ele abre para cima sozinho.
          */}
          <DropdownMenu
            label={`Mais ações de "${tituloOuPadrao(no.titulo)}"`}
            className={styles.arvoreMenuGatilho}
            items={[
              {
                value: "favorita",
                label: no.favorita ? "Tirar das favoritas" : "Adicionar às favoritas",
                icon: no.favorita ? <StarOff size={14} /> : <Star size={14} />,
                onSelect: () => acoes.onFavoritar(no),
              },
              {
                value: "subpagina",
                label: "Nova subpágina",
                icon: <Plus size={14} />,
                onSelect: () => acoes.onNovaSubpagina(no.id),
              },
              {
                value: "mover",
                label: "Mover para...",
                icon: <FolderInput size={14} />,
                onSelect: () => acoes.onMover(no),
              },
              {
                value: "lixeira",
                label: "Mover para a lixeira",
                icon: <Trash2 size={14} />,
                danger: true,
                separatorBefore: true,
                onSelect: () => acoes.onExcluir(no),
              },
            ]}
          />
        </div>
      </div>

      {temFilhos && expandido && <ListaNivel {...props} nos={no.filhos} profundidade={profundidade + 1} />}
    </li>
  );
}
