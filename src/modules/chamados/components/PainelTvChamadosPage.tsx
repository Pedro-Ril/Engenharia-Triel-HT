"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlarmClock,
  CheckCircle2,
  CircleCheckBig,
  Clock3,
  Flame,
  Inbox,
  Loader,
  PartyPopper,
  UserX,
} from "lucide-react";
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
import {
  CabecalhoPainel,
  EstadoPainel,
  MolduraEscalavel,
  truncarNome,
  usePainelDados,
  usePainelTv,
} from "@/modules/estoque-equipamentos-usados/components/PainelBiPartes";
import estiloBi from "@/modules/estoque-equipamentos-usados/components/PainelBiEstoquePage.module.css";
import { PalcoRodizio, useRodizio } from "@/modules/estoque-equipamentos-usados/components/RodizioPaginas";

import { buscarPainelTvChamados } from "../services/chamados.service";
import type { ChamadoTv, PainelTvChamados, PrioridadeChamado, StatusChamado } from "../types/chamados.types";
import { PRIORIDADE_LABELS, STATUS_LABELS } from "./ChamadoBadges";
import styles from "./PainelTvChamados.module.css";

/*
 * BI de chamados para a TV da sala -- mesmo padrão do BI de Equipamentos
 * Usados: moldura que escala para a tela, cabeçalho com relógio, rodízio
 * de páginas (resumo + tabela de chamados em aberto) e atualização a cada
 * minuto. URL: ?setor=<id> (um setor só), ?tempo=60 (segundos por
 * página), ?linhas=12 (linhas por página da tabela), ?rodizio=0 (fica no
 * resumo), ?fullscreen=1 (sem o menu do portal).
 */

const TEMPO_PADRAO_S = 60;
/* 10 linhas de duas alturas cabem na base 1920x1080 com folga (TV 16:10 tem ainda mais espaço). */
const LINHAS_PADRAO = 10;
/* Com poucas categorias/atendentes a barra não vira um bloco. */
const ESPESSURA_MAXIMA_BARRA = 46;

/* Cores dos gráficos (exceção do CLAUDE.md: séries de gráfico podem ser hex). */
const COR_PRIORIDADE: Record<PrioridadeChamado, string> = {
  urgente: "#dc2626",
  alta: "#ea580c",
  media: "#2563eb",
  baixa: "#64748b",
};

const COR_STATUS: Record<StatusChamado, string> = {
  aberto: "#2563eb",
  em_andamento: "#ea580c",
  aguardando_confirmacao: "#d97706",
  resolvido: "#16a34a",
  fechado: "#64748b",
};

const ORDEM_PRIORIDADE: PrioridadeChamado[] = ["urgente", "alta", "media", "baixa"];

const COR_ABERTOS = "#b71c1c";
const COR_RESOLVIDOS = "#16a34a";
const COR_SEM_ATENDENTE = "#d97706";

type Pagina = { tipo: "resumo" } | { tipo: "tabela"; linhas: ChamadoTv[]; pagina: number; total: number };

/* "45 min", "3h 20min", "2d 4h". */
function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    return resto ? `${horas}h ${resto}min` : `${horas}h`;
  }
  const dias = Math.floor(horas / 24);
  const restoHoras = horas % 24;
  return restoHoras ? `${dias}d ${restoHoras}h` : `${dias}d`;
}

/* Quanto tempo o chamado está esperando: até 4h normal, até 24h atenção, depois crítico. */
function classeTempo(minutos: number): string {
  if (minutos >= 24 * 60) return styles.tempoCritico;
  if (minutos >= 4 * 60) return styles.tempoAtencao;
  return styles.tempoOk;
}

function haQuanto(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return `há ${formatarDuracao(minutos)}`;
}

function formatarHoras(horas: number | null): string {
  if (horas === null) return "—";
  if (horas < 24) return `${horas.toFixed(1).replace(".", ",")} h`;
  return `${(horas / 24).toFixed(1).replace(".", ",")} d`;
}

function PillPrioridade({ prioridade }: { prioridade: PrioridadeChamado }) {
  return (
    <span className={`${styles.pill} ${styles[`prioridade_${prioridade}`]}`}>
      {PRIORIDADE_LABELS[prioridade].label}
    </span>
  );
}

function Kpi({
  icone,
  rotulo,
  valor,
  destaque,
}: {
  icone: ReactNode;
  rotulo: string;
  valor: string;
  destaque?: "alerta" | "perigo" | "sucesso";
}) {
  const classe =
    destaque === "perigo"
      ? styles.kpiPerigo
      : destaque === "alerta"
        ? styles.kpiAlerta
        : destaque === "sucesso"
          ? styles.kpiSucesso
          : "";

  return (
    <div className={`${styles.kpi} ${classe}`}>
      <div className={styles.kpiIcone}>{icone}</div>
      <div className={styles.kpiTextos}>
        <span className={styles.kpiValor}>{valor}</span>
        <span className={styles.kpiRotulo}>{rotulo}</span>
      </div>
    </div>
  );
}

function PaginaResumo({ dados }: { dados: PainelTvChamados }) {
  const { totais } = dados;

  const dadosPrioridade = ORDEM_PRIORIDADE.map((prioridade) => ({
    prioridade,
    label: PRIORIDADE_LABELS[prioridade].label,
    total: dados.porPrioridade.find((item) => item.prioridade === prioridade)?.total ?? 0,
  }));
  const totalPrioridade = dadosPrioridade.reduce((soma, item) => soma + item.total, 0);

  const dadosDia = dados.porDia.map((item) => ({
    ...item,
    rotulo: `${item.dia.slice(8, 10)}/${item.dia.slice(5, 7)}`,
  }));

  return (
    <>
      <div className={styles.kpiRow}>
        <Kpi icone={<Inbox size={24} />} rotulo="Em aberto" valor={String(totais.emAberto)} />
        <Kpi
          icone={<UserX size={24} />}
          rotulo="Sem atendente"
          valor={String(totais.semAtendente)}
          destaque={totais.semAtendente > 0 ? "perigo" : "sucesso"}
        />
        <Kpi
          icone={<Flame size={24} />}
          rotulo="Urgentes em aberto"
          valor={String(totais.urgentesEmAberto)}
          destaque={totais.urgentesEmAberto > 0 ? "alerta" : undefined}
        />
        <Kpi icone={<Loader size={24} />} rotulo="Em andamento" valor={String(totais.emAndamento)} />
        <Kpi icone={<AlarmClock size={24} />} rotulo="Aguardando confirmação" valor={String(totais.aguardandoConfirmacao)} />
        <Kpi icone={<Inbox size={24} />} rotulo="Abertos hoje" valor={String(totais.abertosHoje)} />
        <Kpi
          icone={<CheckCircle2 size={24} />}
          rotulo="Resolvidos hoje"
          valor={String(totais.resolvidosHoje)}
          destaque={totais.resolvidosHoje > 0 ? "sucesso" : undefined}
        />
        <Kpi
          icone={<Clock3 size={24} />}
          rotulo="Tempo médio (30 dias)"
          valor={formatarHoras(totais.tempoMedioResolucaoHoras)}
        />
      </div>

      <div className={estiloBi.chartsGrid}>
        <div className={`${estiloBi.tile} ${dados.aguardandoAtendente.length > 0 ? styles.tileDestaque : ""}`}>
          <div className={styles.tituloLinha}>
            <h2 className={estiloBi.tileTitulo}>Aguardando atendente</h2>
            {totais.semAtendente > 0 && <span className={styles.contagem}>{totais.semAtendente}</span>}
          </div>
          {dados.aguardandoAtendente.length === 0 ? (
            <div className={styles.vazioOk}>
              <PartyPopper size={44} />
              Tudo em dia: nenhum chamado esperando atendente.
            </div>
          ) : (
            <div className={styles.lista}>
              {dados.aguardandoAtendente.map((chamado) => (
                <div key={chamado.numero} className={styles.esperaLinha}>
                  <span className={styles.numero}>#{chamado.numero}</span>
                  <div className={styles.textos}>
                    <span className={styles.titulo}>{chamado.titulo}</span>
                    <span className={styles.sub}>
                      {chamado.solicitanteNome} · {chamado.categoriaNome ?? chamado.setorNome}
                    </span>
                  </div>
                  <div className={styles.espera}>
                    <span className={`${styles.tempo} ${classeTempo(chamado.minutosAberto)}`}>
                      {formatarDuracao(chamado.minutosAberto)}
                    </span>
                    <PillPrioridade prioridade={chamado.prioridade} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={estiloBi.tile}>
          <h2 className={estiloBi.tileTitulo}>Abertos x resolvidos — últimos 30 dias</h2>
          <div className={estiloBi.tileCorpoSemLegenda}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosDia} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="rotulo" stroke="var(--text-muted)" fontSize={12} interval="preserveStartEnd" minTickGap={18} />
                <YAxis allowDecimals={false} stroke="var(--text-muted)" fontSize={12} />
                <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="abertos" name="Abertos" fill={COR_ABERTOS} radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolvidos" name="Resolvidos" fill={COR_RESOLVIDOS} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={estiloBi.tile}>
          <h2 className={estiloBi.tileTitulo}>Em aberto por prioridade</h2>
          {totalPrioridade === 0 ? (
            <p className={styles.vazio}>Nenhum chamado em aberto.</p>
          ) : (
            <div className={estiloBi.tileCorpo}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dadosPrioridade} dataKey="total" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                    {dadosPrioridade.map((item) => (
                      <Cell key={item.prioridade} fill={COR_PRIORIDADE[item.prioridade]} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
                </PieChart>
              </ResponsiveContainer>
              <ul className={estiloBi.legenda}>
                {dadosPrioridade.map((item) => (
                  <li key={item.prioridade}>
                    <span className={estiloBi.legendaPonto} style={{ background: COR_PRIORIDADE[item.prioridade] }} />
                    <span className={estiloBi.legendaLabel}>{item.label}</span>
                    <strong className={styles.legendaTotal}>{item.total}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={estiloBi.tile}>
          <h2 className={estiloBi.tileTitulo}>Em aberto por categoria</h2>
          {dados.porCategoria.length === 0 ? (
            <p className={styles.vazio}>Nenhum chamado em aberto.</p>
          ) : (
            <div className={estiloBi.tileCorpoSemLegenda}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados.porCategoria} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} stroke="var(--text-muted)" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="categoria"
                    width={150}
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickFormatter={(valor: string) => truncarNome(valor, 22)}
                  />
                  <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
                  <Bar
                    dataKey="total"
                    name="Chamados"
                    fill="var(--primary)"
                    radius={[0, 6, 6, 0]}
                    maxBarSize={ESPESSURA_MAXIMA_BARRA}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={estiloBi.tile}>
          <h2 className={estiloBi.tileTitulo}>Em aberto por atendente</h2>
          {dados.porAtendente.length === 0 ? (
            <p className={styles.vazio}>Nenhum chamado em aberto.</p>
          ) : (
            <div className={estiloBi.tileCorpoSemLegenda}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados.porAtendente} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} stroke="var(--text-muted)" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="atendente"
                    width={150}
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickFormatter={(valor: string) => truncarNome(valor, 22)}
                  />
                  <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
                  <Bar dataKey="total" name="Chamados" radius={[0, 6, 6, 0]} maxBarSize={ESPESSURA_MAXIMA_BARRA}>
                    {dados.porAtendente.map((item) => (
                      <Cell
                        key={item.atendente}
                        fill={item.atendente === "Sem atendente" ? COR_SEM_ATENDENTE : "#3949ab"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={estiloBi.tile}>
          <h2 className={estiloBi.tileTitulo}>Resolvidos recentemente</h2>
          {dados.resolvidosRecentes.length === 0 ? (
            <p className={styles.vazio}>Nenhum chamado resolvido ainda.</p>
          ) : (
            <div className={styles.lista}>
              {dados.resolvidosRecentes.map((chamado) => (
                <div key={chamado.numero} className={styles.resolvidoLinha}>
                  <CircleCheckBig size={18} className={styles.resolvidoIcone} />
                  <span className={styles.numero}>#{chamado.numero}</span>
                  <div className={styles.textos}>
                    <span className={styles.titulo}>{chamado.titulo}</span>
                    <span className={styles.sub}>{chamado.atendenteNome ?? "—"}</span>
                  </div>
                  <span className={styles.quando}>{haQuanto(chamado.resolvidoEm)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className={estiloBi.footer}>
        Atualizado às {new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR")} · atualiza a cada minuto
      </footer>
    </>
  );
}

function PaginaTabela({ pagina, totalEmAberto }: { pagina: Extract<Pagina, { tipo: "tabela" }>; totalEmAberto: number }) {
  return (
    <section className={styles.cartao}>
      <header className={styles.cartaoTopo}>
        <h2 className={styles.cartaoTitulo}>Chamados em aberto</h2>
        <span className={styles.cartaoResumo}>
          {totalEmAberto} {totalEmAberto === 1 ? "chamado" : "chamados"}
          {pagina.total > 1 && ` · página ${pagina.pagina} de ${pagina.total}`} · sem atendente primeiro
        </span>
      </header>

      <div className={styles.tabelaArea}>
        <table className={styles.tabela}>
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Chamado</th>
              <th>Solicitante</th>
              <th>Atendente</th>
              <th>Prioridade</th>
              <th>Status</th>
              <th>Aberto há</th>
            </tr>
          </thead>
          <tbody>
            {pagina.linhas.map((chamado) => (
              <tr key={chamado.numero} className={chamado.atendenteNome ? undefined : styles.linhaSemAtendente}>
                <td className={styles.celulaNumero}>#{chamado.numero}</td>
                <td>
                  <span className={styles.celulaTitulo}>{chamado.titulo}</span>
                  <span className={styles.celulaSub}>
                    {chamado.setorNome}
                    {chamado.categoriaNome ? ` · ${chamado.categoriaNome}` : ""}
                  </span>
                </td>
                <td>
                  {chamado.solicitanteNome}
                  <span className={styles.celulaSub}>{chamado.solicitanteDepartamento ?? "—"}</span>
                </td>
                <td>
                  {chamado.atendenteNome ?? (
                    <span className={styles.semAtendente}>
                      <UserX size={16} /> Sem atendente
                    </span>
                  )}
                </td>
                <td>
                  <PillPrioridade prioridade={chamado.prioridade} />
                </td>
                <td>
                  <span className={styles.status}>
                    <span className={styles.statusPonto} style={{ background: COR_STATUS[chamado.status] }} />
                    {STATUS_LABELS[chamado.status].label}
                  </span>
                </td>
                <td className={`${styles.tempo} ${classeTempo(chamado.minutosAberto)}`}>
                  {formatarDuracao(chamado.minutosAberto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PainelTvChamadosPage() {
  const searchParams = useSearchParams();
  const tv = usePainelTv();

  const setor = searchParams.get("setor");
  const comTabela = searchParams.get("rodizio") !== "0";
  const tempoUrl = Number(searchParams.get("tempo"));
  const tempoS = Number.isFinite(tempoUrl) && tempoUrl >= 10 && tempoUrl <= 900 ? tempoUrl : TEMPO_PADRAO_S;
  const linhasUrl = Number(searchParams.get("linhas"));
  const linhasPorPagina = Number.isInteger(linhasUrl) && linhasUrl >= 4 && linhasUrl <= 25 ? linhasUrl : LINHAS_PADRAO;

  const buscar = useCallback(async () => {
    try {
      const resultado = await buscarPainelTvChamados(setor);
      return resultado.ok && resultado.data
        ? { ok: true, data: resultado.data }
        : { ok: false, message: resultado.message ?? "Não foi possível carregar o painel." };
    } catch {
      return { ok: false, message: "Sem conexão com o Portal." };
    }
  }, [setor]);
  const { dados, erro } = usePainelDados(buscar);

  const paginas = useMemo<Pagina[]>(() => {
    if (!dados) return [];
    if (!comTabela || dados.emAberto.length === 0) return [{ tipo: "resumo" }];

    const total = Math.ceil(dados.emAberto.length / linhasPorPagina);
    const tabelas: Pagina[] = Array.from({ length: total }, (_, indice) => ({
      tipo: "tabela",
      linhas: dados.emAberto.slice(indice * linhasPorPagina, (indice + 1) * linhasPorPagina),
      pagina: indice + 1,
      total,
    }));
    return [{ tipo: "resumo" }, ...tabelas];
  }, [dados, comTabela, linhasPorPagina]);

  const rodizio = useRodizio(paginas.length, tempoS);

  if (!dados || paginas.length === 0) return <EstadoPainel erro={erro} />;

  const { indice, contador } = rodizio;
  const pagina = paginas[indice];
  const tituloPagina = pagina.tipo === "resumo" ? "Resumo" : "Chamados em aberto";

  const indicador = paginas.length > 1 && (
    <div className={estiloBi.paginaIndicador} aria-live="polite">
      <span className={estiloBi.paginaNumero}>
        {indice + 1}/{paginas.length}
      </span>
      <span className={estiloBi.paginaTitulo}>{tituloPagina}</span>
      <span className={estiloBi.paginaProgressoFundo}>
        <span key={contador} className={estiloBi.paginaProgresso} style={{ animationDuration: `${tempoS}s` }} />
      </span>
    </div>
  );

  return (
    <MolduraEscalavel>
      <div className={estiloBi.painel}>
        <CabecalhoPainel
          tv={tv}
          subtitulo={`Central de Chamados · ${dados.setorNome ?? "Todos os setores"}`}
          extra={indicador}
        />
        <PalcoRodizio
          rodizio={rodizio}
          renderPagina={(i) => {
            const p = paginas[i];
            return p.tipo === "resumo" ? (
              <PaginaResumo dados={dados} />
            ) : (
              <PaginaTabela pagina={p} totalEmAberto={dados.emAbertoTotal} />
            );
          }}
        />
      </div>
    </MolduraEscalavel>
  );
}
