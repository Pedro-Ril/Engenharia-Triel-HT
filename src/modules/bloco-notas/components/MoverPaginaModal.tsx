"use client";

import { useState } from "react";
import { BookOpen, FileText } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import type { NoArvore, PaginaResumo } from "../types/blocoNotas.types";
import { achatarArvore, idsDaSubarvore, tituloOuPadrao } from "../utils/arvore";
import styles from "./BlocoNotas.module.css";

interface MoverPaginaModalProps {
  pagina: NoArvore;
  arvore: NoArvore[];
  paginas: PaginaResumo[];
  onFechar: () => void;
  onMover: (paiId: string | null) => Promise<void>;
}

/* Escolhe o novo lugar da página: raiz do caderno ou dentro de outra (nunca dentro dela mesma ou de uma subpágina dela). */
export function MoverPaginaModal({ pagina, arvore, paginas, onFechar, onMover }: MoverPaginaModalProps) {
  const [destino, setDestino] = useState<string | null | undefined>(undefined);
  const [movendo, setMovendo] = useState(false);

  const bloqueadas = idsDaSubarvore(paginas, pagina.id);
  const opcoes = achatarArvore(arvore).filter(({ no }) => !bloqueadas.has(no.id));
  const mesmoLugar = destino === undefined || destino === pagina.paiId;

  async function confirmar() {
    if (destino === undefined) return;
    setMovendo(true);
    try {
      await onMover(destino);
    } finally {
      setMovendo(false);
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      title={`Mover "${tituloOuPadrao(pagina.titulo)}"`}
      description="Escolha onde a página (com as subpáginas dela) vai ficar."
      footer={
        <Stack direction="row" gap={10} justify="end">
          <Button variant="secondary" onClick={onFechar} disabled={movendo}>
            Cancelar
          </Button>
          <Button onClick={confirmar} loading={movendo} disabled={mesmoLugar}>
            Mover
          </Button>
        </Stack>
      }
    >
      <div className={styles.destinos} role="listbox" aria-label="Destino">
        <button
          type="button"
          role="option"
          aria-selected={destino === null}
          className={`${styles.destino} ${destino === null ? styles.destinoSelecionado : ""}`}
          onClick={() => setDestino(null)}
        >
          <BookOpen size={15} /> Raiz do caderno
        </button>

        {opcoes.map(({ no, profundidade }) => (
          <button
            key={no.id}
            type="button"
            role="option"
            aria-selected={destino === no.id}
            className={`${styles.destino} ${destino === no.id ? styles.destinoSelecionado : ""}`}
            style={{ paddingLeft: 12 + (profundidade + 1) * 16 }}
            onClick={() => setDestino(no.id)}
          >
            <FileText size={14} /> {tituloOuPadrao(no.titulo)}
          </button>
        ))}
      </div>
    </Modal>
  );
}
