"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  FileWarning,
  HandCoins,
  Handshake,
  Maximize2,
  Minimize2,
  PackageCheck,
  PackageX,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";

import { TOOLTIP_GRAFICO_TEMA } from "@/lib/tema/tooltip-grafico";

import { buscarPainelBiEstoque } from "../services/estoque.service";
import type {
  PainelBiEstoque,
  StatusEquipamento,
  TipoAcaoMovimentacao,
} from "../types/estoque.types";
import styles from "./PainelBiEstoquePage.module.css";

const INTERVALO_ATUALIZACAO_MS = 60_000;
const INTERVALO_RELOGIO_MS = 1_000;

const ORDEM_STATUS: StatusEquipamento[] = ["em_estoque", "emprestado", "consignado", "baixado"];

const STATUS_LABEL: Record<StatusEquipamento, string> = {
  em_estoque: "Em estoque",
  emprestado: "Emprestado",
  consignado: "Consignado",
  baixado: "Baixado",
};

const STATUS_COR: Record<StatusEquipamento, string> = {
  em_estoque: "#16a34a",
  emprestado: "#d97706",
  consignado: "#2563eb",
  baixado: "#64748b",
};

/*
 * Só pro grafico "por cliente" — esse so tem 2 estados possiveis
 * (emprestado/consignado, nunca em_estoque/baixado), entao usa um par
 * verde/azul dedicado em vez do STATUS_COR acima (que usa laranja pra
 * emprestado, pensado pro grafico de status com os 4 estados juntos).
 */
const COR_CLIENTE_EMPRESTADO = "#16a34a";
const COR_CLIENTE_CONSIGNADO = "#2563eb";

const ACAO_LABEL: Record<TipoAcaoMovimentacao, string> = {
  entrada: "Entrada",
  emprestimo: "Empréstimo",
  consignacao: "Consignação",
  retorno: "Retorno",
  baixa: "Baixa",
  nf_vinculada: "NF vinculada",
};

const ACAO_COR: Record<TipoAcaoMovimentacao, string> = {
  entrada: "#16a34a",
  emprestimo: "#d97706",
  consignacao: "#2563eb",
  retorno: "#0d9488",
  baixa: "#64748b",
  nf_vinculada: "#7c3aed",
};

const MESES_ABREV = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatarMesAbrev(mesIso: string): string {
  const [ano, mes] = mesIso.split("-");
  const indice = Number(mes) - 1;
  const nome = MESES_ABREV[indice] ?? mesIso;
  return `${nome}/${ano.slice(2)}`;
}

function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

const FORMATADOR_MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const FORMATADOR_MOEDA_COMPACTA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

function truncarNome(nome: string, tamanho: number): string {
  return nome.length > tamanho ? `${nome.slice(0, tamanho - 1)}…` : nome;
}

interface KpiTileProps {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  destaque?: "neutro" | "alerta";
}

function KpiTile({ icone, rotulo, valor, destaque = "neutro" }: KpiTileProps) {
  return (
    <div className={`${styles.kpiTile} ${destaque === "alerta" ? styles.kpiTileAlerta : ""}`}>
      <div className={styles.kpiIcone}>{icone}</div>
      <div className={styles.kpiTextos}>
        <span className={styles.kpiValor}>{valor}</span>
        <span className={styles.kpiRotulo}>{rotulo}</span>
      </div>
    </div>
  );
}

export function PainelBiEstoquePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dados, setDados] = useState<PainelBiEstoque | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  /*
   * Inicializa lendo o estado real do DOM (não sempre `false`) porque
   * entrar em tela cheia dispara router.replace (ver efeito abaixo) pra
   * somar/tirar "?fullscreen=1" da URL — isso muda a árvore do AppShell
   * de <PainelPortal>{children}</PainelPortal> pra {children} bruto (ver
   * ROTAS_COM_TELA_CHEIA em AppShell.tsx), uma estrutura diferente o
   * bastante pra React desmontar e remontar esta página inteira. Sem
   * ler o DOM aqui, o remonte resetaria emTelaCheia pra false mesmo já
   * estando em tela cheia, e nenhum novo evento fullscreenchange
   * dispara depois disso pra corrigir — o botão ficava preso em "Entrar
   * em tela cheia".
   */
  const [emTelaCheia, setEmTelaCheia] = useState(
    () => typeof document !== "undefined" && Boolean(document.fullscreenElement)
  );
  const primeiraCargaFeita = useRef(false);

  const buscarDados = useCallback(async () => {
    const resultado = await buscarPainelBiEstoque();
    if (resultado.ok && resultado.data) {
      setDados(resultado.data);
      setErro(null);
    } else if (!primeiraCargaFeita.current) {
      setErro(resultado.message ?? "Não foi possível carregar o painel.");
    }
    primeiraCargaFeita.current = true;
  }, []);

  useEffect(() => {
    /*
     * Precisa buscar já na primeira renderização (a TV não pode esperar
     * um minuto inteiro com a tela vazia até o primeiro tick do
     * intervalo) — daí o setState síncrono dentro do efeito.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    buscarDados();
    const intervalo = setInterval(buscarDados, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
  }, [buscarDados]);

  useEffect(() => {
    const intervalo = setInterval(() => setAgora(new Date()), INTERVALO_RELOGIO_MS);
    return () => clearInterval(intervalo);
  }, []);

  /*
   * O menu lateral do portal some quando a URL tem "?fullscreen=1" (ver
   * ROTAS_COM_TELA_CHEIA em AppShell.tsx) — isso já cobre quem abre a
   * página com o parâmetro direto, mas o botão "Tela cheia" abaixo só
   * chama a Fullscreen API do navegador, sem tocar na URL. Sincronizar
   * os dois aqui garante que o menu também some ao entrar em tela cheia
   * pelo botão, e volte a aparecer ao sair (Esc, ou saindo pela própria
   * API) — sem isso o usuário ficaria com tela cheia mas o menu lateral
   * ainda por cima.
   */
  useEffect(() => {
    function aoMudarTelaCheia() {
      const estaCheia = Boolean(document.fullscreenElement);
      setEmTelaCheia(estaCheia);

      const parametros = new URLSearchParams(searchParams.toString());
      if (estaCheia) {
        parametros.set("fullscreen", "1");
      } else {
        parametros.delete("fullscreen");
      }
      const query = parametros.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
    document.addEventListener("fullscreenchange", aoMudarTelaCheia);
    return () => document.removeEventListener("fullscreenchange", aoMudarTelaCheia);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (searchParams.get("fullscreen") !== "1" || document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.().catch(() => {
      /* alguns navegadores exigem gesto do usuário — segue sem tela cheia */
    });
  }, [searchParams]);

  function alternarTelaCheia() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  const relogio = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dataAtual = agora.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  if (erro && !dados) {
    return (
      <div className={styles.painel}>
        <div className={styles.estadoVazio}>
          <AlertTriangle size={40} />
          <p>{erro}</p>
        </div>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className={styles.painel}>
        <div className={styles.estadoVazio}>
          <div className={styles.spinner} />
          <p>Carregando painel…</p>
        </div>
      </div>
    );
  }

  const dadosPorStatus = ORDEM_STATUS.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    quantidade: dados.porStatus.find((item) => item.status === status)?.quantidade ?? 0,
    valorTotal: dados.porStatus.find((item) => item.status === status)?.valorTotal ?? 0,
    cor: STATUS_COR[status],
  }));

  const dadosPorTipo = [...dados.porTipo].sort((a, b) => b.quantidade - a.quantidade);
  const dadosValorPorTipo = [...dados.porTipo].sort((a, b) => b.valorTotal - a.valorTotal);
  const dadosPorMes = dados.entradasPorMes.map((item) => ({
    mes: formatarMesAbrev(item.mes),
    quantidade: item.quantidade,
  }));

  const maiorClienteFora = dados.clientesComEquipamentoFora[0]?.quantidade ?? 0;

  return (
    <div className={styles.painel}>
      <header className={styles.header}>
        <div className={styles.marca}>
          <span className={styles.marcaWordmark}>TRIEL-HT</span>
          <span className={styles.marcaSubtitulo}>Estoque de Equipamentos Usados</span>
        </div>

        <div className={styles.headerDireita}>
          <div className={styles.aoVivo}>
            <span className={styles.aoVivoPulso} />
            AO VIVO
          </div>
          <div className={styles.relogioBloco}>
            <span className={styles.relogio}>{relogio}</span>
            <span className={styles.dataAtual}>{dataAtual}</span>
          </div>
          <button
            type="button"
            className={styles.botaoTelaCheia}
            onClick={alternarTelaCheia}
            aria-label={emTelaCheia ? "Sair da tela cheia" : "Entrar em tela cheia"}
            title={emTelaCheia ? "Sair da tela cheia" : "Entrar em tela cheia"}
          >
            {emTelaCheia ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </header>

      <div className={styles.kpiRow}>
        <KpiTile icone={<Boxes size={22} />} rotulo="Total de equipamentos" valor={String(dados.totalEquipamentos)} />
        <KpiTile icone={<PackageCheck size={22} />} rotulo="Em estoque" valor={String(dadosPorStatus[0].quantidade)} />
        <KpiTile icone={<HandCoins size={22} />} rotulo="Emprestados" valor={String(dadosPorStatus[1].quantidade)} />
        <KpiTile icone={<Handshake size={22} />} rotulo="Consignados" valor={String(dadosPorStatus[2].quantidade)} />
        <KpiTile icone={<PackageX size={22} />} rotulo="Baixados" valor={String(dadosPorStatus[3].quantidade)} />
        <KpiTile
          icone={<Wallet size={22} />}
          rotulo="Valor em estoque"
          valor={FORMATADOR_MOEDA_COMPACTA.format(dados.valorTotalEmEstoque)}
        />
        <KpiTile
          icone={<FileWarning size={22} />}
          rotulo="Sem NF de entrada"
          valor={String(dados.semNfEntrada)}
          destaque={dados.semNfEntrada > 0 ? "alerta" : "neutro"}
        />
        <KpiTile
          icone={<AlertTriangle size={22} />}
          rotulo="Pendências"
          valor={String(dados.pendencias)}
          destaque={dados.pendencias > 0 ? "alerta" : "neutro"}
        />
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Equipamentos por status</h2>
          <div className={styles.tileCorpo}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dadosPorStatus}
                  dataKey="quantidade"
                  nameKey="label"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                >
                  {dadosPorStatus.map((entry) => (
                    <Cell key={entry.status} fill={entry.cor} />
                  ))}
                </Pie>
                <RechartsTooltip {...TOOLTIP_GRAFICO_TEMA} />
              </PieChart>
            </ResponsiveContainer>
            <ul className={styles.legenda}>
              {dadosPorStatus.map((item) => (
                <li key={item.status}>
                  <span className={styles.legendaPonto} style={{ background: item.cor }} />
                  <span className={styles.legendaLabel}>{item.label}</span>
                  <span className={styles.legendaValor}>
                    {FORMATADOR_MOEDA_COMPACTA.format(item.valorTotal)}
                  </span>
                  <strong>{item.quantidade}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Equipamentos por tipo</h2>
          <div className={styles.tileCorpoSemLegenda}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosPorTipo} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke="var(--text-muted)" fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="tipoNome"
                  width={110}
                  stroke="var(--text-muted)"
                  fontSize={12}
                  tickFormatter={(valor: string) => truncarNome(valor, 16)}
                />
                <RechartsTooltip {...TOOLTIP_GRAFICO_TEMA} />
                <Bar dataKey="quantidade" fill="var(--primary)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Valor em estoque por tipo</h2>
          <div className={styles.tileCorpoSemLegenda}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosValorPorTipo} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--text-muted)"
                  fontSize={12}
                  tickFormatter={(valor: number) => FORMATADOR_MOEDA_COMPACTA.format(valor)}
                />
                <YAxis
                  type="category"
                  dataKey="tipoNome"
                  width={110}
                  stroke="var(--text-muted)"
                  fontSize={12}
                  tickFormatter={(valor: string) => truncarNome(valor, 16)}
                />
                <RechartsTooltip
                  {...TOOLTIP_GRAFICO_TEMA}
                  formatter={(valor) => FORMATADOR_MOEDA.format(Number(valor))}
                />
                <Bar dataKey="valorTotal" fill="#166534" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Entradas por mês</h2>
          <div className={styles.tileCorpoSemLegenda}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosPorMes} margin={{ top: 8, right: 8, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--text-muted)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--text-muted)" fontSize={12} />
                <RechartsTooltip {...TOOLTIP_GRAFICO_TEMA} />
                <Bar dataKey="quantidade" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Movimentações recentes</h2>
          <div className={styles.listaCorpo}>
            {dados.movimentacoesRecentes.length === 0 && (
              <p className={styles.listaVazia}>Nenhuma movimentação registrada ainda.</p>
            )}
            {dados.movimentacoesRecentes.map((movimentacao, indice) => (
              <div key={`${movimentacao.equipamentoId}-${indice}`} className={styles.linhaMovimentacao}>
                <span
                  className={styles.acaoPonto}
                  style={{ background: ACAO_COR[movimentacao.tipoAcao] }}
                />
                <div className={styles.linhaMovimentacaoTextos}>
                  <span className={styles.linhaMovimentacaoTitulo}>
                    Nº {movimentacao.equipamentoNumero} · {ACAO_LABEL[movimentacao.tipoAcao]}
                    {movimentacao.destinatarioNome ? ` — ${movimentacao.destinatarioNome}` : ""}
                  </span>
                  <span className={styles.linhaMovimentacaoSub}>
                    {truncarNome(movimentacao.equipamentoDescricao, 40)}
                  </span>
                </div>
                <span className={styles.linhaMovimentacaoData}>{formatarDataBr(movimentacao.dataAcao)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.tile}>
          <div className={styles.tileTituloComLegenda}>
            <h2 className={styles.tileTitulo}>Equipamentos fora do estoque, por cliente</h2>
            <div className={styles.legendaInline}>
              <span className={styles.legendaPonto} style={{ background: COR_CLIENTE_EMPRESTADO }} />
              <span className={styles.legendaLabel}>Emprestado</span>
              <span className={styles.legendaPonto} style={{ background: COR_CLIENTE_CONSIGNADO }} />
              <span className={styles.legendaLabel}>Consignado</span>
            </div>
          </div>
          <div className={styles.listaCorpo}>
            {dados.clientesComEquipamentoFora.length === 0 && (
              <p className={styles.listaVazia}>Nenhum equipamento emprestado ou consignado no momento.</p>
            )}
            {dados.clientesComEquipamentoFora.map((cliente) => (
              <div key={cliente.nomeCliente} className={styles.linhaRanking}>
                <span className={styles.linhaRankingNome}>{truncarNome(cliente.nomeCliente, 32)}</span>
                <div className={styles.linhaRankingBarraFundo}>
                  <div
                    className={styles.linhaRankingBarra}
                    style={{
                      width: `${maiorClienteFora > 0 ? (cliente.quantidadeEmprestado / maiorClienteFora) * 100 : 0}%`,
                      background: COR_CLIENTE_EMPRESTADO,
                    }}
                  />
                  <div
                    className={styles.linhaRankingBarra}
                    style={{
                      width: `${maiorClienteFora > 0 ? (cliente.quantidadeConsignado / maiorClienteFora) * 100 : 0}%`,
                      background: COR_CLIENTE_CONSIGNADO,
                    }}
                  />
                </div>
                <span className={styles.linhaRankingValor}>{cliente.quantidade}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        Atualizado às {new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR")}
      </footer>
    </div>
  );
}
