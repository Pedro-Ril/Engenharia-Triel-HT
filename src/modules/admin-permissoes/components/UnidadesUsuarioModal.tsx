"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import { definirUnidadesDoUsuario } from "../services/adminPermissoes.service";
import type { Empresa, PortalUsuarioAdmin, UnidadeEmpresa } from "../types/adminPermissoes.types";
import styles from "./AdminPermissoes.module.css";

interface UnidadesUsuarioModalProps {
  usuario: PortalUsuarioAdmin;
  empresa: Empresa;
  /* Só as ativas da empresa do usuário. */
  unidades: UnidadeEmpresa[];
  selecionadasIniciais: string[];
  onFechar: () => void;
  onSalvo: (unidadeIds: string[]) => void;
}

/*
 * Unidades em que o usuário trabalha. Uma marcada = já vem preenchida
 * no chamado; várias = ele escolhe entre elas; nenhuma = escolhe entre
 * todas as da empresa.
 */
export function UnidadesUsuarioModal({
  usuario,
  empresa,
  unidades,
  selecionadasIniciais,
  onFechar,
  onSalvo,
}: UnidadesUsuarioModalProps) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(
    () => new Set(selecionadasIniciais)
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function alternar(unidadeId: string, marcada: boolean) {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (marcada) proximo.add(unidadeId);
      else proximo.delete(unidadeId);
      return proximo;
    });
  }

  async function handleSalvar() {
    setErro(null);
    setSalvando(true);

    try {
      const ids = unidades.filter((unidade) => selecionadas.has(unidade.id)).map((unidade) => unidade.id);
      const resultado = await definirUnidadesDoUsuario(usuario.id, ids);

      if (resultado.ok) {
        onSalvo(ids);
      } else {
        setErro(resultado.message ?? "Não foi possível salvar as unidades.");
      }
    } finally {
      setSalvando(false);
    }
  }

  const total = selecionadas.size;
  const comportamento =
    total === 0
      ? "Sem unidade marcada: ao abrir chamado, escolhe entre todas as unidades da empresa."
      : total === 1
        ? "Uma unidade: já vem preenchida ao abrir chamado."
        : `${total} unidades: ao abrir chamado, escolhe entre elas.`;

  return (
    <Modal
      open
      onClose={onFechar}
      title={`Unidades — ${usuario.nomeExibicao}`}
      description={empresa.nome}
      footer={
        <Stack direction="row" gap={10} justify="end">
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} loading={salvando}>
            Salvar
          </Button>
        </Stack>
      }
    >
      <Stack gap={16}>
        <div className={`${styles.listaRolavel} ${styles.listaModal}`}>
          {unidades.map((unidade) => (
            <Checkbox
              key={unidade.id}
              id={`unidade-usuario-${unidade.id}`}
              className={styles.checkboxLinha}
              label={unidade.nome}
              checked={selecionadas.has(unidade.id)}
              onChange={(event) => alternar(unidade.id, event.target.checked)}
              disabled={salvando}
            />
          ))}
        </div>

        <Alert variant="info">{comportamento}</Alert>

        {erro && <Alert variant="danger">{erro}</Alert>}
      </Stack>
    </Modal>
  );
}
