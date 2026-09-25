"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, Home, PencilLine, ShieldOff, XCircle } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";

import { statusAprovacaoConfig } from "../constants/approval-status";
import {
  aprovarItemAprovacao,
  buscarItemAprovacao,
  listarItensPainel,
  reprovarItemAprovacao,
  type AjusteValoresDecisao,
} from "../services/aprovacoes.service";
import type { ItemAumentoSalarial, StatusAprovacao } from "../types/aprovacoes.types";

type FiltroStatus = StatusAprovacao | "todos";

const OPCOES_STATUS: { value: FiltroStatus; label: string }[] = [
  { value: "pendente", label: "Pendentes" },
  { value: "aprovado", label: "Aprovados" },
  { value: "reprovado", label: "Reprovados" },
  { value: "todos", label: "Todos" },
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

export function PainelAprovacoesPage() {
  const [itens, setItens] = useState<ItemAumentoSalarial[]>([]);
  const [tiposAtendidos, setTiposAtendidos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const [status, setStatus] = useState<FiltroStatus>("pendente");
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");

  const [itemIdSelecionado, setItemIdSelecionado] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ItemAumentoSalarial | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [comentarioAprovar, setComentarioAprovar] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);

  /* Valores editáveis do modal -- `valoresEditados` evita mandar um "ajuste" só porque o campo foi renderizado arredondado. */
  const [valorEditado, setValorEditado] = useState("");
  const [percentualEditado, setPercentualEditado] = useState("");
  const [valoresEditados, setValoresEditados] = useState(false);

  const [confirmandoReprovar, setConfirmandoReprovar] = useState(false);
  const [comentarioReprovar, setComentarioReprovar] = useState("");
  const [erroComentarioReprovar, setErroComentarioReprovar] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBusca(buscaDigitada.trim()), 400);
    return () => clearTimeout(timer);
  }, [buscaDigitada]);

  function carregarLista(filtroStatus: FiltroStatus, filtroBusca: string) {
    setCarregando(true);
    listarItensPainel({ status: filtroStatus, busca: filtroBusca }).then((resultado) => {
      if (resultado.ok && resultado.data) {
        setItens(resultado.data.itens);
        setTiposAtendidos(resultado.data.tiposAtendidos);
        setErroLista(null);
      } else {
        setErroLista(resultado.message ?? "Não foi possível carregar as pendências.");
      }
      setCarregando(false);
    });
  }

  useEffect(() => {
    carregarLista(status, busca);
  }, [status, busca]);

  function abrirDetalhe(itemId: string) {
    setItemIdSelecionado(itemId);
    setDetalhe(null);
    setErroModal(null);
    setComentarioAprovar("");
    setComentarioReprovar("");
    setValoresEditados(false);
    setCarregandoDetalhe(true);

    buscarItemAprovacao(itemId).then((resultado) => {
      if (resultado.ok && resultado.data) {
        setDetalhe(resultado.data);
        setValorEditado(resultado.data.valorReajuste.toFixed(2));
        setPercentualEditado(Number(resultado.data.percentualReajuste).toFixed(2));
      } else {
        setErroModal(resultado.message ?? "Não foi possível carregar o colaborador.");
      }
      setCarregandoDetalhe(false);
    });
  }

  function fecharModal() {
    if (processando) return;
    setItemIdSelecionado(null);
    setDetalhe(null);
  }

  function handleValorChange(texto: string) {
    setValorEditado(texto);
    setValoresEditados(true);

    if (detalhe && texto) {
      setPercentualEditado(((Number(texto) / detalhe.salarioAtual) * 100).toFixed(2));
    }
  }

  function handlePercentualChange(texto: string) {
    setPercentualEditado(texto);
    setValoresEditados(true);

    const percentual = Number(texto);
    if (detalhe && texto && Number.isFinite(percentual)) {
      setValorEditado(((detalhe.salarioAtual * percentual) / 100).toFixed(2));
    }
  }

  const valorNumerico = Number(valorEditado);
  const percentualNumerico = Number(percentualEditado);
  const valoresValidos = valorNumerico > 0 && percentualNumerico > 0;

  function montarAjuste(): AjusteValoresDecisao | null {
    if (!valoresEditados || !valoresValidos) return null;
    return { valorReajuste: valorNumerico, percentualReajuste: percentualNumerico };
  }

  async function handleAprovar() {
    if (!itemIdSelecionado) return;

    setProcessando(true);
    setErroModal(null);

    try {
      const resultado = await aprovarItemAprovacao(
        itemIdSelecionado,
        comentarioAprovar.trim() || null,
        montarAjuste()
      );

      if (resultado.ok) {
        setItemIdSelecionado(null);
        setDetalhe(null);
        carregarLista(status, busca);
      } else {
        setErroModal(resultado.message ?? "Não foi possível aprovar o colaborador.");
      }
    } finally {
      setProcessando(false);
    }
  }

  async function handleConfirmarReprovar() {
    if (!itemIdSelecionado) return;

    if (!comentarioReprovar.trim()) {
      setErroComentarioReprovar(true);
      return;
    }

    setProcessando(true);

    try {
      const resultado = await reprovarItemAprovacao(
        itemIdSelecionado,
        comentarioReprovar.trim(),
        montarAjuste()
      );

      if (resultado.ok) {
        setConfirmandoReprovar(false);
        setItemIdSelecionado(null);
        setDetalhe(null);
        carregarLista(status, busca);
      } else {
        setErroModal(resultado.message ?? "Não foi possível reprovar o colaborador.");
        setConfirmandoReprovar(false);
      }
    } finally {
      setProcessando(false);
    }
  }

  const naoEhAprovador = !carregando && tiposAtendidos.length === 0;
  const pendente = detalhe?.status === "pendente";
  const novoSalarioPrevisto =
    detalhe && valorNumerico > 0 ? detalhe.salarioAtual + valorNumerico : (detalhe?.novoSalario ?? 0);

  return (
    <PageContainer>
      <PageHeader
        title="Painel de Aprovações"
        description="Solicitações de reajuste enviadas à direção — cada colaborador é decidido separadamente."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Painel de Aprovações", current: true, icon: <ClipboardCheck size={14} /> },
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

            <Field label="Colaborador ou solicitante">
              <Input
                value={buscaDigitada}
                placeholder="Buscar por nome..."
                onChange={(event) => setBuscaDigitada(event.target.value)}
              />
            </Field>
          </FormGrid>

          {erroLista && <Alert variant="danger">{erroLista}</Alert>}

          {carregando ? (
            <Loader label="Carregando solicitações..." />
          ) : naoEhAprovador ? (
            <EmptyState
              icon={<ShieldOff size={28} />}
              title="Você ainda não é aprovador de nenhum tipo de solicitação"
              description="Um administrador precisa cadastrar você em Administração → Diretoria → Aprovadores para que a fila apareça aqui."
            />
          ) : itens.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck size={28} />}
              title={busca ? "Nenhum resultado para essa busca" : "Nenhuma solicitação nesta situação"}
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nº</TableHeaderCell>
                  <TableHeaderCell>Colaborador</TableHeaderCell>
                  <TableHeaderCell>Solicitante</TableHeaderCell>
                  <TableHeaderCell>Enviada em</TableHeaderCell>
                  <TableHeaderCell align="center">Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {itens.map((item) => (
                  <TableRow key={item.id} style={{ cursor: "pointer" }} onClick={() => abrirDetalhe(item.id)}>
                    <TableCell>#{item.aprovacaoNumero}</TableCell>
                    <TableCell>
                      <Stack direction="row" gap={8} align="center" wrap>
                        <span>{item.resumoTitulo}</span>
                        {item.valorReajusteOriginal !== null && (
                          <Badge variant="warning">
                            <PencilLine size={12} />
                            Alterado pela direção
                          </Badge>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{item.criadoPorNome}</TableCell>
                    <TableCell>{formatarData(item.criadoEm)}</TableCell>
                    <TableCell align="center">
                      <Badge variant={statusAprovacaoConfig[item.status].badgeVariant}>
                        {statusAprovacaoConfig[item.status].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Card>

      <Modal
        open={itemIdSelecionado !== null}
        title={detalhe ? `Solicitação #${detalhe.aprovacaoNumero}` : ""}
        onClose={fecharModal}
        footer={
          detalhe &&
          pendente && (
            <Stack direction="row" gap={8} justify="end">
              <Button
                variant="danger"
                onClick={() => setConfirmandoReprovar(true)}
                disabled={processando || (valoresEditados && !valoresValidos)}
              >
                <XCircle size={16} />
                Reprovar
              </Button>
              <Button
                onClick={handleAprovar}
                loading={processando}
                disabled={valoresEditados && !valoresValidos}
              >
                <CheckCircle2 size={16} />
                Aprovar
              </Button>
            </Stack>
          )
        }
      >
        <Stack gap={16}>
          {carregandoDetalhe && <Loader label="Carregando..." />}
          {erroModal && <Alert variant="danger">{erroModal}</Alert>}

          {detalhe && (
            <>
              {detalhe.valorReajusteOriginal !== null && (
                <Alert variant="warning" title="Valores alterados pela direção">
                  O solicitante pediu{" "}
                  {formatarReajuste(detalhe.valorReajusteOriginal, detalhe.percentualReajusteOriginal ?? 0)}
                  {detalhe.novoSalarioOriginal !== null &&
                    ` (novo salário ${formatarMoeda(detalhe.novoSalarioOriginal)})`}
                  . O que está registrado hoje é{" "}
                  {formatarReajuste(detalhe.valorReajuste, detalhe.percentualReajuste)}.
                </Alert>
              )}

              <FormGrid columns={2}>
                <Field label="Colaborador">
                  <span>{detalhe.funcionarioNome}</span>
                </Field>
                <Field label="Solicitante">
                  <span>{detalhe.criadoPorNome}</span>
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
                  <span>{formatarMoeda(pendente ? novoSalarioPrevisto : detalhe.novoSalario)}</span>
                </Field>

                {pendente ? (
                  <>
                    <Field
                      label="Valor do reajuste"
                      htmlFor="valorReajuste"
                      hint="Pode ser ajustado antes de decidir — o percentual acompanha."
                    >
                      <CurrencyInput
                        id="valorReajuste"
                        value={valorEditado}
                        onValueChange={handleValorChange}
                        disabled={processando}
                        hasError={valoresEditados && !valoresValidos}
                      />
                    </Field>
                    <Field label="Percentual" htmlFor="percentualReajuste">
                      <NumberInput
                        id="percentualReajuste"
                        suffix="%"
                        step="0.01"
                        min={0}
                        value={percentualEditado}
                        onChange={(event) => handlePercentualChange(event.target.value)}
                        disabled={processando}
                        hasError={valoresEditados && !valoresValidos}
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Reajuste">
                    <span>{formatarReajuste(detalhe.valorReajuste, detalhe.percentualReajuste)}</span>
                  </Field>
                )}
              </FormGrid>

              {pendente && valoresEditados && (
                <Alert variant="info">
                  {valoresValidos
                    ? `Você alterou o reajuste pedido (${formatarReajuste(detalhe.valorReajuste, detalhe.percentualReajuste)} → ${formatarReajuste(valorNumerico, percentualNumerico)}). A alteração fica registrada junto da decisão e o solicitante enxerga os dois valores.`
                    : "Informe um valor e um percentual maiores que zero para decidir."}
                </Alert>
              )}

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

              {pendente ? (
                <Field label="Comentário (opcional para aprovar)" htmlFor="comentarioAprovar">
                  <Textarea
                    id="comentarioAprovar"
                    rows={3}
                    value={comentarioAprovar}
                    onChange={(event) => setComentarioAprovar(event.target.value)}
                    disabled={processando}
                  />
                </Field>
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
            </>
          )}
        </Stack>
      </Modal>

      <ConfirmDialog
        open={confirmandoReprovar}
        title="Reprovar este colaborador?"
        variant="danger"
        confirmLabel="Reprovar"
        loading={processando}
        message={
          <Stack gap={12}>
            <span>Explique o motivo da reprovação — o solicitante verá esse comentário no portal.</span>
            <Textarea
              rows={3}
              value={comentarioReprovar}
              onChange={(event) => {
                setComentarioReprovar(event.target.value);
                if (erroComentarioReprovar) setErroComentarioReprovar(false);
              }}
              placeholder="Motivo da reprovação (obrigatório)"
              disabled={processando}
              hasError={erroComentarioReprovar}
            />
            {erroComentarioReprovar && <span style={{ color: "var(--danger-text)" }}>Informe o motivo da reprovação.</span>}
          </Stack>
        }
        onConfirm={handleConfirmarReprovar}
        onClose={() => {
          if (processando) return;
          setConfirmandoReprovar(false);
          setErroComentarioReprovar(false);
        }}
      />
    </PageContainer>
  );
}
