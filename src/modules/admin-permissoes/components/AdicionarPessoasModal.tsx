"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import type { PortalModulo, PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import styles from "./AdminPermissoes.module.css";
import { FiltrosUsuarios, rotuloDepartamento, useFiltroUsuarios } from "./FiltrosUsuarios";

interface AdicionarPessoasModalProps {
  modulo: PortalModulo;
  /* Só quem ainda não tem acesso ao módulo. */
  candidatos: PortalUsuarioAdmin[];
  totalPorUsuario: Map<string, number>;
  onConfirmar: (selecionados: PortalUsuarioAdmin[]) => Promise<void>;
  onClose: () => void;
}

/*
 * Libera um módulo para várias pessoas de uma vez. A seleção sobrevive
 * à troca de filtro (dá para marcar gente de departamentos diferentes);
 * o botão com a quantidade faz o papel da confirmação.
 */
export function AdicionarPessoasModal({
  modulo,
  candidatos,
  totalPorUsuario,
  onConfirmar,
  onClose,
}: AdicionarPessoasModalProps) {
  const filtro = useFiltroUsuarios(candidatos, totalPorUsuario);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [salvando, setSalvando] = useState(false);

  const filtradosNaoMarcados = filtro.filtrados.filter((usuario) => !selecionados.has(usuario.id));

  function alternar(usuarioId: string, marcar: boolean) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (marcar) proximo.add(usuarioId);
      else proximo.delete(usuarioId);
      return proximo;
    });
  }

  function marcarFiltrados() {
    setSelecionados((atual) => new Set([...atual, ...filtro.filtrados.map((usuario) => usuario.id)]));
  }

  async function handleConceder() {
    const lista = candidatos.filter((usuario) => selecionados.has(usuario.id));
    if (lista.length === 0) return;

    setSalvando(true);
    try {
      await onConfirmar(lista);
    } finally {
      setSalvando(false);
    }
  }

  const quantidade = selecionados.size;

  return (
    <Modal
      open
      size="medium"
      title={`Adicionar pessoas a "${modulo.nome}"`}
      description="Marque quem deve passar a ter acesso. Dá para trocar o filtro e continuar marcando gente de outros departamentos."
      onClose={() => {
        if (!salvando) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleConceder} loading={salvando} disabled={quantidade === 0}>
            {quantidade === 0
              ? "Conceder acesso"
              : `Conceder a ${quantidade} ${quantidade === 1 ? "pessoa" : "pessoas"}`}
          </Button>
        </>
      }
    >
      <Stack gap={12}>
        <FiltrosUsuarios filtro={filtro} autoFocus />

        <Stack direction="row" gap={8} align="center" justify="between">
          <span className={styles.contadorLista}>
            {quantidade} {quantidade === 1 ? "selecionada" : "selecionadas"} · {filtro.filtrados.length} na lista
          </span>

          <Stack direction="row" gap={4} align="center">
            <button
              type="button"
              className={styles.acaoLink}
              disabled={filtradosNaoMarcados.length === 0}
              onClick={marcarFiltrados}
            >
              Marcar os da lista
            </button>
            <button
              type="button"
              className={styles.acaoLink}
              disabled={quantidade === 0}
              onClick={() => setSelecionados(new Set())}
            >
              Limpar seleção
            </button>
          </Stack>
        </Stack>

        <div className={`${styles.listaRolavel} ${styles.listaModal}`}>
          {filtro.filtrados.map((usuario) => (
            <Checkbox
              key={usuario.id}
              id={`adicionar-${usuario.id}`}
              className={styles.checkboxLinha}
              label={usuario.nomeExibicao}
              hint={`${rotuloDepartamento(usuario.departamento)} · ${usuario.samAccountName}`}
              checked={selecionados.has(usuario.id)}
              onChange={(event) => alternar(usuario.id, event.target.checked)}
            />
          ))}

          {filtro.filtrados.length === 0 && (
            <p className={styles.semResultado}>
              {candidatos.length === 0 ? "Todo mundo já tem acesso a este módulo." : "Ninguém encontrado com esses filtros."}
            </p>
          )}
        </div>
      </Stack>
    </Modal>
  );
}
