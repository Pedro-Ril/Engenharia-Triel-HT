"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";

import { buscarAndamentoItem, reenviarItemAprovacao } from "../services/aprovacoes.service";
import type { ItemAumentoSalarial } from "../types/aprovacoes.types";
import { CadeiaAprovacao } from "./CadeiaAprovacao";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface AndamentoItemModalProps {
  /* Colaborador aberto; null fecha o modal. */
  itemId: string | null;
  onClose: () => void;
  /* Depois do reenvio: a lista recarrega. */
  onReenviado: (mensagem: string) => void;
}

/*
 * Andamento de um colaborador na alçada, para quem solicitou: em que
 * nível está, quem já aprovou, e por que voltou. Devolvido, o
 * solicitante ajusta valor/percentual e reenvia -- recomeça do nível 1.
 */
export function AndamentoItemModal({ itemId, onClose, onReenviado }: AndamentoItemModalProps) {
  const [resultado, setResultado] = useState<{ id: string; item: ItemAumentoSalarial | null; erro: string | null } | null>(
    null
  );
  const [valor, setValor] = useState("");
  const [percentual, setPercentual] = useState("");
  const [comentario, setComentario] = useState("");
  const [reenviando, setReenviando] = useState(false);
  const [erroReenvio, setErroReenvio] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) return;
    let ativo = true;

    buscarAndamentoItem(itemId).then((resposta) => {
      if (!ativo) return;
      if (resposta.ok && resposta.data) {
        setResultado({ id: itemId, item: resposta.data, erro: null });
        setValor(resposta.data.valorReajuste.toFixed(2));
        setPercentual(Number(resposta.data.percentualReajuste).toFixed(2));
        setComentario("");
        setErroReenvio(null);
      } else {
        setResultado({ id: itemId, item: null, erro: resposta.message ?? "Não foi possível carregar o andamento." });
      }
    });

    return () => {
      ativo = false;
    };
  }, [itemId]);

  const atual = resultado && resultado.id === itemId ? resultado : null;
  const item = atual?.item ?? null;
  const devolvido = item?.status === "devolvido";

  const valorNumerico = Number(valor);
  const percentualNumerico = Number(percentual);
  const valido = valorNumerico > 0 && percentualNumerico > 0;

  /* Valor e percentual andam juntos, sobre o salário atual -- mesma regra da solicitação. */
  function alterarValor(texto: string) {
    setValor(texto);
    if (item && Number(texto) > 0) setPercentual(((Number(texto) / item.salarioAtual) * 100).toFixed(2));
  }

  function alterarPercentual(texto: string) {
    setPercentual(texto);
    if (item && Number(texto) > 0) setValor(((item.salarioAtual * Number(texto)) / 100).toFixed(2));
  }

  async function handleReenviar() {
    if (!item || !valido) return;
    setReenviando(true);
    setErroReenvio(null);

    try {
      const resposta = await reenviarItemAprovacao(item.id, {
        valorReajuste: valorNumerico,
        percentualReajuste: percentualNumerico,
        comentario: comentario.trim() || null,
      });

      if (resposta.ok) {
        onReenviado(`${item.funcionarioNome} foi reenviado para aprovação (recomeça do nível 1).`);
      } else {
        setErroReenvio(resposta.message ?? "Não foi possível reenviar.");
      }
    } finally {
      setReenviando(false);
    }
  }

  return (
    <Modal
      open={itemId !== null}
      size="large"
      title={item ? item.funcionarioNome : "Andamento"}
      description={item ? `Solicitação #${item.aprovacaoNumero}` : undefined}
      onClose={onClose}
      footer={
        devolvido ? (
          <Stack direction="row" justify="end" gap={8}>
            <Button variant="secondary" onClick={onClose} disabled={reenviando}>
              Fechar
            </Button>
            <Button onClick={() => void handleReenviar()} loading={reenviando} disabled={!valido}>
              <Send size={16} />
              Reenviar para aprovação
            </Button>
          </Stack>
        ) : undefined
      }
    >
      <Stack gap={20}>
        {!atual && itemId && <Loader label="Carregando andamento..." />}
        {atual?.erro && <Alert variant="danger">{atual.erro}</Alert>}

        {item && (
          <>
            {devolvido && (
              <Alert variant="info" title="Devolvido para ajuste">
                {item.decididoPorNome ? `${item.decididoPorNome} devolveu` : "Foi devolvido"}
                {item.comentarioDecisao ? `: "${item.comentarioDecisao}"` : "."} Ajuste abaixo e reenvie — a
                aprovação recomeça do nível 1.
              </Alert>
            )}

            {item.fluxo && <CadeiaAprovacao etapas={item.fluxo.etapas} historico={item.fluxo.historico} />}

            {devolvido && (
              <Stack gap={12}>
                <strong>Ajustar e reenviar</strong>
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Salário atual: {formatarMoeda(item.salarioAtual)}
                </span>
                <FormGrid columns={2}>
                  <Field label="Valor do reajuste" htmlFor="reenvioValor">
                    <CurrencyInput
                      id="reenvioValor"
                      value={valor}
                      onValueChange={alterarValor}
                      disabled={reenviando}
                      hasError={!valido}
                    />
                  </Field>
                  <Field label="Percentual" htmlFor="reenvioPercentual">
                    <NumberInput
                      id="reenvioPercentual"
                      suffix="%"
                      step="0.01"
                      value={percentual}
                      onChange={(evento) => alterarPercentual(evento.target.value)}
                      disabled={reenviando}
                    />
                  </Field>
                </FormGrid>
                <Field label="Comentário para os aprovadores (opcional)" htmlFor="reenvioComentario">
                  <Textarea
                    id="reenvioComentario"
                    rows={3}
                    value={comentario}
                    onChange={(evento) => setComentario(evento.target.value)}
                    disabled={reenviando}
                  />
                </Field>
                {valido && (
                  <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    Novo salário: {formatarMoeda(item.salarioAtual + valorNumerico)}
                  </span>
                )}
                {erroReenvio && <Alert variant="danger">{erroReenvio}</Alert>}
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
