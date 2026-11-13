"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import { atualizarUnidade, criarUnidade } from "../services/adminPermissoes.service";
import type { Empresa, UnidadeEmpresa } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface UnidadesEmpresaModalProps {
  empresa: Empresa | null;
  unidades: UnidadeEmpresa[];
  onFechar: () => void;
  onUnidadeSalva: (unidade: UnidadeEmpresa) => void;
  onFeedback: FeedbackHandler;
}

/*
 * Unidades de UMA empresa: criar, renomear e ativar/desativar. Não há
 * excluir -- chamados antigos apontam para a unidade, então desativar
 * é o jeito de tirá-la das opções da abertura de chamado.
 */
export function UnidadesEmpresaModal({
  empresa,
  unidades,
  onFechar,
  onUnidadeSalva,
  onFeedback,
}: UnidadesEmpresaModalProps) {
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const daEmpresa = empresa
    ? unidades
        .filter((unidade) => unidade.empresaId === empresa.id)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    : [];

  function fechar() {
    setNovoNome("");
    setErro(null);
    onFechar();
  }

  async function handleCriar() {
    if (!empresa || !novoNome.trim()) return;

    setErro(null);
    setCriando(true);

    try {
      const resultado = await criarUnidade({ empresaId: empresa.id, nome: novoNome.trim() });

      if (resultado.ok && resultado.data) {
        onUnidadeSalva(resultado.data);
        setNovoNome("");
      } else {
        setErro(resultado.message ?? "Não foi possível criar a unidade.");
      }
    } finally {
      setCriando(false);
    }
  }

  async function handleAtualizar(unidade: UnidadeEmpresa, dados: { nome?: string; ativa?: boolean }) {
    setSalvandoId(unidade.id);

    try {
      const resultado = await atualizarUnidade(unidade.id, dados);

      if (resultado.ok && resultado.data) {
        onUnidadeSalva(resultado.data);
      } else {
        onFeedback(
          "danger",
          "Não foi possível atualizar a unidade",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <Modal
      open={empresa !== null}
      onClose={fechar}
      size="large"
      title={`Unidades — ${empresa?.nome ?? ""}`}
      description="Quem abre chamado escolhe a unidade entre as ativas da empresa dele. Sem nenhuma unidade ativa, o chamado sai sem unidade."
      footer={
        <Button variant="secondary" onClick={fechar}>
          Fechar
        </Button>
      }
    >
      <Stack gap={16}>
        <Stack direction="row" gap={10} align="end">
          <div className={styles.filtroPessoas}>
            <Field label="Nova unidade">
              <Input
                value={novoNome}
                maxLength={100}
                placeholder="ex: Matriz, Filial Sertãozinho"
                onChange={(event) => setNovoNome(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCriar();
                  }
                }}
              />
            </Field>
          </div>

          <Button onClick={handleCriar} loading={criando} disabled={!novoNome.trim()}>
            Adicionar
          </Button>
        </Stack>

        {erro && <Alert variant="danger">{erro}</Alert>}

        {daEmpresa.length === 0 ? (
          <p className={styles.semResultado}>
            Nenhuma unidade cadastrada — os chamados desta empresa saem sem unidade.
          </p>
        ) : (
          <Table minWidth={520}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nome</TableHeaderCell>
                <TableHeaderCell align="center">Pessoas vinculadas</TableHeaderCell>
                <TableHeaderCell align="center">Ativa</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {daEmpresa.map((unidade) => (
                <TableRow key={unidade.id}>
                  <TableCell>
                    <Input
                      key={unidade.nome}
                      defaultValue={unidade.nome}
                      maxLength={100}
                      disabled={salvandoId === unidade.id}
                      onBlur={(event) => {
                        const nome = event.target.value.trim();
                        if (nome && nome !== unidade.nome) {
                          void handleAtualizar(unidade, { nome });
                        } else if (!nome) {
                          event.target.value = unidade.nome;
                        }
                      }}
                    />
                  </TableCell>

                  <TableCell align="center">{unidade.totalUsuarios}</TableCell>

                  <TableCell align="center">
                    <div className={styles.checkboxCentro}>
                      <Switch
                        label=""
                        compact
                        checked={unidade.ativa}
                        disabled={salvandoId === unidade.id}
                        onChange={(event) =>
                          void handleAtualizar(unidade, { ativa: event.target.checked })
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Stack>
    </Modal>
  );
}
