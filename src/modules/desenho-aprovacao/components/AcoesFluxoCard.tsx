"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FilePenLine,
  RotateCcw,
  Send,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";
import type {
  ApprovalRevision,
  ApprovalStatus,
  FlowAction,
} from "@/modules/desenho-aprovacao/types/approval";
import { getRevisionStatusLabel } from "@/modules/desenho-aprovacao/utils/formatters";

interface ApiActionResponse {
  ok: boolean;
  message?: string;
}

interface FlowActionConfig {
  title: string;
  description: string;
  endpoint: string;
  confirmLabel: string;
  loadingLabel: string;
  successTitle: string;
  fallbackSuccessMessage: string;
  fallbackErrorMessage: string;
  observationRequired: boolean;
  observationLabel: string;
  observationHint: string;
  observationPlaceholder: string;
}

function getFlowActionConfig(action: FlowAction, nextRevisionCode: string): FlowActionConfig {
  switch (action) {
    case "gerar":
      return {
        title: `Gerar revisão ${nextRevisionCode}`,
        description: "Uma nova revisão será criada com uma cópia dos dados atuais do desenho.",
        endpoint: "gerar",
        confirmLabel: `Gerar ${nextRevisionCode}`,
        loadingLabel: "Gerando revisão...",
        successTitle: "Revisão gerada",
        fallbackSuccessMessage: `A revisão ${nextRevisionCode} foi gerada e enviada para aprovação.`,
        fallbackErrorMessage: "Não foi possível gerar a nova revisão.",
        observationRequired: false,
        observationLabel: "Observação",
        observationHint: "A geração não exige observação.",
        observationPlaceholder: "",
      };

    case "aprovar":
      return {
        title: "Aprovar revisão",
        description: "Confirme a aprovação da revisão atual.",
        endpoint: "aprovar",
        confirmLabel: "Confirmar aprovação",
        loadingLabel: "Aprovando...",
        successTitle: "Desenho aprovado",
        fallbackSuccessMessage: "A revisão atual foi aprovada com sucesso.",
        fallbackErrorMessage: "Não foi possível aprovar o desenho.",
        observationRequired: false,
        observationLabel: "Observação da aprovação",
        observationHint: "Campo opcional para registrar informações sobre a decisão.",
        observationPlaceholder: "Digite uma observação sobre a aprovação",
      };

    case "solicitar-ajustes":
      return {
        title: "Solicitar ajustes",
        description:
          "A revisão atual será encerrada com ajustes solicitados, e o desenho voltará para pendente.",
        endpoint: "solicitar-ajustes",
        confirmLabel: "Confirmar solicitação",
        loadingLabel: "Solicitando ajustes...",
        successTitle: "Ajustes solicitados",
        fallbackSuccessMessage: "Os ajustes foram solicitados para a revisão atual.",
        fallbackErrorMessage: "Não foi possível solicitar os ajustes.",
        observationRequired: true,
        observationLabel: "Ajustes necessários",
        observationHint: "Descreva claramente as correções que deverão ser realizadas.",
        observationPlaceholder: "Ex.: Ajustar a altura total e revisar a distribuição de carga.",
      };

    case "reprovar":
      return {
        title: "Reprovar revisão",
        description: "A revisão atual e o desenho serão marcados como reprovados.",
        endpoint: "reprovar",
        confirmLabel: "Confirmar reprovação",
        loadingLabel: "Reprovando...",
        successTitle: "Desenho reprovado",
        fallbackSuccessMessage: "A revisão atual foi reprovada.",
        fallbackErrorMessage: "Não foi possível reprovar o desenho.",
        observationRequired: true,
        observationLabel: "Motivo da reprovação",
        observationHint: "Informe o motivo técnico ou comercial da reprovação.",
        observationPlaceholder: "Descreva o motivo da reprovação",
      };

    case "reabrir-revisao":
      return {
        title: "Reabrir para nova revisão",
        description:
          "O desenho voltará para rascunho. A revisão reprovada continuará preservada e não será modificada.",
        endpoint: "reabrir-revisao",
        confirmLabel: "Confirmar reabertura",
        loadingLabel: "Reabrindo...",
        successTitle: "Desenho reaberto",
        fallbackSuccessMessage: "O desenho foi reaberto para correção e criação de uma nova revisão.",
        fallbackErrorMessage: "Não foi possível reabrir o desenho.",
        observationRequired: true,
        observationLabel: "Motivo da reabertura",
        observationHint: "Registre por que o desenho está sendo reaberto.",
        observationPlaceholder: "Ex.: Desenho reaberto para correção dos requisitos técnicos.",
      };
  }
}

function FlowActionIcon({ action }: { action: FlowAction }) {
  switch (action) {
    case "gerar":
      return <Send size={17} aria-hidden="true" />;

    case "aprovar":
      return <CheckCircle2 size={17} aria-hidden="true" />;

    case "solicitar-ajustes":
      return <TriangleAlert size={17} aria-hidden="true" />;

    case "reprovar":
      return <XCircle size={17} aria-hidden="true" />;

    case "reabrir-revisao":
      return <RotateCcw size={17} aria-hidden="true" />;
  }
}

interface AcoesFluxoCardProps {
  desenhoId: string;
  status: ApprovalStatus;
  revisaoAtual: ApprovalRevision | null;
  proximoCodigoRevisao: string;
  salvandoEdicao: boolean;
  gerandoPdfRevisaoId: string | null;
  onAbrirEdicao: () => void;
  onAbrirSvg: (revisaoId: string) => void;
  onBaixarPdf: (revisao: ApprovalRevision) => void;
  onAcaoExecutada: () => Promise<void>;
  onToast: (variant: "success" | "danger", title: string, description: string) => void;
}

export function AcoesFluxoCard({
  desenhoId,
  status,
  revisaoAtual,
  proximoCodigoRevisao,
  salvandoEdicao,
  gerandoPdfRevisaoId,
  onAbrirEdicao,
  onAbrirSvg,
  onBaixarPdf,
  onAcaoExecutada,
  onToast,
}: AcoesFluxoCardProps) {
  const [acaoAtual, setAcaoAtual] = useState<FlowAction | null>(null);
  const [observacaoAcao, setObservacaoAcao] = useState("");
  const [executandoAcao, setExecutandoAcao] = useState(false);

  const actionConfig = acaoAtual ? getFlowActionConfig(acaoAtual, proximoCodigoRevisao) : null;

  function abrirAcao(action: FlowAction) {
    setObservacaoAcao("");
    setAcaoAtual(action);
  }

  function fecharAcao() {
    if (executandoAcao) return;
    setAcaoAtual(null);
    setObservacaoAcao("");
  }

  async function executarAcao() {
    if (!acaoAtual || !actionConfig) return;

    const observacao = observacaoAcao.trim();

    if (actionConfig.observationRequired && !observacao) {
      onToast("danger", "Observação obrigatória", "Informe uma observação antes de confirmar esta ação.");
      return;
    }

    setExecutandoAcao(true);

    try {
      const body: { observacao?: string | null } = {};

      if (acaoAtual !== "gerar") {
        body.observacao = observacao || null;
      }

      const response = await fetch(
        `/api/desenho-aprovacao/${encodeURIComponent(desenhoId)}/${actionConfig.endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(body),
        }
      );

      const payload = (await response.json()) as ApiActionResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? actionConfig.fallbackErrorMessage);
      }

      setAcaoAtual(null);
      setObservacaoAcao("");

      await onAcaoExecutada();

      onToast("success", actionConfig.successTitle, payload.message ?? actionConfig.fallbackSuccessMessage);
    } catch (error) {
      console.error("Erro ao executar ação:", error);

      onToast(
        "danger",
        "Não foi possível concluir",
        error instanceof Error ? error.message : actionConfig.fallbackErrorMessage
      );
    } finally {
      setExecutandoAcao(false);
    }
  }

  return (
    <>
      <Card title="Ações do fluxo" description="As ações disponíveis são controladas pelo status atual.">
        {(status === "rascunho" || status === "pendente") && (
          <Stack gap={16}>
            <Alert
              variant={status === "pendente" ? "warning" : "info"}
              title={status === "pendente" ? "Correções pendentes" : "Desenho em elaboração"}
            >
              {status === "pendente"
                ? "Atualize os dados solicitados antes de gerar uma nova revisão."
                : "Revise os dados técnicos antes de gerar a primeira revisão."}
            </Alert>

            <Stack direction="row" gap={10} align="center" wrap>
              <Button
                type="button"
                variant="secondary"
                disabled={executandoAcao || salvandoEdicao}
                onClick={onAbrirEdicao}
              >
                <FilePenLine size={17} aria-hidden="true" />
                Editar dados
              </Button>

              <Button
                type="button"
                disabled={executandoAcao || salvandoEdicao}
                onClick={() => abrirAcao("gerar")}
              >
                <Send size={17} aria-hidden="true" />
                Gerar {proximoCodigoRevisao}
              </Button>
            </Stack>
          </Stack>
        )}

        {status === "em_aprovacao" && (
          <Stack gap={16}>
            <Alert variant="info" title="Revisão aguardando decisão">
              A revisão <strong>{revisaoAtual?.codigoRevisao ?? "atual"}</strong> está em aprovação.
            </Alert>

            <Stack direction="row" gap={10} align="center" wrap>
              {revisaoAtual?.possuiSvg && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={executandoAcao || gerandoPdfRevisaoId !== null}
                    onClick={() => onAbrirSvg(revisaoAtual.id)}
                  >
                    <Eye size={17} aria-hidden="true" />
                    Abrir revisão atual
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    loading={gerandoPdfRevisaoId === revisaoAtual.id}
                    loadingLabel="Gerando PDF..."
                    disabled={
                      executandoAcao ||
                      (gerandoPdfRevisaoId !== null && gerandoPdfRevisaoId !== revisaoAtual.id)
                    }
                    onClick={() => onBaixarPdf(revisaoAtual)}
                  >
                    <Download size={17} aria-hidden="true" />
                    Baixar PDF
                  </Button>
                </>
              )}

              <Button type="button" disabled={executandoAcao} onClick={() => abrirAcao("aprovar")}>
                <CheckCircle2 size={17} aria-hidden="true" />
                Aprovar
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={executandoAcao}
                onClick={() => abrirAcao("solicitar-ajustes")}
              >
                <TriangleAlert size={17} aria-hidden="true" />
                Solicitar ajustes
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={executandoAcao}
                onClick={() => abrirAcao("reprovar")}
              >
                <XCircle size={17} aria-hidden="true" />
                Reprovar
              </Button>
            </Stack>
          </Stack>
        )}

        {status === "reprovado" && (
          <Stack gap={16}>
            <Alert variant="danger" title="Desenho reprovado">
              A revisão reprovada permanece preservada. Reabra o desenho para corrigir os dados e gerar
              uma nova revisão.
            </Alert>

            <Stack direction="row" gap={10} align="center" wrap>
              {revisaoAtual?.possuiSvg && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={executandoAcao || gerandoPdfRevisaoId !== null}
                    onClick={() => onAbrirSvg(revisaoAtual.id)}
                  >
                    <Eye size={17} aria-hidden="true" />
                    Abrir revisão reprovada
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    loading={gerandoPdfRevisaoId === revisaoAtual.id}
                    loadingLabel="Gerando PDF..."
                    disabled={
                      executandoAcao ||
                      (gerandoPdfRevisaoId !== null && gerandoPdfRevisaoId !== revisaoAtual.id)
                    }
                    onClick={() => onBaixarPdf(revisaoAtual)}
                  >
                    <Download size={17} aria-hidden="true" />
                    Baixar PDF
                  </Button>
                </>
              )}

              <Button type="button" disabled={executandoAcao} onClick={() => abrirAcao("reabrir-revisao")}>
                <RotateCcw size={17} aria-hidden="true" />
                Reabrir para revisão
              </Button>
            </Stack>
          </Stack>
        )}

        {status === "aprovado" && (
          <Stack gap={16}>
            <Alert variant="success" title="Desenho aprovado">
              A revisão atual foi aprovada. Os dados estão disponíveis somente para consulta.
            </Alert>

            {revisaoAtual?.possuiSvg && (
              <Stack direction="row" gap={10} align="center" wrap>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={gerandoPdfRevisaoId !== null}
                  onClick={() => onAbrirSvg(revisaoAtual.id)}
                >
                  <Eye size={17} aria-hidden="true" />
                  Abrir desenho aprovado
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  loading={gerandoPdfRevisaoId === revisaoAtual.id}
                  loadingLabel="Gerando PDF..."
                  disabled={
                    gerandoPdfRevisaoId !== null && gerandoPdfRevisaoId !== revisaoAtual.id
                  }
                  onClick={() => onBaixarPdf(revisaoAtual)}
                >
                  <Download size={17} aria-hidden="true" />
                  Baixar PDF
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      </Card>

      <Modal
        open={acaoAtual !== null}
        title={actionConfig?.title ?? "Confirmar ação"}
        description={actionConfig?.description}
        onClose={fecharAcao}
        footer={
          <Stack direction="row" gap={10} justify="end" wrap>
            <Button type="button" variant="secondary" disabled={executandoAcao} onClick={fecharAcao}>
              Cancelar
            </Button>

            <Button
              type="button"
              loading={executandoAcao}
              loadingLabel={actionConfig?.loadingLabel ?? "Processando..."}
              onClick={() => void executarAcao()}
            >
              {acaoAtual && <FlowActionIcon action={acaoAtual} />}
              {actionConfig?.confirmLabel ?? "Confirmar"}
            </Button>
          </Stack>
        }
      >
        {acaoAtual === "gerar" ? (
          <Stack gap={16}>
            <Alert variant="info" title={`Nova revisão ${proximoCodigoRevisao}`}>
              Os dados atuais do cadastro serão copiados para uma nova revisão imutável. Depois da
              geração, o desenho ficará em aprovação.
            </Alert>

            {revisaoAtual && (
              <Alert variant="warning" title="Revisão anterior preservada">
                A revisão <strong>{revisaoAtual.codigoRevisao}</strong> continuará armazenada com o
                status <strong>{getRevisionStatusLabel(revisaoAtual.statusRevisao)}</strong>.
              </Alert>
            )}
          </Stack>
        ) : (
          <Field
            label={actionConfig?.observationLabel ?? "Observação"}
            htmlFor="observacao-acao"
            required={actionConfig?.observationRequired}
            hint={actionConfig?.observationHint}
          >
            <Textarea
              id="observacao-acao"
              value={observacaoAcao}
              rows={6}
              maxLength={100000}
              placeholder={actionConfig?.observationPlaceholder}
              required={actionConfig?.observationRequired}
              disabled={executandoAcao}
              onChange={(event) => setObservacaoAcao(event.target.value)}
            />
          </Field>
        )}
      </Modal>
    </>
  );
}
