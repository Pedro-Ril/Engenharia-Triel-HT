"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./bi.module.css";
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

type Kpis = {
  clientes: string;
  projetistas: string;
  projetos_periodo: string;
  clientes_periodo: string;
  media_diaria: string;
  projetista_top: string;
  cliente_top: string;
  concentracao_top5: string;
};

type FiltrosApi = {
  projetistas: string[];
  clientes: string[];
};

type ItemNomeTotal = {
  nome?: string;
  cliente?: string;
  total: number;
};

type ItemPeriodo = {
  periodo: string;
  nome: string;
  total: number;
};

type ItemDia = {
  dia: number;
  total: number;
};

type ItemPeriodoTotal = {
  periodo: string;
  total: number;
};

type ItemDiaSemana = {
  dia_semana: number;
  label: string;
  total: number;
};

type BIResponse = {
  kpis: Kpis;
  filtros: FiltrosApi;
  projetosPorProjetista: ItemNomeTotal[];
  projetosPorCliente: ItemNomeTotal[];
  crescentePorProjetista: ItemPeriodo[];
  projetosLiberadosPorDia: ItemDia[];
  projetosPeriodoProjetista: ItemPeriodo[];
  rankingProjetistas: ItemNomeTotal[];
  topClientes: ItemNomeTotal[];
  projetosMes: ItemPeriodoTotal[];
  projetosPorDiaSemana: ItemDiaSemana[];
};

type FiltrosState = {
  dataInicial: string;
  dataFinal: string;
  projetista: string;
  cliente: string;
};

type FiltrosInterativosState = {
  projetista: string;
  cliente: string;
  periodo: string;
  diaSemana: string;
};

const COLORS = [
  "#b71c1c",
  "#d32f2f",
  "#ef5350",
  "#8e24aa",
  "#5e35b1",
  "#3949ab",
  "#1e88e5",
  "#00897b",
  "#43a047",
  "#fb8c00",
  "#6d4c41",
  "#546e7a",
];

export default function BIPage() {
  const [data, setData] = useState<BIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [filtros, setFiltros] = useState<FiltrosState>({
    dataInicial: "",
    dataFinal: "",
    projetista: "Todos",
    cliente: "Todos",
  });

  const [filtrosInterativos, setFiltrosInterativos] =
    useState<FiltrosInterativosState>({
      projetista: "",
      cliente: "",
      periodo: "",
      diaSemana: "",
    });

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        setErro("");

        const params = new URLSearchParams();

        if (filtros.dataInicial) params.set("dataInicial", filtros.dataInicial);
        if (filtros.dataFinal) params.set("dataFinal", filtros.dataFinal);
        if (filtros.projetista && filtros.projetista !== "Todos") {
          params.set("projetista", filtros.projetista);
        }
        if (filtros.cliente && filtros.cliente !== "Todos") {
          params.set("cliente", filtros.cliente);
        }

        if (filtrosInterativos.projetista) {
          params.set("projetista_interativo", filtrosInterativos.projetista);
        }
        if (filtrosInterativos.cliente) {
          params.set("cliente_interativo", filtrosInterativos.cliente);
        }
        if (filtrosInterativos.periodo) {
          params.set("periodo", filtrosInterativos.periodo);
        }
        if (filtrosInterativos.diaSemana) {
          params.set("diaSemana", filtrosInterativos.diaSemana);
        }

        const res = await fetch(`/api/bi?${params.toString()}`, {
          cache: "no-store",
        });

        const json = await res.json();

        if (!json.success) {
          throw new Error(json.error || "Erro ao carregar BI");
        }

        setData(json.data);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro desconhecido");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, [filtros, filtrosInterativos]);

  const dadosProjetista = useMemo(() => {
    return (data?.projetosPorProjetista ?? []).map((item) => ({
      nome: item.nome ?? "",
      total: Number(item.total),
    }));
  }, [data]);

  const dadosCliente = useMemo(() => {
    const truncar = (texto: string, max = 34) =>
      texto.length > max ? `${texto.slice(0, max)}...` : texto;

    const lista = (data?.projetosPorCliente ?? []).map((item) => ({
      cliente: truncar(item.cliente ?? ""),
      clienteOriginal: item.cliente ?? "",
      total: Number(item.total),
    }));

    const ordenado = [...lista].sort((a, b) => b.total - a.total);

    if (ordenado.length <= 10) return ordenado;

    const top10 = ordenado.slice(0, 10);
    const outrosTotal = ordenado
      .slice(10)
      .reduce((acc, item) => acc + item.total, 0);

    return [
      ...top10,
      { cliente: "Outros", clienteOriginal: "Outros", total: outrosTotal },
    ];
  }, [data]);

  const dadosPorDia = useMemo(() => {
    const base = Array.from({ length: 31 }, (_, i) => ({
      dia: i + 1,
      total: 0,
    }));

    (data?.projetosLiberadosPorDia ?? []).forEach((item) => {
      const idx = Number(item.dia) - 1;
      if (idx >= 0 && idx < base.length) {
        base[idx].total = Number(item.total);
      }
    });

    return base;
  }, [data]);

  const dadosCrescenteProjetista = useMemo(() => {
    return pivotarPeriodoProjetista(data?.crescentePorProjetista ?? []);
  }, [data]);

  const dadosPeriodoProjetista = useMemo(() => {
    return pivotarPeriodoProjetista(data?.projetosPeriodoProjetista ?? []);
  }, [data]);

  const nomesProjetistas = useMemo(() => {
    return [
      ...new Set(
        (data?.projetosPeriodoProjetista ?? []).map((item) => item.nome)
      ),
    ];
  }, [data]);

  const dadosProjetosMes = useMemo(() => {
    return (data?.projetosMes ?? []).map((item) => ({
      periodo: formatarPeriodo(item.periodo),
      periodoOriginal: item.periodo,
      total: Number(item.total),
    }));
  }, [data]);

  const dadosDiaSemana = useMemo(() => {
    return (data?.projetosPorDiaSemana ?? []).map((item) => ({
      label: item.label,
      dia_semana: String(item.dia_semana),
      total: Number(item.total),
    }));
  }, [data]);

  const dadosRankingProjetistas = useMemo(() => {
    return (data?.rankingProjetistas ?? []).map((item) => ({
      nome: item.nome ?? "",
      total: Number(item.total),
    }));
  }, [data]);

  const dadosTopClientes = useMemo(() => {
    const truncar = (texto: string, max = 38) =>
      texto.length > max ? `${texto.slice(0, max)}...` : texto;

    return (data?.topClientes ?? []).map((item) => ({
      cliente: truncar(item.cliente ?? ""),
      total: Number(item.total),
    }));
  }, [data]);

  const chipsAtivos = useMemo(() => {
    const chips: Array<{ chave: keyof FiltrosInterativosState; label: string; valor: string }> =
      [];

    if (filtrosInterativos.projetista) {
      chips.push({
        chave: "projetista",
        label: "Projetista",
        valor: filtrosInterativos.projetista,
      });
    }

    if (filtrosInterativos.cliente) {
      chips.push({
        chave: "cliente",
        label: "Cliente",
        valor: filtrosInterativos.cliente,
      });
    }

    if (filtrosInterativos.periodo) {
      chips.push({
        chave: "periodo",
        label: "Período",
        valor: formatarPeriodo(filtrosInterativos.periodo),
      });
    }

    if (filtrosInterativos.diaSemana) {
      chips.push({
        chave: "diaSemana",
        label: "Dia da semana",
        valor: traduzirDiaSemana(filtrosInterativos.diaSemana),
      });
    }

    return chips;
  }, [filtrosInterativos]);

  function atualizarFiltro<K extends keyof FiltrosState>(
    campo: K,
    valor: FiltrosState[K]
  ) {
    setFiltros((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }

  function limparFiltros() {
    setFiltros({
      dataInicial: "",
      dataFinal: "",
      projetista: "Todos",
      cliente: "Todos",
    });
    setFiltrosInterativos({
      projetista: "",
      cliente: "",
      periodo: "",
      diaSemana: "",
    });
  }

  function limparFiltrosInterativos() {
    setFiltrosInterativos({
      projetista: "",
      cliente: "",
      periodo: "",
      diaSemana: "",
    });
  }

  function removerFiltroInterativo(chave: keyof FiltrosInterativosState) {
    setFiltrosInterativos((prev) => ({
      ...prev,
      [chave]: "",
    }));
  }

  function toggleFiltroInterativo(
    chave: keyof FiltrosInterativosState,
    valor: string
  ) {
    setFiltrosInterativos((prev) => ({
      ...prev,
      [chave]: prev[chave] === valor ? "" : valor,
    }));
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>Business Intelligence</span>

          <h1 className={styles.title}>Dashboard da Engenharia</h1>

          <p className={styles.description}>
            Acompanhe indicadores consolidados, aplique filtros e visualize a
            evolução das liberações diretamente no portal da Engenharia Triel-HT.
          </p>
        </div>

        <div className={styles.heroPanel}>
          <div className={styles.panelCard}>
            <h2 className={styles.panelTitle}>Resumo do módulo</h2>
            <p className={styles.panelText}>
              Dados carregados diretamente do PostgreSQL com filtros dinâmicos
              por período, projetista e cliente.
            </p>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Fonte de dados</span>
              <strong className={styles.statValue}>PostgreSQL</strong>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Status do módulo</span>
              <strong className={`${styles.statValue} ${styles.statOperacional}`}>
                Operacional
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionMiniTitle}>Filtros</span>
            <h2 className={styles.sectionTitle}>Refinar visualização</h2>
          </div>
        </div>

        <div className={styles.filtersCard}>
          <div className={styles.filtersGrid}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Data inicial</label>
              <input
                type="date"
                className={styles.filterInput}
                value={filtros.dataInicial}
                onChange={(e) => atualizarFiltro("dataInicial", e.target.value)}
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Data final</label>
              <input
                type="date"
                className={styles.filterInput}
                value={filtros.dataFinal}
                onChange={(e) => atualizarFiltro("dataFinal", e.target.value)}
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Projetista</label>
              <select
                className={styles.filterInput}
                value={filtros.projetista}
                onChange={(e) => atualizarFiltro("projetista", e.target.value)}
              >
                <option value="Todos">Todos</option>
                {(data?.filtros.projetistas ?? []).map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Cliente</label>
              <select
                className={styles.filterInput}
                value={filtros.cliente}
                onChange={(e) => atualizarFiltro("cliente", e.target.value)}
              >
                <option value="Todos">Todos</option>
                {(data?.filtros.clientes ?? []).map((cliente) => (
                  <option key={cliente} value={cliente}>
                    {cliente}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.filterActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={limparFiltros}
            >
              Limpar filtros
            </button>
          </div>

          {chipsAtivos.length > 0 && (
            <div className={styles.activeFiltersWrap}>
              <div className={styles.activeFiltersHeader}>
                <span className={styles.activeFiltersTitle}>
                  Filtros ativos pelos gráficos
                </span>

                <button
                  type="button"
                  className={styles.clearInteractiveButton}
                  onClick={limparFiltrosInterativos}
                >
                  Limpar interativos
                </button>
              </div>

              <div className={styles.activeFiltersChips}>
                {chipsAtivos.map((chip) => (
                  <button
                    key={`${chip.chave}-${chip.valor}`}
                    type="button"
                    className={styles.filterChip}
                    onClick={() => removerFiltroInterativo(chip.chave)}
                  >
                    <span className={styles.filterChipLabel}>{chip.label}:</span>
                    <span>{chip.valor}</span>
                    <span className={styles.filterChipClose}>×</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {erro ? <div className={styles.errorBox}>Erro: {erro}</div> : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionMiniTitle}>Visão geral</span>
            <h2 className={styles.sectionTitle}>Indicadores principais</h2>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingCard}>
            Carregando indicadores do BI...
          </div>
        ) : (
          <div className={styles.kpiGrid}>
            <KpiCard titulo="Clientes" valor={data?.kpis.clientes ?? "0"} />
            <KpiCard
              titulo="Projetistas"
              valor={data?.kpis.projetistas ?? "0"}
            />
            <KpiCard
              titulo="Projetos por período"
              valor={data?.kpis.projetos_periodo ?? "0"}
            />
            <KpiCard
              titulo="Clientes por período"
              valor={data?.kpis.clientes_periodo ?? "0"}
            />
            <KpiCard
              titulo="Média diária"
              valor={data?.kpis.media_diaria ?? "0"}
            />
            <KpiCard
              titulo="Projetista top"
              valor={data?.kpis.projetista_top || "-"}
              compact
            />
            <KpiCard
              titulo="Cliente top"
              valor={data?.kpis.cliente_top || "-"}
              compact
            />
            <KpiCard
              titulo="Top 5 clientes %"
              valor={`${data?.kpis.concentracao_top5 ?? "0"}%`}
            />
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.cardsGrid}>
          <ChartCard title="Projetos por Projetista">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={dadosProjetista}
                  dataKey="total"
                  nameKey="nome"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label
                  onClick={(entry: any) => {
                    const nome = entry?.nome ?? "";
                    if (!nome) return;
                    toggleFiltroInterativo("projetista", nome);
                  }}
                >
                  {dadosProjetista.map((entry, index) => {
                    const ativo =
                      !filtrosInterativos.projetista ||
                      filtrosInterativos.projetista === entry.nome;

                    return (
                      <Cell
                        key={`proj-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        fillOpacity={ativo ? 1 : 0.28}
                        stroke={
                          filtrosInterativos.projetista === entry.nome
                            ? "#111827"
                            : "transparent"
                        }
                        strokeWidth={
                          filtrosInterativos.projetista === entry.nome ? 2 : 0
                        }
                        style={{ cursor: "pointer" }}
                      />
                    );
                  })}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Projetos por Cliente">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart
                data={[...dadosCliente].sort((a, b) => b.total - a.total)}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
                onClick={(state: any) => {
                  const payload = state?.activePayload?.[0]?.payload;
                  const cliente = payload?.clienteOriginal ?? payload?.cliente ?? "";
                  if (!cliente || cliente === "Outros") return;
                  toggleFiltroInterativo("cliente", cliente);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="cliente"
                  width={260}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Bar dataKey="total" name="Projetos" radius={[0, 8, 8, 0]}>
                  {dadosCliente.map((entry, index) => {
                    const clienteComparacao =
                      entry.clienteOriginal ?? entry.cliente ?? "";
                    const ativo =
                      !filtrosInterativos.cliente ||
                      filtrosInterativos.cliente === clienteComparacao;

                    return (
                      <Cell
                        key={`cli-bar-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        fillOpacity={ativo ? 1 : 0.28}
                        stroke={
                          filtrosInterativos.cliente === clienteComparacao
                            ? "#111827"
                            : "transparent"
                        }
                        strokeWidth={
                          filtrosInterativos.cliente === clienteComparacao ? 2 : 0
                        }
                        style={{ cursor: clienteComparacao === "Outros" ? "default" : "pointer" }}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.cardsGrid}>
          <ChartCard title="Crescente por Projetista">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={dadosCrescenteProjetista}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" />
                <YAxis />
                <Tooltip />
                <Legend />
                {nomesProjetistas.map((nome, index) => (
                  <Line
                    key={nome}
                    type="monotone"
                    dataKey={nome}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={
                      filtrosInterativos.projetista === nome ? 4 : 2
                    }
                    strokeOpacity={
                      !filtrosInterativos.projetista ||
                      filtrosInterativos.projetista === nome
                        ? 1
                        : 0.2
                    }
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Projetos liberados por Dia">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={dadosPorDia}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dia" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Projetos"
                  stroke="#1e88e5"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.cardsGrid}>
          <ChartCard title="Projetos por Mês">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={dadosProjetosMes}
                onClick={(state: any) => {
                  const payload = state?.activePayload?.[0]?.payload;
                  const periodo = payload?.periodoOriginal ?? "";
                  if (!periodo) return;
                  toggleFiltroInterativo("periodo", periodo);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Projetos" radius={[8, 8, 0, 0]}>
                  {dadosProjetosMes.map((entry, index) => {
                    const ativo =
                      !filtrosInterativos.periodo ||
                      filtrosInterativos.periodo === entry.periodoOriginal;

                    return (
                      <Cell
                        key={`mes-${index}`}
                        fill="#b71c1c"
                        fillOpacity={ativo ? 1 : 0.28}
                        stroke={
                          filtrosInterativos.periodo === entry.periodoOriginal
                            ? "#111827"
                            : "transparent"
                        }
                        strokeWidth={
                          filtrosInterativos.periodo === entry.periodoOriginal
                            ? 2
                            : 0
                        }
                        style={{ cursor: "pointer" }}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Projetos por Dia da Semana">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={dadosDiaSemana}
                onClick={(state: any) => {
                  const payload = state?.activePayload?.[0]?.payload;
                  const diaSemana = payload?.dia_semana ?? "";
                  if (!diaSemana) return;
                  toggleFiltroInterativo("diaSemana", diaSemana);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Projetos" radius={[8, 8, 0, 0]}>
                  {dadosDiaSemana.map((entry, index) => {
                    const ativo =
                      !filtrosInterativos.diaSemana ||
                      filtrosInterativos.diaSemana === entry.dia_semana;

                    return (
                      <Cell
                        key={`semana-${index}`}
                        fill="#3949ab"
                        fillOpacity={ativo ? 1 : 0.28}
                        stroke={
                          filtrosInterativos.diaSemana === entry.dia_semana
                            ? "#111827"
                            : "transparent"
                        }
                        strokeWidth={
                          filtrosInterativos.diaSemana === entry.dia_semana ? 2 : 0
                        }
                        style={{ cursor: "pointer" }}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      <section className={styles.section}>
        <ChartCard title="Projetos x Período x Projetista">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={dadosPeriodoProjetista}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis />
              <Tooltip />
              <Legend />
              {nomesProjetistas.map((nome, index) => (
                <Bar
                  key={nome}
                  dataKey={nome}
                  stackId="a"
                  fill={COLORS[index % COLORS.length]}
                  fillOpacity={
                    !filtrosInterativos.projetista ||
                    filtrosInterativos.projetista === nome
                      ? 1
                      : 0.2
                  }
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className={styles.section}>
        <div className={styles.cardsGrid}>
          <TableCard
            title="Ranking de Projetistas"
            headers={["Projetista", "Projetos"]}
            rows={dadosRankingProjetistas.map((item) => [
              item.nome,
              String(item.total),
            ])}
          />

          <TableCard
            title="Top Clientes"
            headers={["Cliente", "Projetos"]}
            rows={dadosTopClientes.map((item) => [
              item.cliente,
              String(item.total),
            ])}
          />
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  titulo,
  valor,
  compact = false,
}: {
  titulo: string;
  valor: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.kpiCard} ${compact ? styles.kpiCardCompact : ""}`}
    >
      <span className={styles.kpiLabel}>{titulo}</span>
      <strong
        className={`${styles.kpiValue} ${
          compact ? styles.kpiValueCompact : ""
        }`}
      >
        {valor}
      </strong>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.moduleCard}>
      <div className={styles.cardTop}>
        <span className={styles.cardTag}>Gráfico</span>
      </div>
      <h3 className={styles.cardTitle}>{title}</h3>
      <div className={styles.chartWrapper}>{children}</div>
    </div>
  );
}

function TableCard({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className={styles.moduleCard}>
      <div className={styles.cardTop}>
        <span className={styles.cardTag}>Tabela</span>
      </div>
      <h3 className={styles.cardTitle}>{title}</h3>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pivotarPeriodoProjetista(dados: ItemPeriodo[]) {
  const mapa = new Map<string, Record<string, string | number>>();

  dados.forEach((item) => {
    const periodoFormatado = formatarPeriodo(item.periodo);

    if (!mapa.has(periodoFormatado)) {
      mapa.set(periodoFormatado, { periodo: periodoFormatado });
    }

    const registro = mapa.get(periodoFormatado)!;
    registro[item.nome] = Number(item.total);
  });

  return Array.from(mapa.values());
}

function formatarPeriodo(periodo: string): string {
  const [ano, mes] = periodo.split("-");
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];

  const indiceMes = Number(mes) - 1;

  if (indiceMes < 0 || indiceMes > 11) return periodo;

  return `${meses[indiceMes]}/${ano}`;
}

function traduzirDiaSemana(valor: string): string {
  const mapa: Record<string, string> = {
    "0": "Dom",
    "1": "Seg",
    "2": "Ter",
    "3": "Qua",
    "4": "Qui",
    "5": "Sex",
    "6": "Sáb",
  };

  return mapa[valor] ?? valor;
}