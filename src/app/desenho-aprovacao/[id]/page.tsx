"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FilePenLine,
  Home,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  Autocomplete,
  type AutocompleteOption,
} from "@/components/ui/Autocomplete";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DateInput } from "@/components/ui/DateInput";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
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
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";

import {
  approvalStatusConfig,
} from "@/modules/desenho-aprovacao/constants/approval-status";

import type {
  ApprovalStatus,
} from "@/modules/desenho-aprovacao/types/approval";

type ApprovalRepresentation =
  | "lateral"
  | "superior"
  | "completo";

type RevisionStatus =
  | "gerando"
  | "gerado"
  | "em_aprovacao"
  | "ajustes_solicitados"
  | "aprovado"
  | "reprovado"
  | "erro";

type FlowAction =
  | "gerar"
  | "aprovar"
  | "solicitar-ajustes"
  | "reprovar"
  | "reabrir-revisao";

interface ApprovalDrawing {
  id: string;
  sequencial: string;
  numero: string;

  cliente: string | null;
  produto: string | null;
  modelo: string | null;

  caminhao: string | null;
  cabine: string | null;

  comprimento: number | null;
  altura: number | null;

  capacidadeTon: number | null;
  volumeM3: number | null;

  compartimentos: number | null;
  peso: number | null;

  cargaDianteira: number | null;
  cargaTraseira: number | null;

  observacoes: string | null;

  status: ApprovalStatus;

  tipoRepresentacao:
    ApprovalRepresentation;

  dataEmissao: string | null;
  previsaoAprovacao: string | null;

  incluirCotas: boolean;
  calculoAutomatico: boolean;
  incluirCaminhao: boolean;

  ativo: boolean;

  criadoEm: string;
  criadoPor: string | null;

  atualizadoEm: string;
  atualizadoPor: string | null;
}

interface ApprovalDrawingResponse {
  ok: boolean;
  data?: ApprovalDrawing;
  message?: string;
}

interface ApprovalRevision {
  id: string;

  numeroRevisao: number;
  codigoRevisao: string;
  statusRevisao: RevisionStatus;

  templateCodigo: string | null;
  templateVersao: number | null;
  geradorVersao: string | null;

  possuiSvg: boolean;
  possuiPdf: boolean;

  criadoEm: string;
  criadoPor: string | null;

  geradoEm: string | null;
  geradoPor: string | null;

  enviadoAprovacaoEm: string | null;
  enviadoAprovacaoPor: string | null;

  decididoEm: string | null;
  decididoPor: string | null;

  observacaoDecisao: string | null;
}

interface ApprovalRevisionsResponse {
  ok: boolean;

  data?: {
    desenho: {
      desenhoId: string;
      numero: string;
      status: ApprovalStatus;
      revisaoAtualId: string | null;
    };

    revisoes: ApprovalRevision[];
  };

  total?: number;
  message?: string;
}

interface ApprovalHistoryItem {
  id: string;
  desenhoId: string;

  acao: string;

  statusAnterior: ApprovalStatus | null;
  statusNovo: ApprovalStatus | null;

  observacao: string | null;
  dados: unknown;

  usuario: string | null;
  criadoEm: string;
}

interface ApprovalHistoryResponse {
  ok: boolean;

  data?: {
    desenho: {
      id: string;
      numero: string;
      status: ApprovalStatus;
      ativo: boolean;
    };

    historico: ApprovalHistoryItem[];
  };

  total?: number;
  message?: string;
}

interface ApiActionResponse {
  ok: boolean;
  message?: string;
}

interface ToastState {
  open: boolean;
  variant: "success" | "danger";
  title: string;
  description: string;
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

const representationOptions: AutocompleteOption[] = [
  {
    value: "lateral",
    label: "Vista lateral",
  },
  {
    value: "superior",
    label: "Vista superior",
  },
  {
    value: "completo",
    label: "Representação completa",
  },
];

function getRevisionSvgUrl(
  desenhoId: string,
  revisaoId: string
) {
  return `/api/desenho-aprovacao/${encodeURIComponent(
    desenhoId
  )}/revisoes/${encodeURIComponent(
    revisaoId
  )}/svg`;
}

function sanitizeFileName(
  value: string
) {
  const sanitized = value
    .trim()
    .replace(
      /[<>:"/\\|?*\u0000-\u001f]/g,
      "-"
    )
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "desenho-aprovacao";
}

async function getResponseErrorMessage(
  response: Response,
  fallbackMessage: string
) {
  try {
    const payload: unknown =
      await response.json();

    if (
      typeof payload === "object" &&
      payload !== null &&
      !Array.isArray(payload) &&
      "message" in payload &&
      typeof payload.message === "string" &&
      payload.message.trim()
    ) {
      return payload.message.trim();
    }
  } catch {
    // A resposta pode ser o próprio SVG ou texto simples.
  }

  return fallbackMessage;
}

async function createPdfFromSvg({
  svgUrl,
  fileName,
  title,
}: {
  svgUrl: string;
  fileName: string;
  title: string;
}) {
  const response = await fetch(svgUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      await getResponseErrorMessage(
        response,
        "Não foi possível carregar o SVG da revisão."
      )
    );
  }

  const svgContent =
    await response.text();

  const parsedDocument =
    new DOMParser().parseFromString(
      svgContent,
      "image/svg+xml"
    );

  if (
    parsedDocument.querySelector(
      "parsererror"
    )
  ) {
    throw new Error(
      "O SVG da revisão possui um formato inválido."
    );
  }

  const parsedSvg =
    parsedDocument.querySelector(
      "svg"
    );

  if (!parsedSvg) {
    throw new Error(
      "A resposta recebida não contém um SVG válido."
    );
  }

  const svgElement =
    document.importNode(
      parsedSvg,
      true
    );

  const temporaryContainer =
    document.createElement("div");

  temporaryContainer.setAttribute(
    "aria-hidden",
    "true"
  );

  Object.assign(
    temporaryContainer.style,
    {
      position: "fixed",
      left: "-100000px",
      top: "0",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      pointerEvents: "none",
      opacity: "0",
    }
  );

  temporaryContainer.appendChild(
    svgElement
  );

  document.body.appendChild(
    temporaryContainer
  );

  try {
    const [
      { jsPDF },
      { svg2pdf },
    ] = await Promise.all([
      import("jspdf"),
      import("svg2pdf.js"),
    ]);

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a3",
      compress: true,
    });

    pdf.setProperties({
      title,
      subject:
        "Desenho de aprovação",
      author:
        "Portal da Engenharia - TRIEL-HT",
      creator:
        "Portal da Engenharia - TRIEL-HT",
    });

    /*
     * O SVG já possui proporção e viewBox de uma
     * folha A3 horizontal (420 x 297).
     *
     * Usamos as dimensões reais da página criada
     * pelo jsPDF e renderizamos a partir de 0,0,
     * sem adicionar uma segunda margem externa.
     *
     * A margem técnica existente dentro do próprio
     * SVG continua preservada.
     */
    const pageWidth =
      pdf.internal.pageSize.getWidth();

    const pageHeight =
      pdf.internal.pageSize.getHeight();

    await svg2pdf(
      svgElement,
      pdf,
      {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      }
    );

    pdf.save(
      `${sanitizeFileName(
        fileName
      )}.pdf`
    );
  } finally {
    temporaryContainer.remove();
  }
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  const datePart =
    value.slice(0, 10);

  const [year, month, day] =
    datePart.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  ).format(date);
}

function formatNumber(
  value: number | null,
  suffix?: string
) {
  if (value === null) {
    return "—";
  }

  const formatted =
    new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2,
    }).format(value);

  return suffix
    ? `${formatted} ${suffix}`
    : formatted;
}

function getStatusVariant(
  status: ApprovalStatus
):
  | "info"
  | "warning"
  | "success"
  | "danger"
  | undefined {
  switch (status) {
    case "em_aprovacao":
      return "info";

    case "pendente":
      return "warning";

    case "aprovado":
      return "success";

    case "reprovado":
      return "danger";

    default:
      return undefined;
  }
}

function getRepresentationLabel(
  representation:
    ApprovalRepresentation
) {
  switch (representation) {
    case "lateral":
      return "Vista lateral";

    case "superior":
      return "Vista superior";

    case "completo":
      return "Representação completa";
  }
}

function getBooleanLabel(
  value: boolean
) {
  return value ? "Sim" : "Não";
}

function getRevisionStatusLabel(
  status: RevisionStatus
) {
  switch (status) {
    case "gerando":
      return "Gerando";

    case "gerado":
      return "Gerado";

    case "em_aprovacao":
      return "Em aprovação";

    case "ajustes_solicitados":
      return "Ajustes solicitados";

    case "aprovado":
      return "Aprovado";

    case "reprovado":
      return "Reprovado";

    case "erro":
      return "Erro";
  }
}

function getRevisionStatusVariant(
  status: RevisionStatus
):
  | "info"
  | "warning"
  | "success"
  | "danger"
  | undefined {
  switch (status) {
    case "gerando":
    case "gerado":
    case "em_aprovacao":
      return "info";

    case "ajustes_solicitados":
      return "warning";

    case "aprovado":
      return "success";

    case "reprovado":
    case "erro":
      return "danger";

    default:
      return undefined;
  }
}

function getHistoryActionLabel(
  action: string
) {
  switch (action) {
    case "CRIADO":
      return "Desenho criado";

    case "ATUALIZADO":
      return "Dados atualizados";

    case "ENVIADO_APROVACAO":
      return "Revisão enviada para aprovação";

    case "APROVADO":
      return "Revisão aprovada";

    case "AJUSTES_SOLICITADOS":
      return "Ajustes solicitados";

    case "REPROVADO":
      return "Revisão reprovada";

    case "REABERTO_REVISAO":
      return "Desenho reaberto";

    case "EXCLUIDO":
      return "Desenho excluído";

    default:
      return action
        .toLowerCase()
        .split("_")
        .map(
          (part) =>
            part.charAt(0).toUpperCase() +
            part.slice(1)
        )
        .join(" ");
  }
}

function getHistoryActionVariant(
  action: string
):
  | "info"
  | "warning"
  | "success"
  | "danger"
  | undefined {
  switch (action) {
    case "CRIADO":
    case "ENVIADO_APROVACAO":
      return "info";

    case "AJUSTES_SOLICITADOS":
    case "REABERTO_REVISAO":
      return "warning";

    case "APROVADO":
      return "success";

    case "REPROVADO":
    case "EXCLUIDO":
      return "danger";

    default:
      return undefined;
  }
}

function getHistoryRevisionCode(
  data: unknown
): string | null {
  if (
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    return null;
  }

  const record =
    data as Record<string, unknown>;

  const codigoRevisao =
    record.codigoRevisao;

  if (
    typeof codigoRevisao === "string" &&
    codigoRevisao.trim()
  ) {
    return codigoRevisao.trim();
  }

  const revisaoAnterior =
    record.revisaoAnterior;

  if (
    typeof revisaoAnterior === "string" &&
    revisaoAnterior.trim()
  ) {
    return revisaoAnterior.trim();
  }

  return null;
}

function getOptionalText(
  formData: FormData,
  fieldName: string
): string | null {
  const value =
    formData.get(fieldName);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue =
    value.trim();

  return normalizedValue || null;
}

function getRequiredText(
  formData: FormData,
  fieldName: string,
  fieldLabel: string
): string {
  const value = getOptionalText(
    formData,
    fieldName
  );

  if (!value) {
    throw new Error(
      `O campo ${fieldLabel} é obrigatório.`
    );
  }

  return value;
}

function getOptionalNumber(
  formData: FormData,
  fieldName: string,
  fieldLabel: string
): number | null {
  const value =
    formData.get(fieldName);

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  const normalizedValue = Number(
    value.replace(",", ".")
  );

  if (!Number.isFinite(normalizedValue)) {
    throw new Error(
      `O campo ${fieldLabel} deve ser um número válido.`
    );
  }

  return normalizedValue;
}

function getFlowActionConfig(
  action: FlowAction,
  nextRevisionCode: string
): FlowActionConfig {
  switch (action) {
    case "gerar":
      return {
        title: `Gerar revisão ${nextRevisionCode}`,
        description:
          "Uma nova revisão será criada com uma cópia dos dados atuais do desenho.",

        endpoint: "gerar",

        confirmLabel:
          `Gerar ${nextRevisionCode}`,

        loadingLabel:
          "Gerando revisão...",

        successTitle:
          "Revisão gerada",

        fallbackSuccessMessage:
          `A revisão ${nextRevisionCode} foi gerada e enviada para aprovação.`,

        fallbackErrorMessage:
          "Não foi possível gerar a nova revisão.",

        observationRequired: false,

        observationLabel:
          "Observação",

        observationHint:
          "A geração não exige observação.",

        observationPlaceholder: "",
      };

    case "aprovar":
      return {
        title: "Aprovar revisão",
        description:
          "Confirme a aprovação da revisão atual.",

        endpoint: "aprovar",

        confirmLabel:
          "Confirmar aprovação",

        loadingLabel:
          "Aprovando...",

        successTitle:
          "Desenho aprovado",

        fallbackSuccessMessage:
          "A revisão atual foi aprovada com sucesso.",

        fallbackErrorMessage:
          "Não foi possível aprovar o desenho.",

        observationRequired: false,

        observationLabel:
          "Observação da aprovação",

        observationHint:
          "Campo opcional para registrar informações sobre a decisão.",

        observationPlaceholder:
          "Digite uma observação sobre a aprovação",
      };

    case "solicitar-ajustes":
      return {
        title: "Solicitar ajustes",
        description:
          "A revisão atual será encerrada com ajustes solicitados, e o desenho voltará para pendente.",

        endpoint: "solicitar-ajustes",

        confirmLabel:
          "Confirmar solicitação",

        loadingLabel:
          "Solicitando ajustes...",

        successTitle:
          "Ajustes solicitados",

        fallbackSuccessMessage:
          "Os ajustes foram solicitados para a revisão atual.",

        fallbackErrorMessage:
          "Não foi possível solicitar os ajustes.",

        observationRequired: true,

        observationLabel:
          "Ajustes necessários",

        observationHint:
          "Descreva claramente as correções que deverão ser realizadas.",

        observationPlaceholder:
          "Ex.: Ajustar a altura total e revisar a distribuição de carga.",
      };

    case "reprovar":
      return {
        title: "Reprovar revisão",
        description:
          "A revisão atual e o desenho serão marcados como reprovados.",

        endpoint: "reprovar",

        confirmLabel:
          "Confirmar reprovação",

        loadingLabel:
          "Reprovando...",

        successTitle:
          "Desenho reprovado",

        fallbackSuccessMessage:
          "A revisão atual foi reprovada.",

        fallbackErrorMessage:
          "Não foi possível reprovar o desenho.",

        observationRequired: true,

        observationLabel:
          "Motivo da reprovação",

        observationHint:
          "Informe o motivo técnico ou comercial da reprovação.",

        observationPlaceholder:
          "Descreva o motivo da reprovação",
      };

    case "reabrir-revisao":
      return {
        title:
          "Reabrir para nova revisão",

        description:
          "O desenho voltará para rascunho. A revisão reprovada continuará preservada e não será modificada.",

        endpoint:
          "reabrir-revisao",

        confirmLabel:
          "Confirmar reabertura",

        loadingLabel:
          "Reabrindo...",

        successTitle:
          "Desenho reaberto",

        fallbackSuccessMessage:
          "O desenho foi reaberto para correção e criação de uma nova revisão.",

        fallbackErrorMessage:
          "Não foi possível reabrir o desenho.",

        observationRequired: true,

        observationLabel:
          "Motivo da reabertura",

        observationHint:
          "Registre por que o desenho está sendo reaberto.",

        observationPlaceholder:
          "Ex.: Desenho reaberto para correção dos requisitos técnicos.",
      };
  }
}

function FlowActionIcon({
  action,
}: {
  action: FlowAction;
}) {
  switch (action) {
    case "gerar":
      return (
        <Send
          size={17}
          aria-hidden="true"
        />
      );

    case "aprovar":
      return (
        <CheckCircle2
          size={17}
          aria-hidden="true"
        />
      );

    case "solicitar-ajustes":
      return (
        <TriangleAlert
          size={17}
          aria-hidden="true"
        />
      );

    case "reprovar":
      return (
        <XCircle
          size={17}
          aria-hidden="true"
        />
      );

    case "reabrir-revisao":
      return (
        <RotateCcw
          size={17}
          aria-hidden="true"
        />
      );
  }
}

export default function DetalhesDesenhoPage() {
  const router = useRouter();

  const params = useParams<{
    id: string;
  }>();

  const id = params.id;

  const [desenho, setDesenho] =
    useState<ApprovalDrawing | null>(
      null
    );

  const [revisoes, setRevisoes] =
    useState<ApprovalRevision[]>([]);

  const [historico, setHistorico] =
    useState<ApprovalHistoryItem[]>([]);

  const [
    revisaoAtualId,
    setRevisaoAtualId,
  ] = useState<string | null>(null);

  const [carregando, setCarregando] =
    useState(true);

  const [
    carregandoRevisoes,
    setCarregandoRevisoes,
  ] = useState(true);

  const [
    carregandoHistorico,
    setCarregandoHistorico,
  ] = useState(true);

  const [erro, setErro] =
    useState<string | null>(null);

  const [
    erroRevisoes,
    setErroRevisoes,
  ] = useState<string | null>(null);

  const [
    erroHistorico,
    setErroHistorico,
  ] = useState<string | null>(null);

  const [
    modalEdicaoAberto,
    setModalEdicaoAberto,
  ] = useState(false);

  const [
    salvandoEdicao,
    setSalvandoEdicao,
  ] = useState(false);

  const [
    representacaoSelecionada,
    setRepresentacaoSelecionada,
  ] = useState<AutocompleteOption | null>(
    null
  );

  const [
    acaoAtual,
    setAcaoAtual,
  ] = useState<FlowAction | null>(
    null
  );

  const [
    observacaoAcao,
    setObservacaoAcao,
  ] = useState("");

  const [
    executandoAcao,
    setExecutandoAcao,
  ] = useState(false);

  const [
    gerandoPdfRevisaoId,
    setGerandoPdfRevisaoId,
  ] = useState<string | null>(
    null
  );

  const [toast, setToast] =
    useState<ToastState>({
      open: false,
      variant: "success",
      title: "",
      description: "",
    });

  const carregarDesenho =
    useCallback(
      async (
        signal?: AbortSignal
      ) => {
        if (!id) {
          setErro(
            "O identificador do desenho não foi informado."
          );

          setCarregando(false);
          return;
        }

        setCarregando(true);
        setErro(null);

        try {
          const response = await fetch(
            `/api/desenho-aprovacao/${encodeURIComponent(
              id
            )}`,
            {
              method: "GET",
              cache: "no-store",
              signal,
            }
          );

          const payload =
            (await response.json()) as
              ApprovalDrawingResponse;

          if (
            !response.ok ||
            !payload.ok ||
            !payload.data
          ) {
            throw new Error(
              payload.message ??
                "Não foi possível carregar o desenho."
            );
          }

          setDesenho(payload.data);
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }

          console.error(
            "Erro ao carregar desenho:",
            error
          );

          setErro(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o desenho."
          );
        } finally {
          if (!signal?.aborted) {
            setCarregando(false);
          }
        }
      },
      [id]
    );

  const carregarRevisoes =
    useCallback(
      async (
        signal?: AbortSignal
      ) => {
        if (!id) {
          setErroRevisoes(
            "O identificador do desenho não foi informado."
          );

          setCarregandoRevisoes(false);
          return;
        }

        setCarregandoRevisoes(true);
        setErroRevisoes(null);

        try {
          const response = await fetch(
            `/api/desenho-aprovacao/${encodeURIComponent(
              id
            )}/revisoes`,
            {
              method: "GET",
              cache: "no-store",
              signal,
            }
          );

          const payload =
            (await response.json()) as
              ApprovalRevisionsResponse;

          if (
            !response.ok ||
            !payload.ok ||
            !payload.data ||
            !Array.isArray(
              payload.data.revisoes
            )
          ) {
            throw new Error(
              payload.message ??
                "Não foi possível carregar as revisões."
            );
          }

          setRevisoes(
            payload.data.revisoes
          );

          setRevisaoAtualId(
            payload.data.desenho
              .revisaoAtualId
          );
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }

          console.error(
            "Erro ao carregar revisões:",
            error
          );

          setErroRevisoes(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar as revisões."
          );
        } finally {
          if (!signal?.aborted) {
            setCarregandoRevisoes(false);
          }
        }
      },
      [id]
    );

  const carregarHistorico =
    useCallback(
      async (
        signal?: AbortSignal
      ) => {
        if (!id) {
          setErroHistorico(
            "O identificador do desenho não foi informado."
          );

          setCarregandoHistorico(false);
          return;
        }

        setCarregandoHistorico(true);
        setErroHistorico(null);

        try {
          const response = await fetch(
            `/api/desenho-aprovacao/${encodeURIComponent(
              id
            )}/historico`,
            {
              method: "GET",
              cache: "no-store",
              signal,
            }
          );

          const payload =
            (await response.json()) as
              ApprovalHistoryResponse;

          if (
            !response.ok ||
            !payload.ok ||
            !payload.data ||
            !Array.isArray(
              payload.data.historico
            )
          ) {
            throw new Error(
              payload.message ??
                "Não foi possível carregar o histórico."
            );
          }

          setHistorico(
            payload.data.historico
          );
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }

          console.error(
            "Erro ao carregar histórico:",
            error
          );

          setErroHistorico(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o histórico."
          );
        } finally {
          if (!signal?.aborted) {
            setCarregandoHistorico(false);
          }
        }
      },
      [id]
    );

  const atualizarPagina =
    useCallback(async () => {
      await Promise.all([
        carregarDesenho(),
        carregarRevisoes(),
        carregarHistorico(),
      ]);
    }, [
      carregarDesenho,
      carregarHistorico,
      carregarRevisoes,
    ]);

  useEffect(() => {
    const controller =
      new AbortController();

    void Promise.all([
      carregarDesenho(
        controller.signal
      ),

      carregarRevisoes(
        controller.signal
      ),

      carregarHistorico(
        controller.signal
      ),
    ]);

    return () => {
      controller.abort();
    };
  }, [
    carregarDesenho,
    carregarHistorico,
    carregarRevisoes,
  ]);

  const revisaoAtual =
    revisoes.find(
      (revisao) =>
        revisao.id === revisaoAtualId
    ) ?? null;

  const proximoNumeroRevisao =
    revisoes.reduce(
      (
        maiorNumero,
        revisao
      ) =>
        Math.max(
          maiorNumero,
          revisao.numeroRevisao
        ),
      -1
    ) + 1;

  const proximoCodigoRevisao =
    `R${String(
      proximoNumeroRevisao
    ).padStart(2, "0")}`;

  const podeEditar =
    desenho?.status === "rascunho" ||
    desenho?.status === "pendente";

  const actionConfig =
    acaoAtual
      ? getFlowActionConfig(
          acaoAtual,
          proximoCodigoRevisao
        )
      : null;

  function abrirSvg(
    revisaoId: string
  ) {
    const svgUrl =
      getRevisionSvgUrl(
        id,
        revisaoId
      );

    window.open(
      svgUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function baixarPdf(
    revisao: ApprovalRevision
  ) {
    if (
      !desenho ||
      gerandoPdfRevisaoId !== null
    ) {
      return;
    }

    if (!revisao.possuiSvg) {
      setToast({
        open: true,
        variant: "danger",
        title:
          "SVG não disponível",
        description:
          "Esta revisão ainda não possui um SVG para gerar o PDF.",
      });

      return;
    }

    setGerandoPdfRevisaoId(
      revisao.id
    );

    try {
      await createPdfFromSvg({
        svgUrl: getRevisionSvgUrl(
          desenho.id,
          revisao.id
        ),

        fileName:
          `${desenho.numero}-${revisao.codigoRevisao}`,

        title:
          `${desenho.numero} - ${revisao.codigoRevisao}`,
      });

      setToast({
        open: true,
        variant: "success",
        title: "PDF gerado",
        description:
          `O PDF da revisão ${revisao.codigoRevisao} foi gerado com sucesso.`,
      });
    } catch (error) {
      console.error(
        "Erro ao gerar PDF da revisão:",
        error
      );

      setToast({
        open: true,
        variant: "danger",
        title:
          "Erro ao gerar PDF",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar o PDF da revisão.",
      });
    } finally {
      setGerandoPdfRevisaoId(
        null
      );
    }
  }

  function abrirEdicao() {
    if (!desenho || !podeEditar) {
      return;
    }

    const option =
      representationOptions.find(
        (item) =>
          item.value ===
          desenho.tipoRepresentacao
      ) ?? null;

    setRepresentacaoSelecionada(
      option
    );

    setModalEdicaoAberto(true);
  }

  function fecharEdicao() {
    if (salvandoEdicao) {
      return;
    }

    setModalEdicaoAberto(false);
  }

  function abrirAcao(
    action: FlowAction
  ) {
    setObservacaoAcao("");
    setAcaoAtual(action);
  }

  function fecharAcao() {
    if (executandoAcao) {
      return;
    }

    setAcaoAtual(null);
    setObservacaoAcao("");
  }

  async function salvarEdicao(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!desenho || !podeEditar) {
      return;
    }

    setSalvandoEdicao(true);

    try {
      const formData =
        new FormData(
          event.currentTarget
        );

      const cliente =
        getRequiredText(
          formData,
          "cliente",
          "Cliente"
        );

      const produto =
        getRequiredText(
          formData,
          "produto",
          "Produto"
        );

      const dataEmissao =
        getRequiredText(
          formData,
          "dataEmissao",
          "Data de emissão"
        );

      const previsaoAprovacao =
        getOptionalText(
          formData,
          "previsaoAprovacao"
        );

      if (
        previsaoAprovacao &&
        previsaoAprovacao <
          dataEmissao
      ) {
        throw new Error(
          "A previsão de aprovação não pode ser anterior à data de emissão."
        );
      }

      const compartimentos =
        getOptionalNumber(
          formData,
          "compartimentos",
          "Compartimentos"
        );

      if (
        compartimentos !== null &&
        !Number.isInteger(
          compartimentos
        )
      ) {
        throw new Error(
          "O campo Compartimentos deve ser um número inteiro."
        );
      }

      const tipoRepresentacao =
        (
          representacaoSelecionada?.value ??
          desenho.tipoRepresentacao
        ) as ApprovalRepresentation;

      const requestBody = {
        cliente,
        produto,

        modelo: getOptionalText(
          formData,
          "modelo"
        ),

        caminhao: getOptionalText(
          formData,
          "caminhao"
        ),

        cabine: getOptionalText(
          formData,
          "cabine"
        ),

        comprimento:
          getOptionalNumber(
            formData,
            "comprimento",
            "Comprimento"
          ),

        altura: getOptionalNumber(
          formData,
          "altura",
          "Altura"
        ),

        capacidadeTon:
          getOptionalNumber(
            formData,
            "capacidadeTon",
            "Capacidade"
          ),

        volumeM3:
          getOptionalNumber(
            formData,
            "volumeM3",
            "Volume"
          ),

        compartimentos,

        peso: getOptionalNumber(
          formData,
          "peso",
          "Peso"
        ),

        cargaDianteira:
          getOptionalNumber(
            formData,
            "cargaDianteira",
            "Carga dianteira"
          ),

        cargaTraseira:
          getOptionalNumber(
            formData,
            "cargaTraseira",
            "Carga traseira"
          ),

        observacoes:
          getOptionalText(
            formData,
            "observacoes"
          ),

        tipoRepresentacao,

        dataEmissao,
        previsaoAprovacao,

        incluirCotas:
          formData.has(
            "incluirCotas"
          ),

        calculoAutomatico:
          formData.has(
            "calculoAutomatico"
          ),

        incluirCaminhao:
          formData.has(
            "incluirCaminhao"
          ),

        usuario: "portal-web",
      };

      const response = await fetch(
        `/api/desenho-aprovacao/${encodeURIComponent(
          desenho.id
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
          },
          body: JSON.stringify(
            requestBody
          ),
        }
      );

      const payload =
        (await response.json()) as
          ApiActionResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message ??
            "Não foi possível atualizar o desenho."
        );
      }

      setModalEdicaoAberto(false);

      await atualizarPagina();

      setToast({
        open: true,
        variant: "success",
        title: "Dados atualizados",
        description:
          payload.message ??
          "Os dados do desenho foram atualizados com sucesso.",
      });
    } catch (error) {
      console.error(
        "Erro ao atualizar desenho:",
        error
      );

      setToast({
        open: true,
        variant: "danger",
        title:
          "Erro ao atualizar",

        description:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar o desenho.",
      });
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function executarAcao() {
    if (
      !desenho ||
      !acaoAtual ||
      !actionConfig
    ) {
      return;
    }

    const observacao =
      observacaoAcao.trim();

    if (
      actionConfig.observationRequired &&
      !observacao
    ) {
      setToast({
        open: true,
        variant: "danger",
        title:
          "Observação obrigatória",

        description:
          "Informe uma observação antes de confirmar esta ação.",
      });

      return;
    }

    setExecutandoAcao(true);

    try {
      const body: {
        usuario: string;
        observacao?: string | null;
      } = {
        usuario: "portal-web",
      };

      if (acaoAtual !== "gerar") {
        body.observacao =
          observacao || null;
      }

      const response = await fetch(
        `/api/desenho-aprovacao/${encodeURIComponent(
          desenho.id
        )}/${actionConfig.endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
          },
          body: JSON.stringify(body),
        }
      );

      const payload =
        (await response.json()) as
          ApiActionResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message ??
            actionConfig.fallbackErrorMessage
        );
      }

      setAcaoAtual(null);
      setObservacaoAcao("");

      await atualizarPagina();

      setToast({
        open: true,
        variant: "success",
        title:
          actionConfig.successTitle,

        description:
          payload.message ??
          actionConfig.fallbackSuccessMessage,
      });
    } catch (error) {
      console.error(
        "Erro ao executar ação:",
        error
      );

      setToast({
        open: true,
        variant: "danger",
        title:
          "Não foi possível concluir",

        description:
          error instanceof Error
            ? error.message
            : actionConfig.fallbackErrorMessage,
      });
    } finally {
      setExecutandoAcao(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={
          desenho?.numero ??
          "Detalhes do desenho"
        }
        description="Visualização, edição, revisões e fluxo de aprovação."
        actions={
          <Stack
            direction="row"
            gap={10}
            align="center"
            wrap
          >
            <Button
              type="button"
              variant="secondary"
              loading={
                carregando ||
                carregandoRevisoes ||
                carregandoHistorico
              }
              loadingLabel="Atualizando..."
              onClick={() =>
                void atualizarPagina()
              }
            >
              <RefreshCw
                size={17}
                aria-hidden="true"
              />

              Atualizar
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                router.push(
                  "/desenho-aprovacao"
                )
              }
            >
              <ArrowLeft
                size={17}
                aria-hidden="true"
              />

              Voltar
            </Button>
          </Stack>
        }
      />

      <Breadcrumb
        items={[
          {
            label: "Início",
            href: "/",
            icon: <Home />,
          },
          {
            label:
              "Desenhos de Aprovação",
            href: "/desenho-aprovacao",
          },
          {
            label:
              desenho?.numero ??
              "Detalhes",
            current: true,
          },
        ]}
      />

      {carregando && (
        <Card>
          <Loader
            centered
            label="Carregando desenho..."
          />
        </Card>
      )}

      {!carregando && erro && (
        <Card>
          <Stack gap={16}>
            <Alert
              variant="danger"
              title="Erro ao carregar o desenho"
            >
              {erro}
            </Alert>

            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void atualizarPagina()
                }
              >
                <RefreshCw
                  size={16}
                  aria-hidden="true"
                />

                Tentar novamente
              </Button>
            </div>
          </Stack>
        </Card>
      )}

      {!carregando &&
        !erro &&
        desenho && (
          <Stack gap={20}>
            <Card
              title="Identificação"
              description="Dados principais e situação atual do desenho."
            >
              <Stack gap={18}>
                <Stack
                  direction="row"
                  gap={8}
                  align="center"
                  wrap
                >
                  <Badge
                    variant={getStatusVariant(
                      desenho.status
                    )}
                  >
                    {
                      approvalStatusConfig[
                        desenho.status
                      ].label
                    }
                  </Badge>

                  <Badge variant="info">
                    {getRepresentationLabel(
                      desenho.tipoRepresentacao
                    )}
                  </Badge>

                  {revisaoAtual && (
                    <Badge variant="info">
                      Revisão atual:{" "}
                      {
                        revisaoAtual.codigoRevisao
                      }
                    </Badge>
                  )}
                </Stack>

                <FormGrid columns={3}>
                  <Field
                    label="Número"
                    htmlFor="numero"
                  >
                    <Input
                      id="numero"
                      value={desenho.numero}
                      readOnly
                    />
                  </Field>

                  <Field
                    label="Cliente"
                    htmlFor="cliente"
                  >
                    <Input
                      id="cliente"
                      value={
                        desenho.cliente ??
                        ""
                      }
                      readOnly
                    />
                  </Field>

                  <Field
                    label="Produto"
                    htmlFor="produto"
                  >
                    <Input
                      id="produto"
                      value={
                        desenho.produto ??
                        ""
                      }
                      readOnly
                    />
                  </Field>

                  <Field
                    label="Modelo"
                    htmlFor="modelo"
                  >
                    <Input
                      id="modelo"
                      value={
                        desenho.modelo ??
                        ""
                      }
                      readOnly
                    />
                  </Field>

                  <Field
                    label="Data de emissão"
                    htmlFor="data-emissao"
                  >
                    <Input
                      id="data-emissao"
                      value={formatDate(
                        desenho.dataEmissao
                      )}
                      readOnly
                    />
                  </Field>

                  <Field
                    label="Previsão de aprovação"
                    htmlFor="previsao-aprovacao"
                  >
                    <Input
                      id="previsao-aprovacao"
                      value={formatDate(
                        desenho.previsaoAprovacao
                      )}
                      readOnly
                    />
                  </Field>
                </FormGrid>
              </Stack>
            </Card>

            <Card
              title="Ações do fluxo"
              description="As ações disponíveis são controladas pelo status atual."
            >
              {(desenho.status ===
                "rascunho" ||
                desenho.status ===
                  "pendente") && (
                <Stack gap={16}>
                  <Alert
                    variant={
                      desenho.status ===
                      "pendente"
                        ? "warning"
                        : "info"
                    }
                    title={
                      desenho.status ===
                      "pendente"
                        ? "Correções pendentes"
                        : "Desenho em elaboração"
                    }
                  >
                    {desenho.status ===
                    "pendente"
                      ? "Atualize os dados solicitados antes de gerar uma nova revisão."
                      : "Revise os dados técnicos antes de gerar a primeira revisão."}
                  </Alert>

                  <Stack
                    direction="row"
                    gap={10}
                    align="center"
                    wrap
                  >
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        executandoAcao ||
                        salvandoEdicao
                      }
                      onClick={abrirEdicao}
                    >
                      <FilePenLine
                        size={17}
                        aria-hidden="true"
                      />

                      Editar dados
                    </Button>

                    <Button
                      type="button"
                      disabled={
                        executandoAcao ||
                        salvandoEdicao
                      }
                      onClick={() =>
                        abrirAcao(
                          "gerar"
                        )
                      }
                    >
                      <Send
                        size={17}
                        aria-hidden="true"
                      />

                      Gerar{" "}
                      {
                        proximoCodigoRevisao
                      }
                    </Button>
                  </Stack>
                </Stack>
              )}

              {desenho.status ===
                "em_aprovacao" && (
                <Stack gap={16}>
                  <Alert
                    variant="info"
                    title="Revisão aguardando decisão"
                  >
                    A revisão{" "}
                    <strong>
                      {revisaoAtual?.codigoRevisao ??
                        "atual"}
                    </strong>{" "}
                    está em aprovação.
                  </Alert>

                  <Stack
                    direction="row"
                    gap={10}
                    align="center"
                    wrap
                  >
                    {revisaoAtual?.possuiSvg && (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            executandoAcao ||
                            gerandoPdfRevisaoId !==
                              null
                          }
                          onClick={() =>
                            abrirSvg(
                              revisaoAtual.id
                            )
                          }
                        >
                          <Eye
                            size={17}
                            aria-hidden="true"
                          />

                          Abrir revisão atual
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          loading={
                            gerandoPdfRevisaoId ===
                            revisaoAtual.id
                          }
                          loadingLabel="Gerando PDF..."
                          disabled={
                            executandoAcao ||
                            (gerandoPdfRevisaoId !==
                              null &&
                              gerandoPdfRevisaoId !==
                                revisaoAtual.id)
                          }
                          onClick={() =>
                            void baixarPdf(
                              revisaoAtual
                            )
                          }
                        >
                          <Download
                            size={17}
                            aria-hidden="true"
                          />

                          Baixar PDF
                        </Button>
                      </>
                    )}

                    <Button
                      type="button"
                      disabled={
                        executandoAcao
                      }
                      onClick={() =>
                        abrirAcao(
                          "aprovar"
                        )
                      }
                    >
                      <CheckCircle2
                        size={17}
                        aria-hidden="true"
                      />

                      Aprovar
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        executandoAcao
                      }
                      onClick={() =>
                        abrirAcao(
                          "solicitar-ajustes"
                        )
                      }
                    >
                      <TriangleAlert
                        size={17}
                        aria-hidden="true"
                      />

                      Solicitar ajustes
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        executandoAcao
                      }
                      onClick={() =>
                        abrirAcao(
                          "reprovar"
                        )
                      }
                    >
                      <XCircle
                        size={17}
                        aria-hidden="true"
                      />

                      Reprovar
                    </Button>
                  </Stack>
                </Stack>
              )}

              {desenho.status ===
                "reprovado" && (
                <Stack gap={16}>
                  <Alert
                    variant="danger"
                    title="Desenho reprovado"
                  >
                    A revisão reprovada
                    permanece preservada.
                    Reabra o desenho para
                    corrigir os dados e
                    gerar uma nova revisão.
                  </Alert>

                  <Stack
                    direction="row"
                    gap={10}
                    align="center"
                    wrap
                  >
                    {revisaoAtual?.possuiSvg && (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            executandoAcao ||
                            gerandoPdfRevisaoId !==
                              null
                          }
                          onClick={() =>
                            abrirSvg(
                              revisaoAtual.id
                            )
                          }
                        >
                          <Eye
                            size={17}
                            aria-hidden="true"
                          />

                          Abrir revisão reprovada
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          loading={
                            gerandoPdfRevisaoId ===
                            revisaoAtual.id
                          }
                          loadingLabel="Gerando PDF..."
                          disabled={
                            executandoAcao ||
                            (gerandoPdfRevisaoId !==
                              null &&
                              gerandoPdfRevisaoId !==
                                revisaoAtual.id)
                          }
                          onClick={() =>
                            void baixarPdf(
                              revisaoAtual
                            )
                          }
                        >
                          <Download
                            size={17}
                            aria-hidden="true"
                          />

                          Baixar PDF
                        </Button>
                      </>
                    )}

                    <Button
                      type="button"
                      disabled={
                        executandoAcao
                      }
                      onClick={() =>
                        abrirAcao(
                          "reabrir-revisao"
                        )
                      }
                    >
                      <RotateCcw
                        size={17}
                        aria-hidden="true"
                      />

                      Reabrir para revisão
                    </Button>
                  </Stack>
                </Stack>
              )}

              {desenho.status ===
                "aprovado" && (
                <Stack gap={16}>
                  <Alert
                    variant="success"
                    title="Desenho aprovado"
                  >
                    A revisão atual foi
                    aprovada. Os dados estão
                    disponíveis somente para
                    consulta.
                  </Alert>

                  {revisaoAtual?.possuiSvg && (
                    <Stack
                      direction="row"
                      gap={10}
                      align="center"
                      wrap
                    >
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          gerandoPdfRevisaoId !==
                          null
                        }
                        onClick={() =>
                          abrirSvg(
                            revisaoAtual.id
                          )
                        }
                      >
                        <Eye
                          size={17}
                          aria-hidden="true"
                        />

                        Abrir desenho aprovado
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        loading={
                          gerandoPdfRevisaoId ===
                          revisaoAtual.id
                        }
                        loadingLabel="Gerando PDF..."
                        disabled={
                          gerandoPdfRevisaoId !==
                            null &&
                          gerandoPdfRevisaoId !==
                            revisaoAtual.id
                        }
                        onClick={() =>
                          void baixarPdf(
                            revisaoAtual
                          )
                        }
                      >
                        <Download
                          size={17}
                          aria-hidden="true"
                        />

                        Baixar PDF
                      </Button>
                    </Stack>
                  )}
                </Stack>
              )}
            </Card>

            <Card
              title="Revisões"
              description="Histórico de versões geradas para este desenho."
              allowOverflow
            >
              {carregandoRevisoes && (
                <Loader
                  centered
                  label="Carregando revisões..."
                />
              )}

              {!carregandoRevisoes &&
                erroRevisoes && (
                  <Stack gap={16}>
                    <Alert
                      variant="danger"
                      title="Erro ao carregar as revisões"
                    >
                      {erroRevisoes}
                    </Alert>

                    <div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void carregarRevisoes()
                        }
                      >
                        <RefreshCw
                          size={16}
                          aria-hidden="true"
                        />

                        Tentar novamente
                      </Button>
                    </div>
                  </Stack>
                )}

              {!carregandoRevisoes &&
                !erroRevisoes &&
                revisoes.length === 0 && (
                  <Alert
                    variant="info"
                    title="Nenhuma revisão gerada"
                  >
                    Este desenho ainda não
                    possui uma revisão.
                  </Alert>
                )}

              {!carregandoRevisoes &&
                !erroRevisoes &&
                revisoes.length > 0 && (
                  <Table minWidth={1450}>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>
                          Revisão
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Status
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Criada em
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Gerada em
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Enviada em
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Decidida em
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Decidida por
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Observação
                        </TableHeaderCell>

                        <TableHeaderCell align="right">
                          Ações
                        </TableHeaderCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {revisoes.map(
                        (revisao) => {
                          const isCurrent =
                            revisao.id ===
                            revisaoAtualId;

                          return (
                            <TableRow
                              key={
                                revisao.id
                              }
                            >
                              <TableCell>
                                <Stack
                                  direction="row"
                                  gap={8}
                                  align="center"
                                  wrap
                                >
                                  <strong>
                                    {
                                      revisao.codigoRevisao
                                    }
                                  </strong>

                                  {isCurrent && (
                                    <Badge variant="info">
                                      Atual
                                    </Badge>
                                  )}
                                </Stack>
                              </TableCell>

                              <TableCell>
                                <Badge
                                  variant={getRevisionStatusVariant(
                                    revisao.statusRevisao
                                  )}
                                >
                                  {getRevisionStatusLabel(
                                    revisao.statusRevisao
                                  )}
                                </Badge>
                              </TableCell>

                              <TableCell>
                                {formatDateTime(
                                  revisao.criadoEm
                                )}
                              </TableCell>

                              <TableCell>
                                {formatDateTime(
                                  revisao.geradoEm
                                )}
                              </TableCell>

                              <TableCell>
                                {formatDateTime(
                                  revisao.enviadoAprovacaoEm
                                )}
                              </TableCell>

                              <TableCell>
                                {formatDateTime(
                                  revisao.decididoEm
                                )}
                              </TableCell>

                              <TableCell>
                                {revisao.decididoPor ??
                                  "—"}
                              </TableCell>

                              <TableCell>
                                {revisao.observacaoDecisao ??
                                  "—"}
                              </TableCell>

                              <TableCell align="right">
                                <Stack
                                  direction="row"
                                  gap={8}
                                  justify="end"
                                  wrap
                                >
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={
                                      !revisao.possuiSvg ||
                                      gerandoPdfRevisaoId !==
                                        null
                                    }
                                    onClick={() =>
                                      abrirSvg(
                                        revisao.id
                                      )
                                    }
                                  >
                                    <Eye
                                      size={16}
                                      aria-hidden="true"
                                    />

                                    Abrir SVG
                                  </Button>

                                  <Button
                                    type="button"
                                    variant="secondary"
                                    loading={
                                      gerandoPdfRevisaoId ===
                                      revisao.id
                                    }
                                    loadingLabel="Gerando PDF..."
                                    disabled={
                                      !revisao.possuiSvg ||
                                      (gerandoPdfRevisaoId !==
                                        null &&
                                        gerandoPdfRevisaoId !==
                                          revisao.id)
                                    }
                                    onClick={() =>
                                      void baixarPdf(
                                        revisao
                                      )
                                    }
                                  >
                                    <Download
                                      size={16}
                                      aria-hidden="true"
                                    />

                                    Baixar PDF
                                  </Button>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        }
                      )}
                    </TableBody>
                  </Table>
                )}
            </Card>

            <Card
              title="Histórico de atividades"
              description="Eventos registrados durante o ciclo de vida do desenho."
              allowOverflow
            >
              {carregandoHistorico && (
                <Loader
                  centered
                  label="Carregando histórico..."
                />
              )}

              {!carregandoHistorico &&
                erroHistorico && (
                  <Stack gap={16}>
                    <Alert
                      variant="danger"
                      title="Erro ao carregar o histórico"
                    >
                      {erroHistorico}
                    </Alert>

                    <div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void carregarHistorico()
                        }
                      >
                        <RefreshCw
                          size={16}
                          aria-hidden="true"
                        />

                        Tentar novamente
                      </Button>
                    </div>
                  </Stack>
                )}

              {!carregandoHistorico &&
                !erroHistorico &&
                historico.length === 0 && (
                  <Alert
                    variant="info"
                    title="Nenhuma atividade registrada"
                  >
                    Este desenho ainda não
                    possui eventos no
                    histórico.
                  </Alert>
                )}

              {!carregandoHistorico &&
                !erroHistorico &&
                historico.length > 0 && (
                  <Table minWidth={1200}>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>
                          Data
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Ação
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Revisão
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Alteração de status
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Usuário
                        </TableHeaderCell>

                        <TableHeaderCell>
                          Observação
                        </TableHeaderCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {historico.map(
                        (registro) => {
                          const codigoRevisao =
                            getHistoryRevisionCode(
                              registro.dados
                            );

                          return (
                            <TableRow
                              key={
                                registro.id
                              }
                            >
                              <TableCell>
                                {formatDateTime(
                                  registro.criadoEm
                                )}
                              </TableCell>

                              <TableCell>
                                <Badge
                                  variant={getHistoryActionVariant(
                                    registro.acao
                                  )}
                                >
                                  {getHistoryActionLabel(
                                    registro.acao
                                  )}
                                </Badge>
                              </TableCell>

                              <TableCell>
                                {codigoRevisao ? (
                                  <Badge variant="info">
                                    {
                                      codigoRevisao
                                    }
                                  </Badge>
                                ) : (
                                  "—"
                                )}
                              </TableCell>

                              <TableCell>
                                {registro.statusAnterior ||
                                registro.statusNovo ? (
                                  <Stack
                                    direction="row"
                                    gap={8}
                                    align="center"
                                    wrap
                                  >
                                    {registro.statusAnterior ? (
                                      <Badge
                                        variant={getStatusVariant(
                                          registro.statusAnterior
                                        )}
                                      >
                                        {
                                          approvalStatusConfig[
                                            registro
                                              .statusAnterior
                                          ].label
                                        }
                                      </Badge>
                                    ) : (
                                      <span>Início</span>
                                    )}

                                    <span
                                      aria-hidden="true"
                                    >
                                      →
                                    </span>

                                    {registro.statusNovo ? (
                                      <Badge
                                        variant={getStatusVariant(
                                          registro.statusNovo
                                        )}
                                      >
                                        {
                                          approvalStatusConfig[
                                            registro
                                              .statusNovo
                                          ].label
                                        }
                                      </Badge>
                                    ) : (
                                      <span>—</span>
                                    )}
                                  </Stack>
                                ) : (
                                  "Sem alteração"
                                )}
                              </TableCell>

                              <TableCell>
                                {registro.usuario ??
                                  "—"}
                              </TableCell>

                              <TableCell>
                                {registro.observacao ??
                                  "—"}
                              </TableCell>
                            </TableRow>
                          );
                        }
                      )}
                    </TableBody>
                  </Table>
                )}
            </Card>

            <Card
              title="Veículo"
              description="Informações do caminhão utilizado no desenho."
            >
              <FormGrid columns={2}>
                <Field
                  label="Caminhão"
                  htmlFor="caminhao"
                >
                  <Input
                    id="caminhao"
                    value={
                      desenho.caminhao ??
                      ""
                    }
                    readOnly
                  />
                </Field>

                <Field
                  label="Cabine"
                  htmlFor="cabine"
                >
                  <Input
                    id="cabine"
                    value={
                      desenho.cabine ??
                      ""
                    }
                    readOnly
                  />
                </Field>
              </FormGrid>
            </Card>

            <Card
              title="Dimensões e capacidade"
              description="Parâmetros técnicos utilizados na geração do desenho."
            >
              <FormGrid columns={4}>
                <Field
                  label="Comprimento"
                  htmlFor="comprimento"
                >
                  <Input
                    id="comprimento"
                    value={formatNumber(
                      desenho.comprimento,
                      "mm"
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Altura"
                  htmlFor="altura"
                >
                  <Input
                    id="altura"
                    value={formatNumber(
                      desenho.altura,
                      "mm"
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Capacidade"
                  htmlFor="capacidade"
                >
                  <Input
                    id="capacidade"
                    value={formatNumber(
                      desenho.capacidadeTon,
                      "t"
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Volume"
                  htmlFor="volume"
                >
                  <Input
                    id="volume"
                    value={formatNumber(
                      desenho.volumeM3,
                      "m³"
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Compartimentos"
                  htmlFor="compartimentos"
                >
                  <Input
                    id="compartimentos"
                    value={formatNumber(
                      desenho.compartimentos
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Peso"
                  htmlFor="peso"
                >
                  <Input
                    id="peso"
                    value={formatNumber(
                      desenho.peso,
                      "kg"
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Carga dianteira"
                  htmlFor="carga-dianteira"
                >
                  <Input
                    id="carga-dianteira"
                    value={formatNumber(
                      desenho.cargaDianteira,
                      "%"
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Carga traseira"
                  htmlFor="carga-traseira"
                >
                  <Input
                    id="carga-traseira"
                    value={formatNumber(
                      desenho.cargaTraseira,
                      "%"
                    )}
                    readOnly
                  />
                </Field>
              </FormGrid>
            </Card>

            <Card
              title="Configurações"
              description="Opções aplicadas durante a geração."
            >
              <FormGrid columns={3}>
                <Field
                  label="Incluir cotas"
                  htmlFor="incluir-cotas"
                >
                  <Input
                    id="incluir-cotas"
                    value={getBooleanLabel(
                      desenho.incluirCotas
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Cálculo automático"
                  htmlFor="calculo-automatico"
                >
                  <Input
                    id="calculo-automatico"
                    value={getBooleanLabel(
                      desenho.calculoAutomatico
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Incluir caminhão"
                  htmlFor="incluir-caminhao"
                >
                  <Input
                    id="incluir-caminhao"
                    value={getBooleanLabel(
                      desenho.incluirCaminhao
                    )}
                    readOnly
                  />
                </Field>
              </FormGrid>
            </Card>

            <Card
              title="Observações"
              description="Informações complementares do desenho."
            >
              <Field
                label="Observações gerais"
                htmlFor="observacoes"
              >
                <Textarea
                  id="observacoes"
                  value={
                    desenho.observacoes ??
                    ""
                  }
                  rows={5}
                  readOnly
                />
              </Field>
            </Card>

            <Card
              title="Auditoria"
              description="Informações de criação e última atualização."
            >
              <FormGrid columns={4}>
                <Field
                  label="Criado em"
                  htmlFor="criado-em"
                >
                  <Input
                    id="criado-em"
                    value={formatDateTime(
                      desenho.criadoEm
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Criado por"
                  htmlFor="criado-por"
                >
                  <Input
                    id="criado-por"
                    value={
                      desenho.criadoPor ??
                      "—"
                    }
                    readOnly
                  />
                </Field>

                <Field
                  label="Atualizado em"
                  htmlFor="atualizado-em"
                >
                  <Input
                    id="atualizado-em"
                    value={formatDateTime(
                      desenho.atualizadoEm
                    )}
                    readOnly
                  />
                </Field>

                <Field
                  label="Atualizado por"
                  htmlFor="atualizado-por"
                >
                  <Input
                    id="atualizado-por"
                    value={
                      desenho.atualizadoPor ??
                      "—"
                    }
                    readOnly
                  />
                </Field>
              </FormGrid>
            </Card>
          </Stack>
        )}

      <Modal
        open={modalEdicaoAberto}
        title="Editar dados do desenho"
        description="As alterações serão utilizadas na próxima revisão gerada."
        onClose={fecharEdicao}
        footer={
          <Stack
            direction="row"
            gap={10}
            justify="end"
            wrap
          >
            <Button
              type="button"
              variant="secondary"
              disabled={salvandoEdicao}
              onClick={fecharEdicao}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              form="form-editar-desenho"
              loading={salvandoEdicao}
              loadingLabel="Salvando..."
            >
              <Save
                size={17}
                aria-hidden="true"
              />

              Salvar alterações
            </Button>
          </Stack>
        }
      >
        {desenho && (
          <form
            id="form-editar-desenho"
            key={`${desenho.id}-${desenho.atualizadoEm}`}
            onSubmit={salvarEdicao}
          >
            <Stack gap={22}>
              <Alert
                variant="info"
                title="Edição do cadastro"
              >
                O histórico e as revisões
                anteriores não serão
                alterados. Uma nova revisão
                só será criada quando você
                executar a ação de geração.
              </Alert>

              <Card
                title="Identificação"
                description="Dados principais do desenho."
                allowOverflow
              >
                <FormGrid columns={3}>
                  <Field
                    label="Cliente"
                    htmlFor="editar-cliente"
                    required
                  >
                    <Input
                      id="editar-cliente"
                      name="cliente"
                      defaultValue={
                        desenho.cliente ??
                        ""
                      }
                      maxLength={200}
                      required
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Produto"
                    htmlFor="editar-produto"
                    required
                  >
                    <Input
                      id="editar-produto"
                      name="produto"
                      defaultValue={
                        desenho.produto ??
                        ""
                      }
                      maxLength={200}
                      required
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Modelo"
                    htmlFor="editar-modelo"
                  >
                    <Input
                      id="editar-modelo"
                      name="modelo"
                      defaultValue={
                        desenho.modelo ??
                        ""
                      }
                      maxLength={100}
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Representação"
                    htmlFor="editar-representacao"
                  >
                    <Autocomplete
                      id="editar-representacao"
                      name="tipoRepresentacao"
                      options={
                        representationOptions
                      }
                      selectedOption={
                        representacaoSelecionada
                      }
                      onSelect={
                        setRepresentacaoSelecionada
                      }
                      placeholder="Selecione a representação"
                    />
                  </Field>

                  <Field
                    label="Data de emissão"
                    htmlFor="editar-data-emissao"
                    required
                  >
                    <DateInput
                      id="editar-data-emissao"
                      name="dataEmissao"
                      defaultValue={
                        desenho.dataEmissao ??
                        ""
                      }
                      required
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Previsão de aprovação"
                    htmlFor="editar-previsao-aprovacao"
                  >
                    <DateInput
                      id="editar-previsao-aprovacao"
                      name="previsaoAprovacao"
                      defaultValue={
                        desenho.previsaoAprovacao ??
                        ""
                      }
                      min={
                        desenho.dataEmissao ??
                        undefined
                      }
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>
                </FormGrid>
              </Card>

              <Card
                title="Veículo"
                description="Informações do caminhão."
              >
                <FormGrid columns={2}>
                  <Field
                    label="Caminhão"
                    htmlFor="editar-caminhao"
                  >
                    <Input
                      id="editar-caminhao"
                      name="caminhao"
                      defaultValue={
                        desenho.caminhao ??
                        ""
                      }
                      maxLength={150}
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Cabine"
                    htmlFor="editar-cabine"
                  >
                    <Input
                      id="editar-cabine"
                      name="cabine"
                      defaultValue={
                        desenho.cabine ??
                        ""
                      }
                      maxLength={100}
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>
                </FormGrid>
              </Card>

              <Card
                title="Dimensões e capacidade"
                description="Parâmetros técnicos utilizados pelo gerador."
              >
                <FormGrid columns={4}>
                  <Field
                    label="Comprimento"
                    htmlFor="editar-comprimento"
                  >
                    <NumberInput
                      id="editar-comprimento"
                      name="comprimento"
                      defaultValue={
                        desenho.comprimento ??
                        undefined
                      }
                      min={0}
                      step={1}
                      suffix="mm"
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Altura"
                    htmlFor="editar-altura"
                  >
                    <NumberInput
                      id="editar-altura"
                      name="altura"
                      defaultValue={
                        desenho.altura ??
                        undefined
                      }
                      min={0}
                      step={1}
                      suffix="mm"
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Capacidade"
                    htmlFor="editar-capacidade"
                  >
                    <NumberInput
                      id="editar-capacidade"
                      name="capacidadeTon"
                      defaultValue={
                        desenho.capacidadeTon ??
                        undefined
                      }
                      min={0}
                      step={0.01}
                      suffix="t"
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Volume"
                    htmlFor="editar-volume"
                  >
                    <NumberInput
                      id="editar-volume"
                      name="volumeM3"
                      defaultValue={
                        desenho.volumeM3 ??
                        undefined
                      }
                      min={0}
                      step={0.01}
                      suffix="m³"
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Compartimentos"
                    htmlFor="editar-compartimentos"
                  >
                    <NumberInput
                      id="editar-compartimentos"
                      name="compartimentos"
                      defaultValue={
                        desenho.compartimentos ??
                        undefined
                      }
                      min={0}
                      step={1}
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Peso"
                    htmlFor="editar-peso"
                  >
                    <NumberInput
                      id="editar-peso"
                      name="peso"
                      defaultValue={
                        desenho.peso ??
                        undefined
                      }
                      min={0}
                      step={0.01}
                      suffix="kg"
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Carga dianteira"
                    htmlFor="editar-carga-dianteira"
                  >
                    <NumberInput
                      id="editar-carga-dianteira"
                      name="cargaDianteira"
                      defaultValue={
                        desenho.cargaDianteira ??
                        undefined
                      }
                      min={0}
                      max={100}
                      step={0.01}
                      suffix="%"
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>

                  <Field
                    label="Carga traseira"
                    htmlFor="editar-carga-traseira"
                  >
                    <NumberInput
                      id="editar-carga-traseira"
                      name="cargaTraseira"
                      defaultValue={
                        desenho.cargaTraseira ??
                        undefined
                      }
                      min={0}
                      max={100}
                      step={0.01}
                      suffix="%"
                      disabled={
                        salvandoEdicao
                      }
                    />
                  </Field>
                </FormGrid>
              </Card>

              <Card
                title="Configurações"
                description="Opções utilizadas na geração do desenho."
              >
                <Stack gap={16}>
                  <Checkbox
                    id="editar-incluir-cotas"
                    name="incluirCotas"
                    label="Incluir cotas no desenho"
                    hint="As principais dimensões serão exibidas no documento."
                    defaultChecked={
                      desenho.incluirCotas
                    }
                    disabled={
                      salvandoEdicao
                    }
                  />

                  <Switch
                    id="editar-calculo-automatico"
                    name="calculoAutomatico"
                    label="Cálculo automático das dimensões"
                    hint="Atualiza os cálculos conforme os valores informados."
                    defaultChecked={
                      desenho.calculoAutomatico
                    }
                    disabled={
                      salvandoEdicao
                    }
                  />

                  <Switch
                    id="editar-incluir-caminhao"
                    name="incluirCaminhao"
                    label="Incluir caminhão no desenho"
                    hint="Exibe o caminhão no documento de aprovação."
                    defaultChecked={
                      desenho.incluirCaminhao
                    }
                    disabled={
                      salvandoEdicao
                    }
                  />
                </Stack>
              </Card>

              <Card
                title="Observações"
                description="Requisitos e informações complementares."
              >
                <Field
                  label="Observações gerais"
                  htmlFor="editar-observacoes"
                >
                  <Textarea
                    id="editar-observacoes"
                    name="observacoes"
                    defaultValue={
                      desenho.observacoes ??
                      ""
                    }
                    rows={6}
                    maxLength={100000}
                    disabled={
                      salvandoEdicao
                    }
                  />
                </Field>
              </Card>
            </Stack>
          </form>
        )}
      </Modal>

      <Modal
        open={acaoAtual !== null}
        title={
          actionConfig?.title ??
          "Confirmar ação"
        }
        description={
          actionConfig?.description
        }
        onClose={fecharAcao}
        footer={
          <Stack
            direction="row"
            gap={10}
            justify="end"
            wrap
          >
            <Button
              type="button"
              variant="secondary"
              disabled={executandoAcao}
              onClick={fecharAcao}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              loading={executandoAcao}
              loadingLabel={
                actionConfig?.loadingLabel ??
                "Processando..."
              }
              onClick={() =>
                void executarAcao()
              }
            >
              {acaoAtual && (
                <FlowActionIcon
                  action={acaoAtual}
                />
              )}

              {actionConfig?.confirmLabel ??
                "Confirmar"}
            </Button>
          </Stack>
        }
      >
        {acaoAtual === "gerar" ? (
          <Stack gap={16}>
            <Alert
              variant="info"
              title={`Nova revisão ${proximoCodigoRevisao}`}
            >
              Os dados atuais do cadastro
              serão copiados para uma nova
              revisão imutável. Depois da
              geração, o desenho ficará em
              aprovação.
            </Alert>

            {revisaoAtual && (
              <Alert
                variant="warning"
                title="Revisão anterior preservada"
              >
                A revisão{" "}
                <strong>
                  {
                    revisaoAtual.codigoRevisao
                  }
                </strong>{" "}
                continuará armazenada com o
                status{" "}
                <strong>
                  {getRevisionStatusLabel(
                    revisaoAtual.statusRevisao
                  )}
                </strong>
                .
              </Alert>
            )}
          </Stack>
        ) : (
          <Field
            label={
              actionConfig?.observationLabel ??
              "Observação"
            }
            htmlFor="observacao-acao"
            required={
              actionConfig?.observationRequired
            }
            hint={
              actionConfig?.observationHint
            }
          >
            <Textarea
              id="observacao-acao"
              value={observacaoAcao}
              rows={6}
              maxLength={100000}
              placeholder={
                actionConfig?.observationPlaceholder
              }
              required={
                actionConfig?.observationRequired
              }
              disabled={executandoAcao}
              onChange={(event) =>
                setObservacaoAcao(
                  event.target.value
                )
              }
            />
          </Field>
        )}
      </Modal>

      <Toast
        open={toast.open}
        variant={toast.variant}
        title={toast.title}
        description={toast.description}
        onClose={() =>
          setToast(
            (currentToast) => ({
              ...currentToast,
              open: false,
            })
          )
        }
      />
    </PageContainer>
  );
}