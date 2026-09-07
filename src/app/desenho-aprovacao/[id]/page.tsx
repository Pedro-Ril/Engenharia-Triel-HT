"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ArrowLeft,
  Home,
  RefreshCw,
} from "lucide-react";
import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  type AutocompleteOption,
} from "@/components/ui/Autocomplete";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";

import {
  approvalStatusConfig,
} from "@/modules/desenho-aprovacao/constants/approval-status";

import { AcoesFluxoCard } from "@/modules/desenho-aprovacao/components/AcoesFluxoCard";
import { FormularioEdicaoDesenho } from "@/modules/desenho-aprovacao/components/FormularioEdicaoDesenho";
import { HistoricoAtividadesCard } from "@/modules/desenho-aprovacao/components/HistoricoAtividadesCard";
import { RevisoesCard } from "@/modules/desenho-aprovacao/components/RevisoesCard";
import type {
  ApprovalHistoryItem,
  ApprovalRepresentation,
  ApprovalRevision,
  ApprovalStatus,
} from "@/modules/desenho-aprovacao/types/approval";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  getBooleanLabel,
  getRepresentationLabel,
  getStatusVariant,
} from "@/modules/desenho-aprovacao/utils/formatters";
import { createPdfFromSvg, getRevisionSvgUrl } from "@/modules/desenho-aprovacao/utils/pdf-export";


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

  camposExtra: string | null;
}

interface ApprovalDrawingResponse {
  ok: boolean;
  data?: ApprovalDrawing;
  message?: string;
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

interface ToastState {
  open: boolean;
  variant: "success" | "danger";
  title: string;
  description: string;
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

            <AcoesFluxoCard
              desenhoId={desenho.id}
              status={desenho.status}
              revisaoAtual={revisaoAtual}
              proximoCodigoRevisao={proximoCodigoRevisao}
              salvandoEdicao={salvandoEdicao}
              gerandoPdfRevisaoId={gerandoPdfRevisaoId}
              onAbrirEdicao={abrirEdicao}
              onAbrirSvg={abrirSvg}
              onBaixarPdf={(revisao) => void baixarPdf(revisao)}
              onAcaoExecutada={atualizarPagina}
              onToast={(variant, title, description) => setToast({ open: true, variant, title, description })}
            />

            <RevisoesCard
              revisoes={revisoes}
              revisaoAtualId={revisaoAtualId}
              carregando={carregandoRevisoes}
              erro={erroRevisoes}
              gerandoPdfRevisaoId={gerandoPdfRevisaoId}
              onTentarNovamente={() => void carregarRevisoes()}
              onAbrirSvg={abrirSvg}
              onBaixarPdf={(revisao) => void baixarPdf(revisao)}
            />

            <HistoricoAtividadesCard
              historico={historico}
              carregando={carregandoHistorico}
              erro={erroHistorico}
              onTentarNovamente={() => void carregarHistorico()}
            />

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

      {desenho && (
        <FormularioEdicaoDesenho
          desenho={desenho}
          aberto={modalEdicaoAberto}
          salvando={salvandoEdicao}
          onSalvandoChange={setSalvandoEdicao}
          representacaoSelecionada={representacaoSelecionada}
          onRepresentacaoChange={setRepresentacaoSelecionada}
          onClose={() => setModalEdicaoAberto(false)}
          onSalvo={atualizarPagina}
          onToast={(variant, title, description) => setToast({ open: true, variant, title, description })}
        />
      )}

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