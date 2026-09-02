"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Headset, Home, LayoutGrid, List, PieChart as PieChartIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TOOLTIP_GRAFICO_TEMA } from "@/lib/tema/tooltip-grafico";
import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import { listarFilaAtendimento } from "../services/chamados.service";
import type {
  CategoriaChamado,
  ChamadoResumo,
  PrioridadeChamado,
  SetorChamado,
  StatusChamado,
} from "../types/chamados.types";
import { PrioridadeBadge, PRIORIDADE_LABELS, StatusBadge, STATUS_LABELS } from "./ChamadoBadges";
import styles from "./Chamados.module.css";

interface FilaAtendimentoPageProps {
  setores: SetorChamado[];
  categorias: CategoriaChamado[];
  empresas: string[];
  departamentos: string[];
}

const ITENS_POR_PAGINA_LISTA = 25;
const LIMITE_BUSCA = 500;

const CORES_STATUS: Record<string, string> = {
  aberto: "#1d4ed8",
  em_andamento: "#9a3412",
  aguardando_confirmacao: "#b45309",
  resolvido: "#166534",
  fechado: "#4b5563",
};

const CORES_PRIORIDADE: Record<string, string> = {
  baixa: "#4b5563",
  media: "#1d4ed8",
  alta: "#9a3412",
  urgente: "#b71c1c",
};

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const OPCOES_STATUS = [
  { value: "", label: "Todos" },
  ...(Object.keys(STATUS_LABELS) as StatusChamado[]).map((status) => ({
    value: status,
    label: STATUS_LABELS[status].label,
  })),
];

const OPCOES_PRIORIDADE = [
  { value: "", label: "Todas" },
  ...(Object.keys(PRIORIDADE_LABELS) as PrioridadeChamado[]).map((prioridade) => ({
    value: prioridade,
    label: PRIORIDADE_LABELS[prioridade].label,
  })),
];

const MODOS_VISUALIZACAO = [
  { value: "lista", label: "Lista", icon: List },
  { value: "grafico", label: "Gráfico", icon: PieChartIcon },
  { value: "kanban", label: "Kanban", icon: LayoutGrid },
] as const;

type ModoVisualizacao = (typeof MODOS_VISUALIZACAO)[number]["value"];

export function FilaAtendimentoPage({
  setores,
  categorias,
  empresas,
  departamentos,
}: FilaAtendimentoPageProps) {
  const router = useRouter();

  const [modo, setModo] = useState<ModoVisualizacao>("lista");
  const [status, setStatus] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [setorId, setSetorId] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [paginaLista, setPaginaLista] = useState(1);
  const [ocultarFechados, setOcultarFechados] = useState(true);

  const [itens, setItens] = useState<ChamadoResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  /* Sem isso, cada tecla digitada na busca disparava uma requisição imediata. */
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setBusca(buscaDigitada);
      setPaginaLista(1);
    }, 400);

    return () => clearTimeout(temporizador);
  }, [buscaDigitada]);

  useEffect(() => {
    let cancelado = false;

    listarFilaAtendimento({
      status: (status as StatusChamado) || undefined,
      prioridade: (prioridade as PrioridadeChamado) || undefined,
      setorId: setorId || undefined,
      empresa: empresa || undefined,
      departamento: departamento || undefined,
      categoriaId: categoriaId || undefined,
      busca: busca || undefined,
      pagina: 1,
      porPagina: LIMITE_BUSCA,
    }).then((resultado) => {
      if (cancelado) return;

      if (resultado.ok && resultado.data) {
        setItens(resultado.data.itens);
        setTotal(resultado.data.total);
      }

      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [status, prioridade, setorId, empresa, departamento, categoriaId, busca]);

  const itensVisiveis = useMemo(
    () => (ocultarFechados ? itens.filter((item) => item.status !== "fechado") : itens),
    [itens, ocultarFechados]
  );

  const buscaTruncada = itens.length >= LIMITE_BUSCA && total > itens.length;

  const opcoesSetor = [
    { value: "", label: "Todos" },
    ...setores.map((setor) => ({ value: setor.id, label: setor.nome })),
  ];

  const opcoesEmpresa = [
    { value: "", label: "Todas" },
    ...empresas.map((codigo) => ({ value: codigo, label: codigo })),
  ];

  const opcoesDepartamento = [
    { value: "", label: "Todos" },
    ...departamentos.map((nome) => ({ value: nome, label: nome })),
  ];

  const opcoesCategoria = [
    { value: "", label: "Todas" },
    ...categorias.map((categoria) => ({
      value: categoria.id,
      label: `${categoria.nome} (${categoria.setorNome})`,
    })),
  ];

  const totalPaginasLista = Math.max(1, Math.ceil(itensVisiveis.length / ITENS_POR_PAGINA_LISTA));
  const itensPaginaLista = itensVisiveis.slice(
    (paginaLista - 1) * ITENS_POR_PAGINA_LISTA,
    paginaLista * ITENS_POR_PAGINA_LISTA
  );

  const colunasKanban = useMemo(() => {
    return (Object.keys(STATUS_LABELS) as StatusChamado[])
      .filter((statusColuna) => !ocultarFechados || statusColuna !== "fechado")
      .map((statusColuna) => ({
        status: statusColuna,
        label: STATUS_LABELS[statusColuna].label,
        itens: itensVisiveis.filter((item) => item.status === statusColuna),
      }));
  }, [itensVisiveis, ocultarFechados]);

  const dadosStatusGrafico = useMemo(() => {
    return (Object.keys(STATUS_LABELS) as StatusChamado[])
      .map((statusChave) => ({
        status: statusChave,
        label: STATUS_LABELS[statusChave].label,
        total: itensVisiveis.filter((item) => item.status === statusChave).length,
      }))
      .filter((item) => item.total > 0);
  }, [itensVisiveis]);

  const dadosPrioridadeGrafico = useMemo(() => {
    return (Object.keys(PRIORIDADE_LABELS) as PrioridadeChamado[]).map((prioridadeChave) => ({
      prioridade: prioridadeChave,
      label: PRIORIDADE_LABELS[prioridadeChave].label,
      total: itensVisiveis.filter((item) => item.prioridade === prioridadeChave).length,
    }));
  }, [itensVisiveis]);

  return (
    <PageContainer>
      <PageHeader
        title="Atender chamados"
        description="Fila de chamados dos setores que você atende."
        actions={
          <Link href="/chamados/dashboard">
            <Button variant="secondary">
              <BarChart3 size={16} />
              Dashboard (TV)
            </Button>
          </Link>
        }
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Atender chamados", current: true, icon: <Headset size={14} /> },
        ]}
      />

      <Card>
        <Stack gap={16}>
          <div className={styles.filaFiltros}>
            <div className={styles.filaFiltroCampo}>
              <Field label="Setor">
                <Dropdown
                  value={setorId}
                  options={opcoesSetor}
                  onValueChange={(valor) => {
                    setSetorId(valor);
                    setPaginaLista(1);
                  }}
                />
              </Field>
            </div>

            <div className={styles.filaFiltroCampo}>
              <Field label="Empresa">
                <Dropdown
                  value={empresa}
                  options={opcoesEmpresa}
                  onValueChange={(valor) => {
                    setEmpresa(valor);
                    setPaginaLista(1);
                  }}
                />
              </Field>
            </div>

            <div className={styles.filaFiltroCampo}>
              <Field label="Departamento">
                <Dropdown
                  value={departamento}
                  options={opcoesDepartamento}
                  onValueChange={(valor) => {
                    setDepartamento(valor);
                    setPaginaLista(1);
                  }}
                />
              </Field>
            </div>

            <div className={styles.filaFiltroCampo}>
              <Field label="Status">
                <Dropdown
                  value={status}
                  options={OPCOES_STATUS}
                  onValueChange={(valor) => {
                    setStatus(valor);
                    setPaginaLista(1);
                  }}
                />
              </Field>
            </div>

            <div className={styles.filaFiltroCampo}>
              <Field label="Prioridade">
                <Dropdown
                  value={prioridade}
                  options={OPCOES_PRIORIDADE}
                  onValueChange={(valor) => {
                    setPrioridade(valor);
                    setPaginaLista(1);
                  }}
                />
              </Field>
            </div>

            <div className={styles.filaFiltroCampo}>
              <Field label="Categoria">
                <Dropdown
                  value={categoriaId}
                  options={opcoesCategoria}
                  onValueChange={(valor) => {
                    setCategoriaId(valor);
                    setPaginaLista(1);
                  }}
                />
              </Field>
            </div>

            <div className={styles.filaFiltroCampo} style={{ flex: 1 }}>
              <Field label="Buscar">
                <Input
                  value={buscaDigitada}
                  placeholder="Título, solicitante ou número"
                  onChange={(event) => setBuscaDigitada(event.target.value)}
                />
              </Field>
            </div>
          </div>

          <Checkbox
            label="Ocultar chamados fechados"
            checked={ocultarFechados}
            onChange={(event) => {
              setOcultarFechados(event.target.checked);
              setPaginaLista(1);
            }}
          />
        </Stack>
      </Card>

      {buscaTruncada && (
        <Alert variant="warning">
          Mostrando os {itens.length} chamados mais recentes de {total} encontrados. Refine
          os filtros para ver os demais.
        </Alert>
      )}

      <div className={styles.modoVisualizacao}>
        {MODOS_VISUALIZACAO.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              className={`${styles.modoVisualizacaoBtn} ${
                modo === item.value ? styles.modoVisualizacaoBtnAtivo : ""
              }`}
              onClick={() => setModo(item.value)}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}

        {!carregando && (
          <span className={styles.modoVisualizacaoTotal}>
            {itensVisiveis.length === total
              ? `${total} chamado(s)`
              : `${itensVisiveis.length} de ${total} chamado(s)`}
          </span>
        )}
      </div>

      {carregando ? (
        <Card>
          <Loader label="Carregando chamados..." />
        </Card>
      ) : itensVisiveis.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Headset size={28} />}
            title="Nenhum chamado encontrado"
            description="Ajuste os filtros ou aguarde novos chamados chegarem."
          />
        </Card>
      ) : modo === "lista" ? (
        <Card>
          <Stack gap={16}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nº</TableHeaderCell>
                  <TableHeaderCell>Título</TableHeaderCell>
                  <TableHeaderCell>Setor</TableHeaderCell>
                  <TableHeaderCell>Categoria</TableHeaderCell>
                  <TableHeaderCell>Empresa</TableHeaderCell>
                  <TableHeaderCell>Solicitante</TableHeaderCell>
                  <TableHeaderCell>Departamento</TableHeaderCell>
                  <TableHeaderCell>Atendente</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Prioridade</TableHeaderCell>
                  <TableHeaderCell>Atualizado em</TableHeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {itensPaginaLista.map((chamado) => (
                  <TableRow
                    key={chamado.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/chamados/${chamado.numero}`)}
                  >
                    <TableCell>#{chamado.numero}</TableCell>
                    <TableCell>{chamado.titulo}</TableCell>
                    <TableCell>{chamado.setorNome}</TableCell>
                    <TableCell>{chamado.categoriaNome ?? "—"}</TableCell>
                    <TableCell>{chamado.empresa ?? "—"}</TableCell>
                    <TableCell>{chamado.solicitanteNome}</TableCell>
                    <TableCell>{chamado.solicitanteDepartamento ?? "—"}</TableCell>
                    <TableCell>{chamado.atendenteNome ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={chamado.status} />
                    </TableCell>
                    <TableCell>
                      <PrioridadeBadge prioridade={chamado.prioridade} />
                    </TableCell>
                    <TableCell>{formatarData(chamado.atualizadoEm)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={paginaLista}
              totalPages={totalPaginasLista}
              onPageChange={setPaginaLista}
            />
          </Stack>
        </Card>
      ) : modo === "grafico" ? (
        <div className={styles.filaGraficoGrid}>
          <Card title="Chamados por status">
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={dadosStatusGrafico}
                    dataKey="total"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {dadosStatusGrafico.map((entry) => (
                      <Cell key={entry.status} fill={CORES_STATUS[entry.status]} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Chamados por prioridade">
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dadosPrioridadeGrafico}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
                  <Bar dataKey="total" name="Chamados" radius={[8, 8, 0, 0]}>
                    {dadosPrioridadeGrafico.map((entry) => (
                      <Cell key={entry.prioridade} fill={CORES_PRIORIDADE[entry.prioridade]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : (
        <div className={styles.kanbanBoard}>
          {colunasKanban.map((coluna) => (
            <div key={coluna.status} className={styles.kanbanColuna}>
              <div
                className={styles.kanbanColunaTopo}
                style={{ borderTopColor: CORES_STATUS[coluna.status] }}
              >
                <span>{coluna.label}</span>
                <span className={styles.kanbanColunaContador}>{coluna.itens.length}</span>
              </div>

              <div className={styles.kanbanColunaLista}>
                {coluna.itens.map((chamado) => (
                  <button
                    key={chamado.id}
                    type="button"
                    className={styles.kanbanCard}
                    onClick={() => router.push(`/chamados/${chamado.numero}`)}
                  >
                    <div className={styles.kanbanCardTopo}>
                      <span className={styles.kanbanCardNumero}>#{chamado.numero}</span>
                      <PrioridadeBadge prioridade={chamado.prioridade} />
                    </div>

                    <p className={styles.kanbanCardTitulo}>{chamado.titulo}</p>

                    <div className={styles.kanbanCardRodape}>
                      <span>{chamado.solicitanteNome}</span>
                      <span>{chamado.setorNome}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
