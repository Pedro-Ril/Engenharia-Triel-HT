"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Home, Mail, PencilLine, Plus, TrendingUp } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import { statusAprovacaoConfig } from "../constants/approval-status";
import { enviarRelatorioSolicitacao, listarMinhasSolicitacoes } from "../services/aprovacoes.service";
import type { ItemAumentoSalarial, StatusAprovacao } from "../types/aprovacoes.types";

type FiltroStatus = StatusAprovacao | "todos";
type OrdemMinhas = "recentes" | "antigas";

const OPCOES_STATUS: { value: FiltroStatus; label: string }[] = [
  { value: "todos", label: "Todas" },
  { value: "pendente", label: "Com pendências" },
  { value: "aprovado", label: "Com aprovados" },
  { value: "reprovado", label: "Com reprovados" },
];

const OPCOES_ORDEM: { value: OrdemMinhas; label: string }[] = [
  { value: "recentes", label: "Mais recentes" },
  { value: "antigas", label: "Mais antigas" },
];

const TODOS = "";

/* Uma solicitação e os colaboradores dentro dela -- é assim que a tela pensa agora. */
interface Solicitacao {
  numero: number;
  criadoEm: string;
  observacaoGeral: string | null;
  itens: ItemAumentoSalarial[];
  pendentes: number;
  aprovados: number;
  reprovados: number;
}

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarDataAdmissao(valorIso: string | null): string {
  if (!valorIso) return "-";
  const [ano, mes, dia] = valorIso.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : "-";
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarReajuste(valor: number, percentual: number): string {
  return `${formatarMoeda(valor)} (${Number(percentual).toFixed(2)}%)`;
}

interface TotaisSolicitacao {
  colaboradores: number;
  reajuste: number;
}

function somar(itens: ItemAumentoSalarial[]): TotaisSolicitacao {
  return itens.reduce<TotaisSolicitacao>(
    (acumulado, item) => ({
      colaboradores: acumulado.colaboradores + 1,
      reajuste: acumulado.reajuste + item.valorReajuste,
    }),
    { colaboradores: 0, reajuste: 0 }
  );
}

function resumoDecisoes(solicitacao: Solicitacao): string {
  const partes: string[] = [];
  if (solicitacao.aprovados > 0) partes.push(`${solicitacao.aprovados} aprovado(s)`);
  if (solicitacao.reprovados > 0) partes.push(`${solicitacao.reprovados} reprovado(s)`);
  if (solicitacao.pendentes > 0) partes.push(`${solicitacao.pendentes} aguardando`);
  return partes.join(" · ");
}

export function MinhasSolicitacoesPage() {
  const [itens, setItens] = useState<ItemAumentoSalarial[]>([]);
  const [carregando, setCarregando] = useState(true);
  /* O detalhe não precisa de requisição própria: a lista já traz todos os itens. */
  const [detalhe, setDetalhe] = useState<Solicitacao | null>(null);

  const [status, setStatus] = useState<FiltroStatus>("todos");
  const [departamento, setDepartamento] = useState(TODOS);
  const [setor, setSetor] = useState(TODOS);
  const [ordem, setOrdem] = useState<OrdemMinhas>("recentes");
  const [busca, setBusca] = useState("");

  const [enviandoRelatorio, setEnviandoRelatorio] = useState<number | null>(null);
  const [feedbackRelatorio, setFeedbackRelatorio] = useState<{
    variante: "success" | "danger";
    texto: string;
  } | null>(null);

  useEffect(() => {
    listarMinhasSolicitacoes().then((resultado) => {
      if (resultado.ok && resultado.data) setItens(resultado.data);
      setCarregando(false);
    });
  }, []);

  const departamentos = useMemo(() => {
    const valores = new Set(itens.map((item) => item.departamento).filter(Boolean) as string[]);
    return Array.from(valores).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [itens]);

  const setores = useMemo(() => {
    const valores = new Set(itens.map((item) => item.setor).filter(Boolean) as string[]);
    return Array.from(valores).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [itens]);

  /* Agrupa os itens por solicitação. Os colaboradores de cada uma ficam em ordem alfabética. */
  const solicitacoes = useMemo(() => {
    const mapa = new Map<number, Solicitacao>();

    for (const item of itens) {
      let solicitacao = mapa.get(item.aprovacaoNumero);

      if (!solicitacao) {
        solicitacao = {
          numero: item.aprovacaoNumero,
          criadoEm: item.criadoEm,
          observacaoGeral: item.observacaoGeral,
          itens: [],
          pendentes: 0,
          aprovados: 0,
          reprovados: 0,
        };
        mapa.set(item.aprovacaoNumero, solicitacao);
      }

      solicitacao.itens.push(item);
      if (item.status === "pendente") solicitacao.pendentes += 1;
      if (item.status === "aprovado") solicitacao.aprovados += 1;
      if (item.status === "reprovado") solicitacao.reprovados += 1;
    }

    for (const solicitacao of mapa.values()) {
      solicitacao.itens.sort((a, b) => a.funcionarioNome.localeCompare(b.funcionarioNome, "pt-BR"));
    }

    return Array.from(mapa.values());
  }, [itens]);

  /*
   * Os filtros continuam sendo sobre COLABORADOR (departamento, setor,
   * nome): a solicitação fica na lista quando pelo menos um colaborador
   * dela bate. Ao abrir, mostra todos -- esconder parte dos
   * colaboradores dentro da solicitação daria a entender que ela é menor
   * do que é.
   */
  const solicitacoesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const filtradas = solicitacoes.filter((solicitacao) => {
      if (termo && String(solicitacao.numero).includes(termo)) return true;

      return solicitacao.itens.some((item) => {
        if (status !== "todos" && item.status !== status) return false;
        if (departamento && item.departamento !== departamento) return false;
        if (setor && item.setor !== setor) return false;
        if (termo && !item.funcionarioNome.toLowerCase().includes(termo)) return false;
        return true;
      });
    });

    return [...filtradas].sort((a, b) =>
      ordem === "recentes"
        ? b.criadoEm.localeCompare(a.criadoEm)
        : a.criadoEm.localeCompare(b.criadoEm)
    );
  }, [solicitacoes, status, departamento, setor, ordem, busca]);

  function podeEnviarRelatorio(solicitacao: Solicitacao): boolean {
    return solicitacao.pendentes === 0 && solicitacao.aprovados > 0;
  }

  async function handleEnviarRelatorio(numero: number) {
    setEnviandoRelatorio(numero);
    setFeedbackRelatorio(null);

    try {
      const resultado = await enviarRelatorioSolicitacao(numero);

      setFeedbackRelatorio({
        variante: resultado.ok ? "success" : "danger",
        texto:
          resultado.message ??
          (resultado.ok ? "Relatório enviado." : "Não foi possível enviar o relatório."),
      });
    } finally {
      setEnviandoRelatorio(null);
    }
  }

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

            <Field label="Departamento">
              <Dropdown
                value={departamento}
                options={[
                  { value: TODOS, label: "Todos os departamentos" },
                  ...departamentos.map((nome) => ({ value: nome, label: nome })),
                ]}
                onValueChange={setDepartamento}
              />
            </Field>

            <Field label="Setor">
              <Dropdown
                value={setor}
                options={[
                  { value: TODOS, label: "Todos os setores" },
                  ...setores.map((nome) => ({ value: nome, label: nome })),
                ]}
                onValueChange={setSetor}
              />
            </Field>

            <Field label="Colaborador ou nº">
              <Input
                value={busca}
                placeholder="Buscar..."
                onChange={(event) => setBusca(event.target.value)}
              />
            </Field>

            <Field label="Ordenar por">
              <Dropdown
                value={ordem}
                options={OPCOES_ORDEM}
                onValueChange={(valor) => setOrdem(valor as OrdemMinhas)}
              />
            </Field>
          </FormGrid>

          {feedbackRelatorio && (
            <Alert variant={feedbackRelatorio.variante}>{feedbackRelatorio.texto}</Alert>
          )}

          {carregando ? (
            <Loader label="Carregando solicitações..." />
          ) : solicitacoes.length === 0 ? (
            <EmptyState icon={<TrendingUp size={28} />} title="Nenhuma solicitação enviada ainda" />
          ) : solicitacoesFiltradas.length === 0 ? (
            <EmptyState icon={<TrendingUp size={28} />} title="Nenhuma solicitação com esses filtros" />
          ) : (
            <Table minWidth={900}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nº</TableHeaderCell>
                  <TableHeaderCell>Colaboradores</TableHeaderCell>
                  <TableHeaderCell>Enviada em</TableHeaderCell>
                  <TableHeaderCell align="center">Situação</TableHeaderCell>
                  <TableHeaderCell>Decisões</TableHeaderCell>
                  <TableHeaderCell align="center">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {solicitacoesFiltradas.map((solicitacao) => {
                  const concluida = solicitacao.pendentes === 0;

                  return (
                    <TableRow
                      key={solicitacao.numero}
                      style={{ cursor: "pointer" }}
                      onClick={() => setDetalhe(solicitacao)}
                    >
                      <TableCell>#{solicitacao.numero}</TableCell>
                      <TableCell>
                        {solicitacao.itens.length === 1
                          ? solicitacao.itens[0].funcionarioNome
                          : `${solicitacao.itens.length} colaboradores`}
                      </TableCell>
                      <TableCell>{formatarData(solicitacao.criadoEm)}</TableCell>
                      <TableCell align="center">
                        <Badge variant={concluida ? "success" : "warning"}>
                          {concluida ? "Concluída" : "Em análise"}
                        </Badge>
                      </TableCell>
                      <TableCell>{resumoDecisoes(solicitacao)}</TableCell>
                      <TableCell align="center">
                        <div onClick={(event) => event.stopPropagation()}>
                          <Stack direction="row" gap={6} justify="center">
                            <IconButton
                              icon={<Eye size={15} />}
                              label={`Abrir solicitação #${solicitacao.numero}`}
                              size="small"
                              onClick={() => setDetalhe(solicitacao)}
                            />
                            <IconButton
                              icon={<Mail size={15} />}
                              label={
                                podeEnviarRelatorio(solicitacao)
                                  ? `Enviar relatório da solicitação #${solicitacao.numero}`
                                  : "O relatório fica disponível quando a direção decidir todos os colaboradores e houver ao menos um aprovado"
                              }
                              size="small"
                              disabled={
                                !podeEnviarRelatorio(solicitacao) ||
                                enviandoRelatorio === solicitacao.numero
                              }
                              onClick={() => handleEnviarRelatorio(solicitacao.numero)}
                            />
                          </Stack>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Card>

      <Modal
        open={detalhe !== null}
        size="large"
        title={detalhe ? `Solicitação #${detalhe.numero}` : ""}
        onClose={() => setDetalhe(null)}
        footer={
          detalhe && (
            <Stack direction="row" gap={8} justify="end">
              <Button variant="secondary" onClick={() => setDetalhe(null)}>
                Fechar
              </Button>
              <Button
                loading={enviandoRelatorio === detalhe.numero}
                disabled={!podeEnviarRelatorio(detalhe)}
                onClick={() => handleEnviarRelatorio(detalhe.numero)}
              >
                <Mail size={16} />
                Enviar relatório
              </Button>
            </Stack>
          )
        }
      >
        {detalhe && (
          <Stack gap={16}>
            <FormGrid columns={3}>
              <Field label="Enviada em">
                <span>{formatarData(detalhe.criadoEm)}</span>
              </Field>
              <Field label="Colaboradores">
                <span>{detalhe.itens.length}</span>
              </Field>
              <Field label="Situação">
                <span>{resumoDecisoes(detalhe)}</span>
              </Field>
            </FormGrid>

            {detalhe.observacaoGeral && (
              <Field label="Observação geral da solicitação">
                <p>{detalhe.observacaoGeral}</p>
              </Field>
            )}

            {!podeEnviarRelatorio(detalhe) && (
              <Alert variant="info">
                {detalhe.pendentes > 0
                  ? "O relatório fica disponível quando a direção decidir todos os colaboradores desta solicitação."
                  : "Nenhum colaborador desta solicitação foi aprovado, então não há relatório para enviar."}
              </Alert>
            )}

            <Table minWidth={1000}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Colaborador</TableHeaderCell>
                  <TableHeaderCell>Depto / Setor</TableHeaderCell>
                  <TableHeaderCell>Admissão</TableHeaderCell>
                  <TableHeaderCell align="right">Salário atual</TableHeaderCell>
                  <TableHeaderCell>Reajuste</TableHeaderCell>
                  <TableHeaderCell align="right">Novo salário</TableHeaderCell>
                  <TableHeaderCell align="center">Status</TableHeaderCell>
                  <TableHeaderCell>Decidido por</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {detalhe.itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Stack gap={4}>
                        <span>{item.funcionarioNome}</span>
                        {item.observacao && (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                            {item.observacao}
                          </span>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {item.departamento ?? "-"}
                      {item.setor ? ` / ${item.setor}` : ""}
                    </TableCell>
                    <TableCell>{formatarDataAdmissao(item.dataAdmissao)}</TableCell>
                    <TableCell align="right">{formatarMoeda(item.salarioAtual)}</TableCell>
                    <TableCell>
                      <Stack gap={4}>
                        <span>{formatarReajuste(item.valorReajuste, item.percentualReajuste)}</span>
                        {item.valorReajusteOriginal !== null && (
                          <Stack direction="row" gap={6} align="center" wrap>
                            <Badge variant="warning">
                              <PencilLine size={12} />
                              Alterado pela direção
                            </Badge>
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                              você pediu{" "}
                              {formatarReajuste(
                                item.valorReajusteOriginal,
                                item.percentualReajusteOriginal ?? 0
                              )}
                            </span>
                          </Stack>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{formatarMoeda(item.novoSalario)}</TableCell>
                    <TableCell align="center">
                      <Badge variant={statusAprovacaoConfig[item.status].badgeVariant}>
                        {statusAprovacaoConfig[item.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Stack gap={4}>
                        <span>{item.decididoPorNome ?? "-"}</span>
                        {item.comentarioDecisao && (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                            {item.comentarioDecisao}
                          </span>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Totais: o aprovado é o que de fato vira folha; o solicitado só aparece quando diferente, pra não repetir número igual. */}
                {(() => {
                  const aprovados = somar(
                    detalhe.itens.filter((item) => item.status === "aprovado")
                  );
                  const solicitado = somar(detalhe.itens);
                  const mostrarSolicitado = solicitado.colaboradores !== aprovados.colaboradores;

                  return (
                    <>
                      {mostrarSolicitado && (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <span style={{ color: "var(--text-muted)" }}>
                              Total solicitado — {solicitado.colaboradores} colaborador(es)
                            </span>
                          </TableCell>
                          <TableCell>
                            <span style={{ color: "var(--text-muted)" }}>
                              {formatarMoeda(solicitado.reajuste)}
                            </span>
                          </TableCell>
                          <TableCell colSpan={3} />
                        </TableRow>
                      )}

                      <TableRow>
                        <TableCell colSpan={4}>
                          <strong>Total aprovado — {aprovados.colaboradores} colaborador(es)</strong>
                        </TableCell>
                        <TableCell>
                          <strong>{formatarMoeda(aprovados.reajuste)}</strong>
                        </TableCell>
                        <TableCell colSpan={3} />
                      </TableRow>
                    </>
                  );
                })()}
              </TableBody>
            </Table>
          </Stack>
        )}
      </Modal>
    </PageContainer>
  );
}
