"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
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

import { atualizarEmpresa, criarEmpresa } from "../services/adminPermissoes.service";
import type { Empresa } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface EmpresasPainelProps {
  empresas: Empresa[];
  onFeedback: FeedbackHandler;
  onEmpresaCriada: (empresa: Empresa) => void;
  onEmpresaAtualizada: (empresa: Empresa) => void;
}

const novaEmpresaInicial = {
  nome: "",
  codigo: "",
  corPrimariaClara: "#b71c1c",
  corPrimariaEscura: "#e04545",
};

export function EmpresasPainel({
  empresas,
  onFeedback,
  onEmpresaCriada,
  onEmpresaAtualizada,
}: EmpresasPainelProps) {
  const [novaEmpresa, setNovaEmpresa] = useState(novaEmpresaInicial);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  async function handleCriar() {
    setErro(null);
    setCriando(true);

    try {
      const resultado = await criarEmpresa(novaEmpresa);

      if (resultado.ok && resultado.data) {
        onEmpresaCriada(resultado.data);
        setNovaEmpresa(novaEmpresaInicial);
        onFeedback(
          "success",
          "Empresa criada",
          `"${resultado.data.nome}" já pode ser atribuída a usuários.`
        );
      } else {
        setErro(resultado.message ?? "Não foi possível criar a empresa.");
      }
    } finally {
      setCriando(false);
    }
  }

  async function handleAtualizar(
    empresa: Empresa,
    campos: Partial<
      Pick<Empresa, "nome" | "codigo" | "corPrimariaClara" | "corPrimariaEscura" | "ativa">
    >
  ) {
    setSalvandoId(empresa.id);

    try {
      const resultado = await atualizarEmpresa(empresa.id, campos);

      if (resultado.ok && resultado.data) {
        onEmpresaAtualizada(resultado.data);
      } else {
        onFeedback(
          "danger",
          "Não foi possível atualizar a empresa",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <Stack gap={20}>
      <Card
        title="Nova empresa"
        description="Define uma cor principal própria (clara e escura) para os usuários atribuídos a ela — o resto do visual continua igual para todos."
      >
        <Stack gap={16}>
          <FormGrid columns={4}>
            <Field label="Nome">
              <Input
                value={novaEmpresa.nome}
                onChange={(event) =>
                  setNovaEmpresa((atual) => ({ ...atual, nome: event.target.value }))
                }
              />
            </Field>

            <Field label="Código" hint="livre, opcional">
              <Input
                value={novaEmpresa.codigo}
                onChange={(event) =>
                  setNovaEmpresa((atual) => ({ ...atual, codigo: event.target.value }))
                }
              />
            </Field>

            <Field label="Cor principal — modo claro">
              <input
                type="color"
                className={styles.corInput}
                value={novaEmpresa.corPrimariaClara}
                onChange={(event) =>
                  setNovaEmpresa((atual) => ({
                    ...atual,
                    corPrimariaClara: event.target.value,
                  }))
                }
              />
            </Field>

            <Field label="Cor principal — modo escuro">
              <input
                type="color"
                className={styles.corInput}
                value={novaEmpresa.corPrimariaEscura}
                onChange={(event) =>
                  setNovaEmpresa((atual) => ({
                    ...atual,
                    corPrimariaEscura: event.target.value,
                  }))
                }
              />
            </Field>
          </FormGrid>

          {erro && <Alert variant="danger">{erro}</Alert>}

          <Stack direction="row" justify="end" gap={10}>
            <Button onClick={handleCriar} loading={criando} disabled={!novaEmpresa.nome}>
              Criar empresa
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card title="Empresas cadastradas">
        {empresas.length === 0 ? (
          <p>
            Nenhuma empresa cadastrada ainda — sem isso, todo mundo usa a paleta padrão
            (vermelho).
          </p>
        ) : (
          <Table minWidth={780}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nome</TableHeaderCell>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell align="center">Cor (claro)</TableHeaderCell>
                <TableHeaderCell align="center">Cor (escuro)</TableHeaderCell>
                <TableHeaderCell align="center">Ativa</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {empresas.map((empresa) => (
                <TableRow key={empresa.id}>
                  <TableCell>
                    <Input
                      defaultValue={empresa.nome}
                      disabled={salvandoId === empresa.id}
                      onBlur={(event) => {
                        const nome = event.target.value.trim();
                        if (nome && nome !== empresa.nome) {
                          handleAtualizar(empresa, { nome });
                        }
                      }}
                    />
                  </TableCell>

                  <TableCell>
                    <Input
                      defaultValue={empresa.codigo ?? ""}
                      placeholder="—"
                      disabled={salvandoId === empresa.id}
                      onBlur={(event) => {
                        const codigo = event.target.value.trim();
                        if (codigo !== (empresa.codigo ?? "")) {
                          handleAtualizar(empresa, { codigo: codigo || null });
                        }
                      }}
                    />
                  </TableCell>

                  <TableCell align="center">
                    <div className={styles.checkboxCentro}>
                      <input
                        type="color"
                        className={styles.corInput}
                        value={empresa.corPrimariaClara}
                        disabled={salvandoId === empresa.id}
                        onChange={(event) =>
                          handleAtualizar(empresa, { corPrimariaClara: event.target.value })
                        }
                      />
                    </div>
                  </TableCell>

                  <TableCell align="center">
                    <div className={styles.checkboxCentro}>
                      <input
                        type="color"
                        className={styles.corInput}
                        value={empresa.corPrimariaEscura}
                        disabled={salvandoId === empresa.id}
                        onChange={(event) =>
                          handleAtualizar(empresa, { corPrimariaEscura: event.target.value })
                        }
                      />
                    </div>
                  </TableCell>

                  <TableCell align="center">
                    <div className={styles.checkboxCentro}>
                      <Switch
                        label=""
                        compact
                        checked={empresa.ativa}
                        disabled={salvandoId === empresa.id}
                        onChange={(event) =>
                          handleAtualizar(empresa, { ativa: event.target.checked })
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
