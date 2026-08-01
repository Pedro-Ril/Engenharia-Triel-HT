"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Home,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import {
  Autocomplete,
  type AutocompleteOption,
} from "@/components/ui/Autocomplete";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";

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

interface ApprovalProject {
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
  tipoRepresentacao: ApprovalRepresentation;

  dataEmissao: string | null;
  previsaoAprovacao: string | null;

  incluirCotas: boolean;
  calculoAutomatico: boolean;
  incluirCaminhao: boolean;

  criadoEm: string;
  atualizadoEm: string;
}

interface ApprovalProjectsResponse {
  ok: boolean;
  data?: ApprovalProject[];
  total?: number;
  message?: string;
}

interface DeleteApprovalResponse {
  ok: boolean;
  message?: string;
}

interface ToastState {
  open: boolean;
  variant: "success" | "danger";
  title: string;
  description: string;
}

const ITENS_POR_PAGINA = 10;

const statusValues: ApprovalStatus[] = [
  "rascunho",
  "em_aprovacao",
  "pendente",
  "aprovado",
  "reprovado",
];

const statusOptions: AutocompleteOption[] =
  statusValues.map((status) => ({
    value: status,
    label:
      approvalStatusConfig[status].label,
  }));

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function podeExcluirDesenho(
  status: ApprovalStatus
) {
  return (
    status === "rascunho" ||
    status === "pendente"
  );
}

function getDeleteTooltip(
  desenho: ApprovalProject
) {
  if (
    podeExcluirDesenho(
      desenho.status
    )
  ) {
    return "Excluir desenho";
  }

  return `Não é possível excluir um desenho com status ${
    approvalStatusConfig[
      desenho.status
    ].label
  }.`;
}

export default function DesenhoAprovacaoPage() {
  const router = useRouter();

  const [projetos, setProjetos] =
    useState<ApprovalProject[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState<string | null>(null);

  const [busca, setBusca] =
    useState("");

  const [
    statusSelecionado,
    setStatusSelecionado,
  ] = useState<AutocompleteOption | null>(
    null
  );

  const [
    produtoSelecionado,
    setProdutoSelecionado,
  ] = useState<AutocompleteOption | null>(
    null
  );

  const [
    paginaAtual,
    setPaginaAtual,
  ] = useState(1);

  const [
    desenhoParaExcluir,
    setDesenhoParaExcluir,
  ] = useState<ApprovalProject | null>(
    null
  );

  const [excluindo, setExcluindo] =
    useState(false);

  const [toast, setToast] =
    useState<ToastState>({
      open: false,
      variant: "success",
      title: "",
      description: "",
    });

  const carregarProjetos =
    useCallback(
      async (
        signal?: AbortSignal
      ) => {
        setCarregando(true);
        setErro(null);

        try {
          const response = await fetch(
            "/api/desenho-aprovacao",
            {
              method: "GET",
              cache: "no-store",
              signal,
            }
          );

          const payload =
            (await response.json()) as
              ApprovalProjectsResponse;

          if (
            !response.ok ||
            !payload.ok ||
            !Array.isArray(
              payload.data
            )
          ) {
            throw new Error(
              payload.message ??
                "Não foi possível carregar os desenhos."
            );
          }

          setProjetos(payload.data);
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }

          console.error(
            "Erro ao carregar desenhos:",
            error
          );

          setErro(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os desenhos."
          );
        } finally {
          if (!signal?.aborted) {
            setCarregando(false);
          }
        }
      },
      []
    );

  useEffect(() => {
    const controller =
      new AbortController();

    void carregarProjetos(
      controller.signal
    );

    return () => {
      controller.abort();
    };
  }, [carregarProjetos]);

  const totalDesenhos =
    projetos.length;

  const totalRascunhos =
    projetos.filter(
      (desenho) =>
        desenho.status ===
        "rascunho"
    ).length;

  const totalPendentes =
    projetos.filter(
      (desenho) =>
        desenho.status ===
        "pendente"
    ).length;

  const totalAprovados =
    projetos.filter(
      (desenho) =>
        desenho.status ===
        "aprovado"
    ).length;

  const produtosDisponiveis =
    useMemo<AutocompleteOption[]>(
      () => {
        const produtos = projetos
          .map((desenho) =>
            desenho.produto?.trim()
          )
          .filter(
            (
              produto
            ): produto is string =>
              Boolean(produto)
          );

        return Array.from(
          new Set(produtos)
        )
          .sort(
            (
              produtoA,
              produtoB
            ) =>
              produtoA.localeCompare(
                produtoB,
                "pt-BR"
              )
          )
          .map((produto) => ({
            value: produto,
            label: produto,
          }));
      },
      [projetos]
    );

  const projetosFiltrados =
    useMemo(() => {
      const termoBusca =
        normalizeSearch(busca);

      return projetos.filter(
        (desenho) => {
          const correspondeStatus =
            !statusSelecionado ||
            desenho.status ===
              statusSelecionado.value;

          const correspondeProduto =
            !produtoSelecionado ||
            desenho.produto ===
              produtoSelecionado.value;

          const conteudoPesquisavel =
            normalizeSearch(
              [
                desenho.numero,
                desenho.cliente,
                desenho.produto,
                desenho.modelo,
                desenho.caminhao,
                desenho.cabine,
              ]
                .filter(Boolean)
                .join(" ")
            );

          const correspondeBusca =
            termoBusca.length === 0 ||
            conteudoPesquisavel.includes(
              termoBusca
            );

          return (
            correspondeStatus &&
            correspondeProduto &&
            correspondeBusca
          );
        }
      );
    }, [
      busca,
      produtoSelecionado,
      projetos,
      statusSelecionado,
    ]);

  const totalPaginas = Math.max(
    1,
    Math.ceil(
      projetosFiltrados.length /
        ITENS_POR_PAGINA
    )
  );

  const projetosPaginados =
    useMemo(() => {
      const inicio =
        (paginaAtual - 1) *
        ITENS_POR_PAGINA;

      return projetosFiltrados.slice(
        inicio,
        inicio + ITENS_POR_PAGINA
      );
    }, [
      paginaAtual,
      projetosFiltrados,
    ]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [
    busca,
    produtoSelecionado,
    statusSelecionado,
  ]);

  useEffect(() => {
    setPaginaAtual((pagina) =>
      Math.min(
        pagina,
        totalPaginas
      )
    );
  }, [totalPaginas]);

  const possuiFiltrosAtivos =
    busca.trim().length > 0 ||
    statusSelecionado !== null ||
    produtoSelecionado !== null;

  function limparFiltros() {
    setBusca("");
    setStatusSelecionado(null);
    setProdutoSelecionado(null);
  }

  function solicitarExclusao(
    desenho: ApprovalProject
  ) {
    if (
      !podeExcluirDesenho(
        desenho.status
      )
    ) {
      setToast({
        open: true,
        variant: "danger",
        title:
          "Exclusão não permitida",

        description:
          `O desenho ${desenho.numero} está com o status "${
            approvalStatusConfig[
              desenho.status
            ].label
          }" e não pode ser excluído.`,
      });

      return;
    }

    setDesenhoParaExcluir(
      desenho
    );
  }

  async function excluirDesenho() {
    if (!desenhoParaExcluir) {
      return;
    }

    if (
      !podeExcluirDesenho(
        desenhoParaExcluir.status
      )
    ) {
      setDesenhoParaExcluir(null);

      setToast({
        open: true,
        variant: "danger",
        title:
          "Exclusão não permitida",

        description:
          "Este desenho não pode mais ser excluído.",
      });

      return;
    }

    setExcluindo(true);

    try {
      const response = await fetch(
        `/api/desenho-aprovacao/${encodeURIComponent(
          desenhoParaExcluir.id
        )}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            usuario: "portal-web",
          }),
        }
      );

      const payload =
        (await response.json()) as
          DeleteApprovalResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message ??
            "Não foi possível excluir o desenho."
        );
      }

      const desenhoExcluido =
        desenhoParaExcluir;

      setProjetos(
        (projetosAtuais) =>
          projetosAtuais.filter(
            (desenho) =>
              desenho.id !==
              desenhoExcluido.id
          )
      );

      setDesenhoParaExcluir(null);

      setToast({
        open: true,
        variant: "success",
        title:
          "Desenho excluído",

        description:
          payload.message ??
          `O desenho ${desenhoExcluido.numero} foi excluído com sucesso.`,
      });
    } catch (error) {
      console.error(
        "Erro ao excluir desenho:",
        error
      );

      setToast({
        open: true,
        variant: "danger",
        title:
          "Erro ao excluir",

        description:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir o desenho.",
      });
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Desenhos de Aprovação"
        description="Consulte, crie e gerencie os desenhos de aprovação."
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
              loading={carregando}
              loadingLabel="Atualizando..."
              onClick={() =>
                void carregarProjetos()
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
              onClick={() =>
                router.push(
                  "/desenho-aprovacao/novo"
                )
              }
            >
              <Plus
                size={17}
                aria-hidden="true"
              />

              Novo desenho
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
            label: "Engenharia",
          },
          {
            label:
              "Desenhos de Aprovação",
            current: true,
          },
        ]}
      />

      <FormGrid columns={4}>
        <StatCard
          label="Total de desenhos"
          value={totalDesenhos}
          description="Todos os desenhos ativos cadastrados."
          icon={<FileText />}
        />

        <StatCard
          label="Em elaboração"
          value={totalRascunhos}
          description="Desenhos salvos como rascunho."
          icon={<Clock3 />}
          variant="info"
        />

        <StatCard
          label="Pendentes"
          value={totalPendentes}
          description="Aguardando informações ou correções."
          icon={<TriangleAlert />}
          variant="warning"
        />

        <StatCard
          label="Aprovados"
          value={totalAprovados}
          description="Desenhos finalizados e aprovados."
          icon={<CheckCircle2 />}
          variant="success"
        />
      </FormGrid>

      <Card
        title="Filtros"
        description="Localize desenhos por número, cliente, produto ou status."
        allowOverflow
      >
        <Stack gap={16}>
          <FormGrid columns={3}>
            <Field
              label="Pesquisar"
              htmlFor="pesquisa-desenho"
              hint="Número, cliente, produto, modelo ou caminhão."
            >
              <Input
                id="pesquisa-desenho"
                name="pesquisa"
                value={busca}
                placeholder="Digite para pesquisar"
                autoComplete="off"
                onChange={(event) =>
                  setBusca(
                    event.target.value
                  )
                }
              />
            </Field>

            <Field
              label="Status"
              htmlFor="status-desenho"
              hint="Selecione um status para filtrar."
            >
              <Autocomplete
                id="status-desenho"
                name="status"
                options={statusOptions}
                selectedOption={
                  statusSelecionado
                }
                onSelect={
                  setStatusSelecionado
                }
                placeholder="Todos os status"
              />
            </Field>

            <Field
              label="Produto"
              htmlFor="produto-desenho"
              hint="Selecione um produto para filtrar."
            >
              <Autocomplete
                id="produto-desenho"
                name="produto"
                options={
                  produtosDisponiveis
                }
                selectedOption={
                  produtoSelecionado
                }
                onSelect={
                  setProdutoSelecionado
                }
                placeholder="Todos os produtos"
              />
            </Field>
          </FormGrid>

          <Stack
            direction="row"
            gap={10}
            align="center"
            wrap
          >
            <Badge variant="info">
              {
                projetosFiltrados.length
              }{" "}
              {projetosFiltrados.length ===
              1
                ? "resultado"
                : "resultados"}
            </Badge>

            <Button
              type="button"
              variant="secondary"
              disabled={
                !possuiFiltrosAtivos
              }
              onClick={limparFiltros}
            >
              <RotateCcw
                size={16}
                aria-hidden="true"
              />

              Limpar filtros
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card
        title="Desenhos cadastrados"
        description="Registros ativos carregados diretamente do banco de dados."
        allowOverflow
      >
        {carregando && (
          <Loader
            centered
            label="Carregando desenhos..."
          />
        )}

        {!carregando && erro && (
          <Stack gap={16}>
            <Alert
              variant="danger"
              title="Erro ao carregar os desenhos"
            >
              {erro}
            </Alert>

            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void carregarProjetos()
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

        {!carregando &&
          !erro &&
          projetosFiltrados.length ===
            0 && (
            <EmptyState
              title="Nenhum desenho encontrado"
              description={
                possuiFiltrosAtivos
                  ? "Nenhum registro corresponde aos filtros informados."
                  : "Ainda não existem desenhos de aprovação cadastrados."
              }
            />
          )}

        {!carregando &&
          !erro &&
          projetosPaginados.length >
            0 && (
            <Stack gap={18}>
              <Table minWidth={1000}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>
                      Número
                    </TableHeaderCell>

                    <TableHeaderCell>
                      Cliente
                    </TableHeaderCell>

                    <TableHeaderCell>
                      Produto
                    </TableHeaderCell>

                    <TableHeaderCell>
                      Modelo
                    </TableHeaderCell>

                    <TableHeaderCell>
                      Status
                    </TableHeaderCell>

                    <TableHeaderCell>
                      Emissão
                    </TableHeaderCell>

                    <TableHeaderCell align="right">
                      Ações
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {projetosPaginados.map(
                    (desenho) => {
                      const podeExcluir =
                        podeExcluirDesenho(
                          desenho.status
                        );

                      return (
                        <TableRow
                          key={desenho.id}
                        >
                          <TableCell>
                            <strong>
                              {
                                desenho.numero
                              }
                            </strong>
                          </TableCell>

                          <TableCell>
                            {desenho.cliente ??
                              "—"}
                          </TableCell>

                          <TableCell>
                            {desenho.produto ??
                              "—"}
                          </TableCell>

                          <TableCell>
                            {desenho.modelo ??
                              "—"}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant={getStatusVariant(
                                desenho.status
                              )}
                            >
                              {
                                approvalStatusConfig[
                                  desenho
                                    .status
                                ].label
                              }
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {formatDate(
                              desenho.dataEmissao
                            )}
                          </TableCell>

                          <TableCell align="right">
                            <Stack
                              direction="row"
                              gap={6}
                              justify="end"
                            >
                              <Tooltip content="Abrir página de detalhes">
                                <IconButton
                                  icon={
                                    <Eye />
                                  }
                                  label={`Abrir ${desenho.numero}`}
                                  onClick={() =>
                                    router.push(
                                      `/desenho-aprovacao/${encodeURIComponent(
                                        desenho.id
                                      )}`
                                    )
                                  }
                                />
                              </Tooltip>

                              <Tooltip
                                content={getDeleteTooltip(
                                  desenho
                                )}
                              >
                                <IconButton
                                  icon={
                                    <Trash2 />
                                  }
                                  label={
                                    podeExcluir
                                      ? `Excluir ${desenho.numero}`
                                      : `Exclusão bloqueada para ${desenho.numero}`
                                  }
                                  variant="danger"
                                  disabled={
                                    !podeExcluir ||
                                    excluindo
                                  }
                                  onClick={() =>
                                    solicitarExclusao(
                                      desenho
                                    )
                                  }
                                />
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    }
                  )}
                </TableBody>
              </Table>

              {totalPaginas > 1 && (
                <Pagination
                  page={paginaAtual}
                  totalPages={
                    totalPaginas
                  }
                  onPageChange={
                    setPaginaAtual
                  }
                />
              )}
            </Stack>
          )}
      </Card>

      <ConfirmDialog
        open={
          desenhoParaExcluir !== null
        }
        variant="danger"
        title="Excluir desenho"
        description="O registro será removido da listagem, mas continuará preservado no banco."
        message={
          <>
            Tem certeza de que deseja
            excluir o desenho{" "}
            <strong>
              {
                desenhoParaExcluir?.numero
              }
            </strong>
            ?
          </>
        }
        confirmLabel={
          excluindo
            ? "Excluindo..."
            : "Excluir desenho"
        }
        cancelLabel="Cancelar"
        onClose={() => {
          if (!excluindo) {
            setDesenhoParaExcluir(
              null
            );
          }
        }}
        onConfirm={() =>
          void excluirDesenho()
        }
      />

      <Toast
        open={toast.open}
        variant={toast.variant}
        title={toast.title}
        description={
          toast.description
        }
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