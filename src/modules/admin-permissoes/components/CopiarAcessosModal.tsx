"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import type { PortalModulo, PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import { departamentoDoUsuario } from "../utils/permissoesFiltros";
import styles from "./AdminPermissoes.module.css";
import { FiltrosUsuarios, rotuloDepartamento, useFiltroUsuarios } from "./FiltrosUsuarios";

interface CopiarAcessosModalProps {
  destino: PortalUsuarioAdmin;
  usuarios: PortalUsuarioAdmin[];
  totalPorUsuario: Map<string, number>;
  modulosDoUsuario: (usuarioId: string) => PortalModulo[];
  onConfirmar: (origem: PortalUsuarioAdmin, modulos: PortalModulo[]) => Promise<void>;
  onClose: () => void;
}

/*
 * "Copiar acessos de..." -- típico de funcionário novo: escolhe um colega
 * (a lista já abre filtrada no departamento de quem recebe) e concede os
 * módulos que ele tem e o destino ainda não. Só soma: nada que o destino
 * já tem é removido. A prévia e o botão com a quantidade fazem o papel
 * da confirmação.
 */
export function CopiarAcessosModal({
  destino,
  usuarios,
  totalPorUsuario,
  modulosDoUsuario,
  onConfirmar,
  onClose,
}: CopiarAcessosModalProps) {
  const candidatos = usuarios.filter((usuario) => usuario.id !== destino.id);
  const departamentoDestino = departamentoDoUsuario(destino);
  const filtro = useFiltroUsuarios(candidatos, totalPorUsuario, {
    departamento: candidatos.some((usuario) => departamentoDoUsuario(usuario) === departamentoDestino)
      ? departamentoDestino
      : "",
    acesso: "com",
  });

  const [origemId, setOrigemId] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);

  const origem = candidatos.find((usuario) => usuario.id === origemId) ?? null;
  const idsDestino = new Set(modulosDoUsuario(destino.id).map((modulo) => modulo.id));
  const modulosOrigem = origem ? modulosDoUsuario(origem.id) : [];
  const novos = modulosOrigem.filter((modulo) => !idsDestino.has(modulo.id));
  const jaTem = modulosOrigem.length - novos.length;

  async function handleCopiar() {
    if (!origem || novos.length === 0) return;

    setCopiando(true);
    try {
      await onConfirmar(origem, novos);
    } finally {
      setCopiando(false);
    }
  }

  return (
    <Modal
      open
      size="medium"
      title={`Copiar acessos para ${destino.nomeExibicao}`}
      description="Escolha de quem copiar. Os módulos que essa pessoa tem são liberados também para quem você está editando — nenhum acesso é removido."
      onClose={() => {
        if (!copiando) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={copiando}>
            Cancelar
          </Button>
          <Button onClick={handleCopiar} loading={copiando} disabled={!origem || novos.length === 0}>
            {novos.length > 0
              ? `Copiar ${novos.length} ${novos.length === 1 ? "acesso" : "acessos"}`
              : "Copiar acessos"}
          </Button>
        </>
      }
    >
      <Stack gap={12}>
        <FiltrosUsuarios filtro={filtro} mostrarAcesso autoFocus />

        <div className={`${styles.listaRolavel} ${styles.listaModal}`} role="listbox" aria-label="Copiar acessos de">
          {filtro.filtrados.map((usuario) => {
            const ativo = usuario.id === origemId;

            return (
              <button
                key={usuario.id}
                type="button"
                role="option"
                aria-selected={ativo}
                className={`${styles.usuarioItem} ${ativo ? styles.usuarioItemAtivo : ""}`}
                onClick={() => setOrigemId(usuario.id)}
              >
                <span className={styles.itemTexto}>
                  <span className={styles.usuarioItemNome}>{usuario.nomeExibicao}</span>
                  <span className={styles.itemSub}>
                    {rotuloDepartamento(usuario.departamento)} · {usuario.samAccountName}
                  </span>
                </span>

                <Badge variant={ativo ? "primary" : "neutral"}>{totalPorUsuario.get(usuario.id) ?? 0}</Badge>
              </button>
            );
          })}

          {filtro.filtrados.length === 0 && (
            <p className={styles.semResultado}>
              Ninguém encontrado com esses filtros. Tente &quot;Todos os departamentos&quot;.
            </p>
          )}
        </div>

        {origem &&
          (novos.length > 0 ? (
            <Stack gap={8}>
              <strong>
                {novos.length === 1 ? "Será liberado 1 módulo" : `Serão liberados ${novos.length} módulos`}
                {jaTem > 0 && ` (${jaTem} já ${jaTem === 1 ? "estava liberado" : "estavam liberados"})`}:
              </strong>
              <div className={styles.previaModulos}>
                {novos.map((modulo) => (
                  <Badge key={modulo.id} variant="info">
                    {modulo.nome}
                  </Badge>
                ))}
              </div>
            </Stack>
          ) : (
            <Alert variant="info">
              {destino.nomeExibicao} já tem todos os acessos de {origem.nomeExibicao}.
            </Alert>
          ))}
      </Stack>
    </Modal>
  );
}
