"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";

import styles from "./ColunasModal.module.css";
import {
  COLUNAS,
  COLUNAS_PADRAO,
  colunasDoMiolo,
  definicaoDaColuna,
  type ChaveColuna,
  type GrupoColuna,
} from "../constants/colunas";

/*
 * Escolha e ORDEM das colunas. A lista da esquerda é a tabela: a ordem
 * nela é a ordem na tela, e arrastar muda as duas.
 *
 * Peça, descrição e ações ficam fora do arrasto: a primeira, a segunda e
 * a última posição são fixas. Aparecem na lista mesmo assim, travadas,
 * para a ordem mostrada ser a ordem real da tabela.
 */

interface ColunasModalProps {
  open: boolean;
  colunas: ChaveColuna[];
  onAplicar: (colunas: ChaveColuna[]) => void;
  onClose: () => void;
}

interface LinhaProps {
  chave: ChaveColuna;
  onRemover: (chave: ChaveColuna) => void;
}

/* Posição cravada: sem alça e sem botão de remover. */
function LinhaFixa({ chave }: { chave: ChaveColuna }) {
  const definicao = definicaoDaColuna(chave);
  if (!definicao) return null;

  return (
    <li className={`${styles.linha} ${styles.linhaFixa}`}>
      <span className={styles.travada} title="Posição fixa">
        <Lock size={13} />
      </span>

      <span className={styles.rotulo}>
        {definicao.label}
        <span className={styles.grupo}>posição fixa</span>
      </span>
    </li>
  );
}

function LinhaColuna({ chave, onRemover }: LinhaProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chave,
  });

  const definicao = definicaoDaColuna(chave);
  if (!definicao) return null;

  return (
    <li
      ref={setNodeRef}
      className={styles.linha}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <IconButton
        icon={<GripVertical size={14} />}
        label={`Arrastar ${definicao.label}`}
        size="small"
        className={styles.alca}
        {...attributes}
        {...listeners}
      />

      <span className={styles.rotulo}>
        {definicao.label}
        <span className={styles.grupo}>{definicao.grupo}</span>
      </span>

      {definicao.fixa ? (
        <span className={styles.travada} title="Esta coluna não pode ser removida">
          <Lock size={13} />
        </span>
      ) : (
        <IconButton
          icon={<X size={14} />}
          label={`Remover ${definicao.label}`}
          size="small"
          variant="neutral"
          onClick={() => onRemover(chave)}
        />
      )}
    </li>
  );
}

export function ColunasModal({ open, colunas, onAplicar, onClose }: ColunasModalProps) {
  /* Montado só enquanto aberto (ver a página): a seleção já começa do
     que está valendo, sem efeito para sincronizar. */
  const [selecao, setSelecao] = useState<ChaveColuna[]>(colunas);

  const sensores = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const miolo = useMemo(() => colunasDoMiolo(selecao), [selecao]);

  const disponiveis = useMemo(() => {
    const fora = COLUNAS.filter((coluna) => !selecao.includes(coluna.chave));
    const mapa = new Map<GrupoColuna, typeof COLUNAS>();

    for (const coluna of fora) {
      const atual = mapa.get(coluna.grupo) ?? [];
      atual.push(coluna);
      mapa.set(coluna.grupo, atual);
    }

    return [...mapa.entries()];
  }, [selecao]);

  function handleDragEnd(evento: DragEndEvent) {
    const { active, over } = evento;
    if (!over || active.id === over.id) return;

    setSelecao((anterior) => {
      const atual = colunasDoMiolo(anterior);
      const de = atual.indexOf(active.id as ChaveColuna);
      const para = atual.indexOf(over.id as ChaveColuna);
      if (de < 0 || para < 0) return anterior;

      /* Reordena só o miolo; as fixas voltam às posições delas. */
      return ["peca", "descricao", ...arrayMove(atual, de, para), "acoes"];
    });
  }

  function adicionar(chave: ChaveColuna) {
    /* Entra no fim do miolo: depois das demais e antes de "Ações". */
    setSelecao((anterior) => ["peca", "descricao", ...colunasDoMiolo(anterior), chave, "acoes"]);
  }

  function remover(chave: ChaveColuna) {
    setSelecao((anterior) => anterior.filter((item) => item !== chave));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="large"
      title="Colunas da tabela"
      description="Arraste para mudar a ordem. A escolha fica guardada para você."
      footer={
        <>
          <Button variant="secondary" onClick={() => setSelecao(COLUNAS_PADRAO)}>
            <RotateCcw size={15} />
            Restaurar padrão
          </Button>

          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>

          <Button onClick={() => onAplicar(selecao)}>Aplicar ({selecao.length} colunas)</Button>
        </>
      }
    >
      <div className={styles.colunas}>
        <section className={styles.painel}>
          <h3 className={styles.titulo}>Na tabela — arraste para ordenar</h3>

          <ul className={styles.lista}>
            <LinhaFixa chave="peca" />
            <LinhaFixa chave="descricao" />
          </ul>

          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={miolo} strategy={verticalListSortingStrategy}>
              <ul className={styles.lista}>
                {miolo.map((chave) => (
                  <LinhaColuna key={chave} chave={chave} onRemover={remover} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          <ul className={styles.lista}>
            <LinhaFixa chave="acoes" />
          </ul>
        </section>

        <section className={styles.painel}>
          <h3 className={styles.titulo}>Disponíveis</h3>

          {disponiveis.length === 0 ? (
            <p className={styles.vazio}>Todas as colunas já estão na tabela.</p>
          ) : (
            <div className={styles.grupos}>
              {disponiveis.map(([grupo, colunasDoGrupo]) => (
                <div key={grupo}>
                  <h4 className={styles.subtitulo}>{grupo}</h4>

                  <ul className={styles.lista}>
                    {colunasDoGrupo.map((coluna) => (
                      <li key={coluna.chave} className={styles.linha}>
                        <span className={styles.rotulo}>{coluna.label}</span>

                        <IconButton
                          icon={<Plus size={14} />}
                          label={`Adicionar ${coluna.label}`}
                          size="small"
                          variant="primary"
                          onClick={() => adicionar(coluna.chave)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
