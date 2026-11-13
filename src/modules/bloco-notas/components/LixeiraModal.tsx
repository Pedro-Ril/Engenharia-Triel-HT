"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import {
  esvaziarLixeira,
  excluirDefinitivamente,
  listarLixeira,
  restaurarPagina,
} from "../services/blocoNotas.service";
import type { PaginaLixeira } from "../types/blocoNotas.types";
import { tituloOuPadrao } from "../utils/arvore";
import styles from "./BlocoNotas.module.css";

interface LixeiraModalProps {
  onFechar: () => void;
  /* Algo voltou da lixeira ou saiu de vez: a árvore/contador precisam recarregar. */
  onMudou: (restauradaId?: string) => void;
}

const DIAS_NA_LIXEIRA = 30;

function diasRestantes(excluidaEm: string): number {
  const decorrido = (Date.now() - new Date(excluidaEm).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(DIAS_NA_LIXEIRA - decorrido));
}

export function LixeiraModal({ onFechar, onMudou }: LixeiraModalProps) {
  const [itens, setItens] = useState<PaginaLixeira[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<PaginaLixeira | null>(null);
  const [esvaziando, setEsvaziando] = useState(false);
  const [confirmandoEsvaziar, setConfirmandoEsvaziar] = useState(false);

  async function carregar() {
    const resultado = await listarLixeira();
    if (resultado.ok && resultado.data) setItens(resultado.data);
    else setErro(resultado.message ?? "Não foi possível abrir a lixeira.");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do modal
    void carregar();
  }, []);

  async function restaurar(item: PaginaLixeira) {
    setOcupadoId(item.id);
    setErro(null);
    const resultado = await restaurarPagina(item.id);
    setOcupadoId(null);
    if (!resultado.ok) {
      setErro(resultado.message ?? "Não foi possível restaurar.");
      return;
    }
    setItens((atual) => atual?.filter((outro) => outro.id !== item.id) ?? null);
    onMudou(item.id);
  }

  async function excluirDeVez() {
    if (!excluindo) return;
    setOcupadoId(excluindo.id);
    setErro(null);
    const resultado = await excluirDefinitivamente(excluindo.id);
    setOcupadoId(null);
    if (!resultado.ok) {
      setErro(resultado.message ?? "Não foi possível excluir.");
    } else {
      setItens((atual) => atual?.filter((outro) => outro.id !== excluindo.id) ?? null);
      onMudou();
    }
    setExcluindo(null);
  }

  async function esvaziar() {
    setEsvaziando(true);
    setErro(null);
    const resultado = await esvaziarLixeira();
    setEsvaziando(false);
    setConfirmandoEsvaziar(false);
    if (!resultado.ok) {
      setErro(resultado.message ?? "Não foi possível esvaziar a lixeira.");
      return;
    }
    setItens([]);
    onMudou();
  }

  return (
    <>
      <Modal
        open
        onClose={onFechar}
        size="large"
        title="Lixeira"
        description={`Páginas excluídas ficam aqui por ${DIAS_NA_LIXEIRA} dias e depois somem sozinhas.`}
        footer={
          <Stack direction="row" gap={10} justify="between">
            <Button
              variant="danger"
              onClick={() => setConfirmandoEsvaziar(true)}
              disabled={!itens || itens.length === 0}
            >
              <Trash2 size={16} /> Esvaziar lixeira
            </Button>
            <Button variant="secondary" onClick={onFechar}>
              Fechar
            </Button>
          </Stack>
        }
      >
        <Stack gap={12}>
          {erro && <Alert variant="danger">{erro}</Alert>}

          {!itens ? (
            <Loader label="Abrindo a lixeira..." />
          ) : itens.length === 0 ? (
            <EmptyState icon={<Trash2 size={26} />} title="A lixeira está vazia" />
          ) : (
            <ul className={styles.lixeiraLista}>
              {itens.map((item) => (
                <li key={item.id} className={styles.lixeiraItem}>
                  <div className={styles.lixeiraTextos}>
                    <strong>{tituloOuPadrao(item.titulo)}</strong>
                    <span>
                      {item.subpaginas > 0 &&
                        `com ${item.subpaginas} ${item.subpaginas === 1 ? "subpágina" : "subpáginas"} · `}
                      some em {diasRestantes(item.excluidaEm)} {diasRestantes(item.excluidaEm) === 1 ? "dia" : "dias"}
                    </span>
                  </div>
                  <Stack direction="row" gap={6}>
                    <Button
                      variant="secondary"
                      onClick={() => restaurar(item)}
                      loading={ocupadoId === item.id && !excluindo}
                      disabled={ocupadoId !== null}
                    >
                      <RotateCcw size={15} /> Restaurar
                    </Button>
                    <IconButton
                      icon={<Trash2 size={15} />}
                      label={`Excluir "${tituloOuPadrao(item.titulo)}" definitivamente`}
                      variant="danger"
                      disabled={ocupadoId !== null}
                      onClick={() => setExcluindo(item)}
                    />
                  </Stack>
                </li>
              ))}
            </ul>
          )}
        </Stack>
      </Modal>

      <ConfirmDialog
        open={excluindo !== null}
        title="Excluir definitivamente?"
        message={
          <>
            <strong>{tituloOuPadrao(excluindo?.titulo ?? "")}</strong>
            {excluindo && excluindo.subpaginas > 0 ? ` e as ${excluindo.subpaginas} subpáginas dela` : ""} vão
            sumir para sempre, sem como recuperar.
          </>
        }
        confirmLabel="Excluir de vez"
        variant="danger"
        loading={ocupadoId !== null && excluindo !== null}
        onClose={() => setExcluindo(null)}
        onConfirm={excluirDeVez}
      />

      <ConfirmDialog
        open={confirmandoEsvaziar}
        title="Esvaziar a lixeira?"
        message="Todas as páginas da lixeira vão sumir para sempre, sem como recuperar."
        confirmLabel="Esvaziar"
        variant="danger"
        loading={esvaziando}
        onClose={() => setConfirmandoEsvaziar(false)}
        onConfirm={esvaziar}
      />
    </>
  );
}
