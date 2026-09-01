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

import {
  atualizarEmpresa,
  criarEmpresa,
  restaurarTemaPadrao,
  salvarTemaPadrao,
} from "../services/adminPermissoes.service";
import type { Empresa, TemaPadrao } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface EmpresasPainelProps {
  empresas: Empresa[];
  temaPadrao: TemaPadrao | null;
  onFeedback: FeedbackHandler;
  onEmpresaCriada: (empresa: Empresa) => void;
  onEmpresaAtualizada: (empresa: Empresa) => void;
  onTemaPadraoAtualizado: (temaPadrao: TemaPadrao | null) => void;
}

const novaEmpresaInicial = {
  nome: "",
  codigo: "",
  cnpj: "",
  corPrimariaClara: "#b71c1c",
  corPrimariaEscura: "#e04545",
};

const temaPadraoOriginal: TemaPadrao = {
  corPrimariaClara: "#b71c1c",
  corPrimariaEscura: "#e04545",
};

export function EmpresasPainel({
  empresas,
  temaPadrao,
  onFeedback,
  onEmpresaCriada,
  onEmpresaAtualizada,
  onTemaPadraoAtualizado,
}: EmpresasPainelProps) {
  const [novaEmpresa, setNovaEmpresa] = useState(novaEmpresaInicial);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const [corPadraoClara, setCorPadraoClara] = useState(
    temaPadrao?.corPrimariaClara ?? temaPadraoOriginal.corPrimariaClara
  );
  const [corPadraoEscura, setCorPadraoEscura] = useState(
    temaPadrao?.corPrimariaEscura ?? temaPadraoOriginal.corPrimariaEscura
  );
  const [salvandoTemaPadrao, setSalvandoTemaPadrao] = useState(false);
  const [restaurandoTemaPadrao, setRestaurandoTemaPadrao] = useState(false);

  async function handleSalvarTemaPadrao() {
    setSalvandoTemaPadrao(true);

    try {
      const resultado = await salvarTemaPadrao({
        corPrimariaClara: corPadraoClara,
        corPrimariaEscura: corPadraoEscura,
      });

      if (resultado.ok && resultado.data) {
        onTemaPadraoAtualizado(resultado.data);
        onFeedback(
          "success",
          "Tema padrão atualizado",
          "Quem não estiver vinculado a nenhuma empresa passa a ver essa cor."
        );
      } else {
        onFeedback(
          "danger",
          "Não foi possível salvar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoTemaPadrao(false);
    }
  }

  async function handleRestaurarTemaPadrao() {
    setRestaurandoTemaPadrao(true);

    try {
      const resultado = await restaurarTemaPadrao();

      if (resultado.ok) {
        onTemaPadraoAtualizado(null);
        setCorPadraoClara(temaPadraoOriginal.corPrimariaClara);
        setCorPadraoEscura(temaPadraoOriginal.corPrimariaEscura);
        onFeedback(
          "success",
          "Tema padrão restaurado",
          "Voltou para o vermelho original do portal."
        );
      } else {
        onFeedback(
          "danger",
          "Não foi possível restaurar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setRestaurandoTemaPadrao(false);
    }
  }

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
      Pick<Empresa, "nome" | "codigo" | "cnpj" | "corPrimariaClara" | "corPrimariaEscura" | "ativa">
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
        title="Tema padrão do portal"
        description="Cor principal usada por quem não está vinculado a nenhuma empresa (código de empresa sem correspondência cadastrada aqui)."
      >
        <Stack gap={16}>
          <FormGrid columns={4}>
            <Field label="Cor principal — modo claro">
              <input
                type="color"
                className={styles.corInput}
                value={corPadraoClara}
                onChange={(event) => setCorPadraoClara(event.target.value)}
              />
            </Field>

            <Field label="Cor principal — modo escuro">
              <input
                type="color"
                className={styles.corInput}
                value={corPadraoEscura}
                onChange={(event) => setCorPadraoEscura(event.target.value)}
              />
            </Field>
          </FormGrid>

          <Stack direction="row" justify="end" gap={10}>
            {temaPadrao && (
              <Button
                variant="secondary"
                onClick={handleRestaurarTemaPadrao}
                loading={restaurandoTemaPadrao}
              >
                Restaurar vermelho original
              </Button>
            )}

            <Button onClick={handleSalvarTemaPadrao} loading={salvandoTemaPadrao}>
              Salvar tema padrão
            </Button>
          </Stack>
        </Stack>
      </Card>

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

            <Field label="CNPJ" hint="opcional, usado em integrações">
              <Input
                value={novaEmpresa.cnpj}
                onChange={(event) =>
                  setNovaEmpresa((atual) => ({ ...atual, cnpj: event.target.value }))
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
          <Table minWidth={900}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nome</TableHeaderCell>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>CNPJ</TableHeaderCell>
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

                  <TableCell>
                    <Input
                      defaultValue={empresa.cnpj ?? ""}
                      placeholder="—"
                      disabled={salvandoId === empresa.id}
                      onBlur={(event) => {
                        const cnpj = event.target.value.trim();
                        if (cnpj !== (empresa.cnpj ?? "")) {
                          handleAtualizar(empresa, { cnpj: cnpj || null });
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
