"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Clock3, Headset, Home, Inbox } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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
import { DateInput } from "@/components/ui/DateInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";

import { buscarEstatisticasChamados } from "../services/chamados.service";
import type { CategoriaChamado, EstatisticasChamados, SetorChamado } from "../types/chamados.types";
import { PRIORIDADE_LABELS, STATUS_LABELS } from "./ChamadoBadges";
import styles from "./Chamados.module.css";

interface FiltrosDashboard {
  setorId: string;
  empresa: string;
  departamento: string;
  categoriaId: string;
  dataInicial: string;
  dataFinal: string;
}

interface DashboardChamadosPageProps {
  setores: SetorChamado[];
  categorias: CategoriaChamado[];
  empresas: string[];
  departamentos: string[];
  fullscreen?: boolean;
  filtrosIniciais?: FiltrosDashboard;
}

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

const CORES_SETOR = [
  "#b71c1c",
  "#d32f2f",
  "#8e24aa",
  "#3949ab",
  "#00897b",
  "#fb8c00",
  "#546e7a",
];

function formatarHoras(horas: number | null): string {
  if (horas === null) return "—";
  if (horas < 24) return `${horas.toFixed(1)} h`;
  return `${(horas / 24).toFixed(1)} d`;
}

export function DashboardChamadosPage({
  setores,
  categorias,
  empresas,
  departamentos,
  fullscreen = false,
  filtrosIniciais,
}: DashboardChamadosPageProps) {
  const [setorId, setSetorId] = useState(filtrosIniciais?.setorId ?? "");
  const [empresa, setEmpresa] = useState(filtrosIniciais?.empresa ?? "");
  const [departamento, setDepartamento] = useState(filtrosIniciais?.departamento ?? "");
  const [categoriaId, setCategoriaId] = useState(filtrosIniciais?.categoriaId ?? "");
  const [dataInicial, setDataInicial] = useState(filtrosIniciais?.dataInicial ?? "");
  const [dataFinal, setDataFinal] = useState(filtrosIniciais?.dataFinal ?? "");

  const [dados, setDados] = useState<EstatisticasChamados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recarregarChave, setRecarregarChave] = useState(0);
  const temDadosRef = useRef(false);

  /*
   * Em modo TV (fullscreen) esta tela roda sem ninguém pra
   * interagir e recarregar manualmente — precisa se atualizar
   * sozinha. Fora do modo TV, quem está usando já reabre a
   * página quando quer ver dados novos, então não vale a pena
   * ficar buscando em segundo plano.
   */
  useEffect(() => {
    let cancelado = false;

    function buscar() {
      buscarEstatisticasChamados({
        setorId: setorId || undefined,
        empresa: empresa || undefined,
        departamento: departamento || undefined,
        categoriaId: categoriaId || undefined,
        dataInicial: dataInicial || undefined,
        dataFinal: dataFinal || undefined,
      }).then((resultado) => {
        if (cancelado) return;

        if (resultado.ok && resultado.data) {
          setDados(resultado.data);
          setErro(null);
          temDadosRef.current = true;
        } else if (!temDadosRef.current) {
          setErro(resultado.message ?? "Não foi possível carregar os indicadores.");
        }

        setCarregando(false);
      });
    }

    buscar();

    if (!fullscreen) {
      return () => {
        cancelado = true;
      };
    }

    const intervalo = setInterval(buscar, 120000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [
    setorId,
    empresa,
    departamento,
    categoriaId,
    dataInicial,
    dataFinal,
    fullscreen,
    recarregarChave,
  ]);

  const dadosStatus = useMemo(() => {
    if (!dados) return [];

    const totalPorStatus: Record<keyof typeof STATUS_LABELS, number> = {
      aberto: dados.totais.aberto,
      em_andamento: dados.totais.emAndamento,
      aguardando_confirmacao: dados.totais.aguardandoConfirmacao,
      resolvido: dados.totais.resolvido,
      fechado: dados.totais.fechado,
    };

    return (Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>)
      .map((status) => ({
        status,
        label: STATUS_LABELS[status].label,
        total: totalPorStatus[status],
      }))
      .filter((item) => item.total > 0);
  }, [dados]);

  const dadosPrioridade = useMemo(() => {
    if (!dados) return [];
    return dados.porPrioridade.map((item) => ({
      label: PRIORIDADE_LABELS[item.prioridade].label,
      prioridade: item.prioridade,
      total: item.total,
    }));
  }, [dados]);

  const opcoesSetor = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...setores.map((setor) => ({ value: setor.id, label: setor.nome })),
    ],
    [setores]
  );

  const opcoesEmpresa = useMemo(
    () => [
      { value: "", label: "Todas" },
      ...empresas.map((codigo) => ({ value: codigo, label: codigo })),
    ],
    [empresas]
  );

  const opcoesDepartamento = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...departamentos.map((nome) => ({ value: nome, label: nome })),
    ],
    [departamentos]
  );

  const opcoesCategoria = useMemo(
    () => [
      { value: "", label: "Todas" },
      ...categorias.map((categoria) => ({
        value: categoria.id,
        label: `${categoria.nome} (${categoria.setorNome})`,
      })),
    ],
    [categorias]
  );

  const setorFiltradoNome = useMemo(
    () => setores.find((setor) => setor.id === setorId)?.nome,
    [setores, setorId]
  );

  function tentarNovamente() {
    setCarregando(true);
    setRecarregarChave((atual) => atual + 1);
  }

  if (carregando || !dados) {
    const conteudo = erro ? (
      <Alert variant="danger">
        <Stack gap={12}>
          <span>{erro}</span>
          <Stack direction="row">
            <Button variant="secondary" onClick={tentarNovamente}>
              Tentar novamente
            </Button>
          </Stack>
        </Stack>
      </Alert>
    ) : (
      <Loader label="Carregando indicadores..." />
    );

    return fullscreen ? (
      <div className={styles.tvDashboard}>{conteudo}</div>
    ) : (
      <PageContainer>
        <PageHeader
          title="Dashboard de chamados"
          description="Indicadores consolidados dos setores que você atende."
        />
        <Card>{conteudo}</Card>
      </PageContainer>
    );
  }

  const graficoStatus = (
    <PieChart>
      <Pie
        data={dadosStatus}
        dataKey="total"
        nameKey="label"
        cx="50%"
        cy="50%"
        outerRadius="80%"
        label
      >
        {dadosStatus.map((entry) => (
          <Cell key={entry.status} fill={CORES_STATUS[entry.status]} />
        ))}
      </Pie>
      <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
      <Legend />
    </PieChart>
  );

  const graficoPrioridade = (
    <BarChart data={dadosPrioridade}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="label" />
      <YAxis allowDecimals={false} />
      <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
      <Bar dataKey="total" name="Chamados" radius={[8, 8, 0, 0]}>
        {dadosPrioridade.map((entry) => (
          <Cell key={entry.prioridade} fill={CORES_PRIORIDADE[entry.prioridade]} />
        ))}
      </Bar>
    </BarChart>
  );

  const graficoPorDia = (
    <LineChart data={dados.porDia}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="dia" />
      <YAxis allowDecimals={false} />
      <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
      <Line type="monotone" dataKey="total" name="Chamados" stroke="var(--primary)" strokeWidth={3} />
    </LineChart>
  );

  const graficoPorSetor = (
    <BarChart data={dados.porSetor} layout="vertical" margin={{ left: 24 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis type="number" allowDecimals={false} />
      <YAxis type="category" dataKey="setorNome" width={160} tick={{ fontSize: 12 }} />
      <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
      <Bar dataKey="total" name="Chamados" radius={[0, 8, 8, 0]}>
        {dados.porSetor.map((entry, index) => (
          <Cell key={entry.setorId} fill={CORES_SETOR[index % CORES_SETOR.length]} />
        ))}
      </Bar>
    </BarChart>
  );

  const graficoPorAtendente = (
    <BarChart data={dados.porAtendente} layout="vertical" margin={{ left: 24 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis type="number" allowDecimals={false} />
      <YAxis type="category" dataKey="atendenteNome" width={160} tick={{ fontSize: 12 }} />
      <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
      <Bar dataKey="total" name="Chamados" fill="#3949ab" radius={[0, 8, 8, 0]} />
    </BarChart>
  );

  const graficoPorEmpresa = (
    <BarChart data={dados.porEmpresa} layout="vertical" margin={{ left: 24 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis type="number" allowDecimals={false} />
      <YAxis type="category" dataKey="empresa" width={160} tick={{ fontSize: 12 }} />
      <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
      <Bar dataKey="total" name="Chamados" fill="#00897b" radius={[0, 8, 8, 0]} />
    </BarChart>
  );

  const graficoPorDepartamento = (
    <BarChart data={dados.porDepartamento} layout="vertical" margin={{ left: 24 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis type="number" allowDecimals={false} />
      <YAxis type="category" dataKey="departamento" width={160} tick={{ fontSize: 12 }} />
      <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
      <Bar dataKey="total" name="Chamados" fill="#5e35b1" radius={[0, 8, 8, 0]} />
    </BarChart>
  );

  const graficoPorCategoria = (
    <BarChart data={dados.porCategoria} layout="vertical" margin={{ left: 24 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis type="number" allowDecimals={false} />
      <YAxis type="category" dataKey="categoria" width={160} tick={{ fontSize: 12 }} />
      <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
      <Bar dataKey="total" name="Chamados" fill="#fb8c00" radius={[0, 8, 8, 0]} />
    </BarChart>
  );

  if (fullscreen) {
    return (
      <div className={styles.tvDashboard}>
        <div className={styles.tvHeader}>
          <h1 className={styles.tvTitulo}>Dashboard de chamados</h1>
          {(setorFiltradoNome || empresa || departamento) && (
            <span className={styles.tvSubtitulo}>
              {[setorFiltradoNome, empresa, departamento].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>

        <div className={styles.tvStatsRow}>
          <div className={styles.tvStatTile}>
            <span className={styles.tvStatLabel}>Total</span>
            <strong className={styles.tvStatValor}>{dados.totais.total}</strong>
          </div>
          <div className={styles.tvStatTile}>
            <span className={styles.tvStatLabel}>Abertos</span>
            <strong className={styles.tvStatValor}>{dados.totais.aberto}</strong>
          </div>
          <div className={styles.tvStatTile}>
            <span className={styles.tvStatLabel}>Em andamento</span>
            <strong className={styles.tvStatValor}>{dados.totais.emAndamento}</strong>
          </div>
          <div className={styles.tvStatTile}>
            <span className={styles.tvStatLabel}>Aguardando confirmação</span>
            <strong className={styles.tvStatValor}>{dados.totais.aguardandoConfirmacao}</strong>
          </div>
          <div className={styles.tvStatTile}>
            <span className={styles.tvStatLabel}>Resolvidos</span>
            <strong className={styles.tvStatValor}>{dados.totais.resolvido}</strong>
          </div>
          <div className={styles.tvStatTile}>
            <span className={styles.tvStatLabel}>Tempo médio de resolução</span>
            <strong className={styles.tvStatValor}>
              {formatarHoras(dados.tempoMedioResolucaoHoras)}
            </strong>
          </div>
        </div>

        <div className={styles.tvChartsGrid}>
          <div className={styles.tvChartTile}>
            <h2 className={styles.tvChartTitulo}>Chamados por status</h2>
            <div className={styles.tvChartBody}>
              <ResponsiveContainer width="100%" height="100%">
                {graficoStatus}
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.tvChartTile}>
            <h2 className={styles.tvChartTitulo}>Chamados por prioridade</h2>
            <div className={styles.tvChartBody}>
              <ResponsiveContainer width="100%" height="100%">
                {graficoPrioridade}
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.tvChartTile}>
            <h2 className={styles.tvChartTitulo}>Chamados abertos por dia</h2>
            <div className={styles.tvChartBody}>
              <ResponsiveContainer width="100%" height="100%">
                {graficoPorDia}
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.tvChartTile}>
            <h2 className={styles.tvChartTitulo}>Chamados por setor</h2>
            <div className={styles.tvChartBody}>
              <ResponsiveContainer width="100%" height="100%">
                {graficoPorSetor}
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.tvChartTile}>
            <h2 className={styles.tvChartTitulo}>Chamados por atendente</h2>
            <div className={styles.tvChartBody}>
              <ResponsiveContainer width="100%" height="100%">
                {graficoPorAtendente}
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.tvChartTile}>
            <h2 className={styles.tvChartTitulo}>Chamados por empresa</h2>
            <div className={styles.tvChartBody}>
              <ResponsiveContainer width="100%" height="100%">
                {graficoPorEmpresa}
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.tvChartTile}>
            <h2 className={styles.tvChartTitulo}>Chamados por departamento</h2>
            <div className={styles.tvChartBody}>
              <ResponsiveContainer width="100%" height="100%">
                {graficoPorDepartamento}
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.tvChartTile}>
            <h2 className={styles.tvChartTitulo}>Chamados por categoria</h2>
            <div className={styles.tvChartBody}>
              <ResponsiveContainer width="100%" height="100%">
                {graficoPorCategoria}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard de chamados"
        description="Indicadores consolidados dos setores que você atende."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Atender chamados", href: "/chamados/atender", icon: <Headset size={14} /> },
          { label: "Dashboard", current: true },
        ]}
      />

      <Card>
        <FormGrid columns={4}>
          <Field label="Setor">
            <Dropdown value={setorId} options={opcoesSetor} onValueChange={setSetorId} />
          </Field>

          <Field label="Empresa">
            <Dropdown value={empresa} options={opcoesEmpresa} onValueChange={setEmpresa} />
          </Field>

          <Field label="Departamento">
            <Dropdown
              value={departamento}
              options={opcoesDepartamento}
              onValueChange={setDepartamento}
            />
          </Field>

          <Field label="Categoria">
            <Dropdown
              value={categoriaId}
              options={opcoesCategoria}
              onValueChange={setCategoriaId}
            />
          </Field>

          <Field label="Data inicial">
            <DateInput value={dataInicial} onValueChange={setDataInicial} />
          </Field>

          <Field label="Data final">
            <DateInput value={dataFinal} onValueChange={setDataFinal} />
          </Field>
        </FormGrid>
      </Card>

      <Stack gap={20}>
        <FormGrid columns={4}>
          <StatCard label="Total" value={dados.totais.total} icon={<Inbox />} />
          <StatCard
            label="Abertos"
            value={dados.totais.aberto}
            variant="info"
            icon={<Inbox />}
          />
          <StatCard
            label="Em andamento"
            value={dados.totais.emAndamento}
            variant="warning"
            icon={<Clock3 />}
          />
          <StatCard
            label="Aguardando confirmação"
            value={dados.totais.aguardandoConfirmacao}
            variant="warning"
            icon={<Clock3 />}
          />
          <StatCard
            label="Resolvidos"
            value={dados.totais.resolvido}
            variant="success"
            icon={<BarChart3 />}
          />
          <StatCard
            label="Tempo médio de resolução"
            value={formatarHoras(dados.tempoMedioResolucaoHoras)}
            icon={<Clock3 />}
          />
        </FormGrid>

        <FormGrid columns={2}>
          <Card title="Chamados por status">
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height={280}>
                {graficoStatus}
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Chamados por prioridade">
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height={280}>
                {graficoPrioridade}
              </ResponsiveContainer>
            </div>
          </Card>
        </FormGrid>

        <Card title="Chamados abertos por dia">
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={280}>
              {graficoPorDia}
            </ResponsiveContainer>
          </div>
        </Card>

        <FormGrid columns={2}>
          <Card title="Chamados por setor">
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height={280}>
                {graficoPorSetor}
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Chamados por atendente">
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height={280}>
                {graficoPorAtendente}
              </ResponsiveContainer>
            </div>
          </Card>
        </FormGrid>

        <Card title="Chamados por empresa">
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={280}>
              {graficoPorEmpresa}
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Chamados por departamento">
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={280}>
              {graficoPorDepartamento}
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Chamados por categoria">
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={280}>
              {graficoPorCategoria}
            </ResponsiveContainer>
          </div>
        </Card>
      </Stack>
    </PageContainer>
  );
}
