"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Undo2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import { statusAprovacaoConfig } from "../constants/approval-status";
import { buscarPedidoCompraDetalhe } from "../services/aprovacoes.service";
import type { FluxoPedidoCompra, PedidoCompraErp, PedidoCompraPainel } from "../types/aprovacoes.types";
import { formatarDocumento, formatarValor } from "../utils/pedidos-compra-formato";
import { CadeiaAprovacao } from "./CadeiaAprovacao";

const SITUACAO_ERP: Record<string, { label: string; variant: "info" | "warning" | "success" | "danger" }> = {
  pendente: { label: "Pendente no Focco", variant: "info" },
  parcial: { label: "Parcialmente atendido", variant: "warning" },
  atendido: { label: "Atendido", variant: "success" },
  cancelado: { label: "Cancelado no Focco", variant: "danger" },
};

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarQuantidade(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

interface PedidoCompraDetalheModalProps {
  /* Item da fila aberto; null fecha o modal. */
  pedidoId: string | null;
  abrindoPdf: boolean;
  onAbrirPdf: (pedido: PedidoCompraPainel) => void;
  onDecidir: (pedido: PedidoCompraPainel, acao: "aprovar" | "devolver") => void;
  onClose: () => void;
}

/*
 * Detalhe do pedido de compra: o que o comprador enviou e o pedido ao
 * vivo no Focco (itens, pagamento, frete, valores). Avisa quando o
 * pedido mudou desde o envio -- o diretor aprova sabendo disso.
 */
export function PedidoCompraDetalheModal({
  pedidoId,
  abrindoPdf,
  onAbrirPdf,
  onDecidir,
  onClose,
}: PedidoCompraDetalheModalProps) {
  /* O resultado guarda de qual pedido é: abrir outro mostra "carregando" sem precisar zerar nada. */
  const [resultado, setResultado] = useState<{
    id: string;
    pedido: PedidoCompraPainel | null;
    erp: PedidoCompraErp | null;
    erroErp: string | null;
    fluxo: FluxoPedidoCompra | null;
    erro: string | null;
  } | null>(null);

  useEffect(() => {
    if (!pedidoId) return;
    let ativo = true;

    buscarPedidoCompraDetalhe(pedidoId).then((resposta) => {
      if (!ativo) return;

      setResultado(
        resposta.ok && resposta.data
          ? { id: pedidoId, ...resposta.data, erro: null }
          : {
              id: pedidoId,
              pedido: null,
              erp: null,
              erroErp: null,
              fluxo: null,
              erro: resposta.message ?? "Não foi possível abrir o pedido.",
            }
      );
    });

    return () => {
      ativo = false;
    };
  }, [pedidoId]);

  const atual = resultado && resultado.id === pedidoId ? resultado : null;
  const carregando = pedidoId !== null && atual === null;
  const pedido = atual?.pedido ?? null;
  const erp = atual?.erp ?? null;
  const erroErp = atual?.erroErp ?? null;
  const fluxo = atual?.fluxo ?? null;
  const erro = atual?.erro ?? null;

  const moeda = erp?.moeda ?? pedido?.moeda ?? null;
  const pendente = pedido?.status === "pendente";
  const naMinhaVez = pedido?.naMinhaVez ?? false;
  const valorMudou =
    pedido?.valorTotal !== null &&
    pedido?.valorTotal !== undefined &&
    erp !== null &&
    Math.abs(erp.valores.total - pedido.valorTotal) >= 0.01;
  const situacaoErp = erp?.situacao ? SITUACAO_ERP[erp.situacao] : null;

  return (
    <Modal
      open={pedidoId !== null}
      size="xlarge"
      title={pedido ? `Pedido de compra ${pedido.numero}` : "Pedido de compra"}
      description={
        pedido
          ? `${pedido.empresaNome} · aprovação #${pedido.numeroAprovacao} · enviado por ${pedido.enviadoPor} em ${formatarData(pedido.enviadoEm)}`
          : undefined
      }
      meta={
        pedido ? (
          <Stack direction="row" gap={8} wrap>
            <Badge variant={statusAprovacaoConfig[pedido.status].badgeVariant}>
              {statusAprovacaoConfig[pedido.status].label}
            </Badge>
            {situacaoErp && <Badge variant={situacaoErp.variant}>{situacaoErp.label}</Badge>}
          </Stack>
        ) : undefined
      }
      onClose={onClose}
      footer={
        pedido ? (
          <Stack direction="row" gap={8} justify="between" wrap fullWidth>
            <Button variant="secondary" loading={abrindoPdf} onClick={() => onAbrirPdf(pedido)}>
              <FileText size={16} />
              Ver PDF
            </Button>

            {naMinhaVez && (
              <Stack direction="row" gap={8} wrap>
                <Button variant="danger" onClick={() => onDecidir(pedido, "devolver")}>
                  <Undo2 size={16} />
                  Devolver
                </Button>
                <Button onClick={() => onDecidir(pedido, "aprovar")}>
                  <CheckCircle2 size={16} />
                  Aprovar
                </Button>
              </Stack>
            )}
          </Stack>
        ) : undefined
      }
    >
      <Stack gap={20}>
        {carregando && <Loader label="Buscando o pedido no ERP..." />}
        {erro && <Alert variant="danger">{erro}</Alert>}

        {pedido && (
          <>
            {erroErp && (
              <Alert variant="warning" title="Dados do ERP indisponíveis">
                {erroErp} Abaixo, só o que foi registrado no envio.
              </Alert>
            )}

            {pendente && !naMinhaVez && pedido.nivelAtual && (
              <Alert variant="info" title="Aguardando outro nível">
                Este pedido está no nível {pedido.nivelAtual.ordem} de {pedido.nivelAtual.total} (
                {pedido.nivelAtual.nome}). Você vê o andamento, mas não decide agora.
              </Alert>
            )}

            {erp?.situacao === "cancelado" && pendente && (
              <Alert variant="danger" title="Pedido cancelado no Focco">
                O pedido foi cancelado depois de enviado para aprovação.
              </Alert>
            )}

            {valorMudou && (
              <Alert variant="warning" title="O valor mudou desde o envio">
                Quando o comprador enviou, o total era {formatarValor(pedido.valorTotal, moeda)}; hoje no Focco é{" "}
                {formatarValor(erp?.valores.total ?? null, moeda)}.
              </Alert>
            )}

            <FormGrid columns={3}>
              <Field label="Fornecedor">
                <span>
                  {erp?.fornecedor.nome ?? pedido.fornecedorNome ?? "-"}
                  {erp?.fornecedor.documento ? ` · ${formatarDocumento(erp.fornecedor.documento)}` : ""}
                </span>
              </Field>
              <Field label="Comprador">
                <span>{erp?.comprador ?? pedido.compradorNome ?? "-"}</span>
              </Field>
              <Field label="Emissão">
                <span>{erp?.dataEmissao ?? "-"}</span>
              </Field>
              <Field label="Tipo">
                <span>{erp?.tipo ?? "-"}</span>
              </Field>
              <Field label="Contato">
                <span>{erp?.contato ?? "-"}</span>
              </Field>
              <Field label="Frete">
                <span>
                  {erp?.frete
                    ? [erp.frete.tipo, erp.frete.transportadora].filter(Boolean).join(" · ") || "-"
                    : "-"}
                </span>
              </Field>
              <Field label="Nível atual">
                <span>
                  {pedido.nivelAtual
                    ? `${pedido.nivelAtual.ordem} de ${pedido.nivelAtual.total} · ${pedido.nivelAtual.nome}`
                    : statusAprovacaoConfig[pedido.status].label}
                </span>
              </Field>
              <Field label="Observação do envio">
                <span>{pedido.observacao ?? "-"}</span>
              </Field>
              <Field label="Valor total">
                <strong>{formatarValor(erp?.valores.total ?? pedido.valorTotal, moeda)}</strong>
              </Field>
            </FormGrid>

            {fluxo && <CadeiaAprovacao etapas={fluxo.etapas} historico={fluxo.historico} />}

            {pedido.decididoPor && pedido.decididoEm && (
              <Alert variant={pedido.status === "aprovado" ? "success" : pedido.status === "devolvido" ? "info" : "danger"}>
                {statusAprovacaoConfig[pedido.status].label} por {pedido.decididoPor} em{" "}
                {formatarData(pedido.decididoEm)}
                {pedido.comentario ? ` — ${pedido.comentario}` : ""}
              </Alert>
            )}

            {erp && (
              <>
                <Stack gap={8}>
                  <strong>Itens ({erp.itens.length})</strong>
                  <Table minWidth={1100}>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Seq.</TableHeaderCell>
                        <TableHeaderCell>Item</TableHeaderCell>
                        <TableHeaderCell align="right">Qtd.</TableHeaderCell>
                        <TableHeaderCell align="right">Atendida</TableHeaderCell>
                        <TableHeaderCell align="right">Preço unit.</TableHeaderCell>
                        <TableHeaderCell align="right">Total</TableHeaderCell>
                        <TableHeaderCell>Entrega</TableHeaderCell>
                        <TableHeaderCell>Centro de custo</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {erp.itens.map((item) => (
                        <TableRow key={`${item.sequencia}-${item.codigo}`}>
                          <TableCell>{item.sequencia}</TableCell>
                          <TableCell>
                            <Stack gap={2}>
                              <strong>{item.codigo}</strong>
                              <span>{item.descricao}</span>
                              {item.observacao && (
                                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{item.observacao}</span>
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            {formatarQuantidade(item.quantidade)} {item.unidade ?? ""}
                          </TableCell>
                          <TableCell align="right">{formatarQuantidade(item.atendida)}</TableCell>
                          <TableCell align="right">{formatarValor(item.precoUnitario, moeda)}</TableCell>
                          <TableCell align="right">{formatarValor(item.total, moeda)}</TableCell>
                          <TableCell>{item.entrega ?? "-"}</TableCell>
                          <TableCell>{item.centroCusto ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Stack>

                <FormGrid columns={4}>
                  <Field label="Valor bruto">
                    <span>{formatarValor(erp.valores.bruto, moeda)}</span>
                  </Field>
                  <Field label="Descontos">
                    <span>{formatarValor(erp.valores.descontos, moeda)}</span>
                  </Field>
                  <Field label="Acréscimos">
                    <span>{formatarValor(erp.valores.acrescimos, moeda)}</span>
                  </Field>
                  <Field label="Frete">
                    <span>{formatarValor(erp.valores.frete, moeda)}</span>
                  </Field>
                  <Field label="IPI">
                    <span>{formatarValor(erp.valores.ipi, moeda)}</span>
                  </Field>
                  <Field label="ICMS">
                    <span>{formatarValor(erp.valores.icms, moeda)}</span>
                  </Field>
                  <Field label="ICMS ST">
                    <span>{formatarValor(erp.valores.icmsSt, moeda)}</span>
                  </Field>
                  <Field label="Total">
                    <strong>{formatarValor(erp.valores.total, moeda)}</strong>
                  </Field>
                </FormGrid>

                {erp.parcelas.length > 0 && (
                  <Stack gap={8}>
                    <strong>Pagamento</strong>
                    <Table minWidth={500}>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Parcela</TableHeaderCell>
                          <TableHeaderCell align="right">Dias</TableHeaderCell>
                          <TableHeaderCell>Vencimento</TableHeaderCell>
                          <TableHeaderCell align="right">%</TableHeaderCell>
                          <TableHeaderCell align="right">Valor estimado</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {erp.parcelas.map((parcela) => (
                          <TableRow key={parcela.parcela}>
                            <TableCell>{parcela.parcela}</TableCell>
                            <TableCell align="right">{parcela.dias ?? "-"}</TableCell>
                            <TableCell>{parcela.vencimento ?? "-"}</TableCell>
                            <TableCell align="right">
                              {parcela.percentual === null
                                ? "-"
                                : `${parcela.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}
                              {!parcela.percentualInformado && " (dividido igualmente)"}
                            </TableCell>
                            <TableCell align="right">{formatarValor(parcela.valorEstimado, moeda)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Stack>
                )}

                {erp.observacao && (
                  <Field label="Observação do pedido">
                    <span style={{ whiteSpace: "pre-wrap" }}>{erp.observacao}</span>
                  </Field>
                )}
              </>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
