"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Home, PencilLine, Plus, TrendingUp } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import { statusAprovacaoConfig } from "../constants/approval-status";
import { listarMinhasSolicitacoes } from "../services/aprovacoes.service";
import type { ItemAumentoSalarial, StatusAprovacao } from "../types/aprovacoes.types";

type FiltroStatus = StatusAprovacao | "todos";

const OPCOES_STATUS: { value: FiltroStatus; label: string }[] = [
  { value: "todos", label: "Todas" },
  { value: "pendente", label: "Pendentes" },
  { value: "aprovado", label: "Aprovadas" },
  { value: "reprovado", label: "Reprovadas" },
];

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarReajuste(valor: number, percentual: number): string {
  return `${formatarMoeda(valor)} (${Number(percentual).toFixed(2)}%)`;
}

export function MinhasSolicitacoesPage() {
  const [itens, setItens] = useState<ItemAumentoSalarial[]>([]);
  const [carregando, setCarregando] = useState(true);
  /* O detalhe não precisa de requisição própria: a lista já traz o item inteiro. */
  const [detalhe, setDetalhe] = useState<ItemAumentoSalarial | null>(null);

  const [status, setStatus] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    listarMinhasSolicitacoes().then((resultado) => {
      if (resultado.ok && resultado.data) setItens(resultado.data);
      setCarregando(false);
    });
  }, []);

  /*
   * Filtra no cliente (diferente do painel da direção, que vai ao
   * servidor): aqui a lista é só do próprio usuário e já veio inteira
   * pra alimentar o modal -- ir ao servidor de novo não traria nada.
   */
  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return itens.filter((item) => {
      if (status !== "todos" && item.status !== status) return false;
      if (!termo) return true;

      return (
        item.funcionarioNome.toLowerCase().includes(termo) ||
        `#${item.aprovacaoNumero}`.includes(termo) ||
        String(item.aprovacaoNumero).includes(termo)
      );
    });
  }, [itens, status, busca]);

  return (
    <PageContainer>
      <PageHeader
        title="Minhas Solicitações"
        description="Solicitações de aprovação que você já enviou."
        actions={
          <Link href="/aprovacoes/solicitar-aumento">
            <Button>
              <Plus size={16} />
              Nova solicitação
            </Button>
          </Link>
        }
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Reajuste Salarial", href: "/aprovacoes/solicitar-aumento", icon: <TrendingUp size={14} /> },
          { label: "Minhas Solicitações", current: true },
        ]}
      />

      <Card>
        <Stack gap={16}>
          <FormGrid columns={3}>
            <Field label="Situação">
              <Dropdown
                value={status}
                options={OPCOES_STATUS}
                onValueChange={(valor) => setStatus(valor as FiltroStatus)}
              />
            </Field>

            <Field label="Colaborador ou nº">
              <Input
                value={busca}
                placeholder="Buscar..."
                onChange={(event) => setBusca(event.target.value)}
              />
            </Field>
          </FormGrid>

          {carregando ? (
            <Loader label="Carregando solicitações..." />
          ) : itens.length === 0 ? (
            <EmptyState icon={<TrendingUp size={28} />} title="Nenhuma solicitação enviada ainda" />
          ) : itensFiltrados.length === 0 ? (
            <EmptyState icon={<TrendingUp size={28} />} title="Nenhuma solicitação com esses filtros" />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nº</TableHeaderCell>
                  <TableHeaderCell>Colaborador</TableHeaderCell>
                  <TableHeaderCell>Reajuste</TableHeaderCell>
                  <TableHeaderCell>Enviada em</TableHeaderCell>
                  <TableHeaderCell align="center">Status</TableHeaderCell>
                  <TableHeaderCell>Decidido por</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {itensFiltrados.map((item) => (
                  <TableRow key={item.id} style={{ cursor: "pointer" }} onClick={() => setDetalhe(item)}>
                    <TableCell>#{item.aprovacaoNumero}</TableCell>
                    <TableCell>{item.funcionarioNome}</TableCell>
                    <TableCell>
                      <Stack direction="row" gap={8} align="center" wrap>
                        <span>{formatarReajuste(item.valorReajuste, item.percentualReajuste)}</span>
                        {item.valorReajusteOriginal !== null && (
                          <Badge variant="warning">
                            <PencilLine size={12} />
                            Alterado pela direção
                          </Badge>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{formatarData(item.criadoEm)}</TableCell>
                    <TableCell align="center">
                      <Badge variant={statusAprovacaoConfig[item.status].badgeVariant}>
                        {statusAprovacaoConfig[item.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.decididoPorNome ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Card>

      <Modal
        open={detalhe !== null}
        title={detalhe ? `Solicitação #${detalhe.aprovacaoNumero}` : ""}
        onClose={() => setDetalhe(null)}
      >
        {detalhe && (
          <Stack gap={16}>
            {detalhe.valorReajusteOriginal !== null && (
              <Alert variant="warning" title="Valores alterados pela direção">
                Você pediu{" "}
                {formatarReajuste(detalhe.valorReajusteOriginal, detalhe.percentualReajusteOriginal ?? 0)}
                {detalhe.novoSalarioOriginal !== null &&
                  ` (novo salário ${formatarMoeda(detalhe.novoSalarioOriginal)})`}
                . A direção ajustou para{" "}
                {formatarReajuste(detalhe.valorReajuste, detalhe.percentualReajuste)}.
              </Alert>
            )}

            <FormGrid columns={2}>
              <Field label="Colaborador">
                <span>{detalhe.funcionarioNome}</span>
              </Field>
              <Field label="Situação">
                <Badge variant={statusAprovacaoConfig[detalhe.status].badgeVariant}>
                  {statusAprovacaoConfig[detalhe.status].label}
                </Badge>
              </Field>
              <Field label="Departamento">
                <span>{detalhe.departamento ?? "-"}</span>
              </Field>
              <Field label="Setor">
                <span>{detalhe.setor ?? "-"}</span>
              </Field>
              <Field label="Salário atual">
                <span>{formatarMoeda(detalhe.salarioAtual)}</span>
              </Field>
              <Field label="Novo salário">
                <span>{formatarMoeda(detalhe.novoSalario)}</span>
              </Field>
              <Field label="Reajuste">
                <span>{formatarReajuste(detalhe.valorReajuste, detalhe.percentualReajuste)}</span>
              </Field>
              <Field label="Enviada em">
                <span>{formatarData(detalhe.criadoEm)}</span>
              </Field>
            </FormGrid>

            {detalhe.observacaoGeral && (
              <Field label="Observação geral da solicitação">
                <p>{detalhe.observacaoGeral}</p>
              </Field>
            )}

            {detalhe.observacao && (
              <Field label="Observação deste colaborador">
                <p>{detalhe.observacao}</p>
              </Field>
            )}

            {detalhe.status === "pendente" ? (
              <Alert variant="info">Aguardando a decisão da direção.</Alert>
            ) : (
              <FormGrid columns={2}>
                <Field label="Decidido por">
                  <span>{detalhe.decididoPorNome ?? "-"}</span>
                </Field>
                <Field label="Decidido em">
                  <span>{detalhe.decididoEm ? formatarData(detalhe.decididoEm) : "-"}</span>
                </Field>
                {detalhe.comentarioDecisao && (
                  <Field label="Comentário da decisão">
                    <p>{detalhe.comentarioDecisao}</p>
                  </Field>
                )}
              </FormGrid>
            )}
          </Stack>
        )}
      </Modal>
    </PageContainer>
  );
}
