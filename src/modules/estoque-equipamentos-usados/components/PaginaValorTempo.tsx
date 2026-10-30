"use client";

import { AlarmClock, CalendarClock, Handshake, HandCoins, Hourglass, PackageCheck, PackageX, Percent, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TOOLTIP_GRAFICO_TEMA } from "@/lib/tema/tooltip-grafico";

import type { PainelGerencial } from "../types/estoque.types";
import {
  ACAO_COR,
  FORMATADOR_MOEDA,
  FORMATADOR_MOEDA_COMPACTA,
  KpiTile,
  ORDEM_STATUS,
  STATUS_COR,
  STATUS_LABEL,
  formatarMesAbrev,
  truncarNome,
} from "./PainelBiPartes";
import styles from "./PainelBiEstoquePage.module.css";

function diasTexto(dias: number | null): string {
  return dias === null ? "—" : `${dias.toLocaleString("pt-BR")} d`;
}

const COR_VENDA = STATUS_COR.em_estoque;
const COR_VOLTOU = ACAO_COR.retorno;
const COR_EM_ABERTO = STATUS_COR.consignado;

/*
 * Página 2 do painel gerencial: "quanto vale e há quanto tempo". Mesmo
 * layout da página 1 e cada quadro na mesma posição do quadro que ele
 * aprofunda (status -> capital, por tipo -> aging, valor por tipo -> valor
 * fora por tipo, entradas -> fluxo, movimentações -> consignações,
 * clientes -> capital por cliente). Cores de status iguais às da página 1.
 */
export function PaginaValorTempo({ dados }: { dados: PainelGerencial }) {
  const porStatus = ORDEM_STATUS.map((status) => {
    const item = dados.valorPorStatus.find((s) => s.status === status);
    return { status, label: STATUS_LABEL[status], quantidade: item?.quantidade ?? 0, valorTotal: item?.valorTotal ?? 0, cor: STATUS_COR[status] };
  });
  const valorDo = (status: string) => porStatus.find((s) => s.status === status)?.valorTotal ?? 0;
  const fluxo = dados.fluxoPorMes.map((m) => ({ ...m, mes: formatarMesAbrev(m.mes) }));
  const consig = dados.consignacoes;
  const resultadoConsig = [
    { nome: "Viraram venda", valor: consig.viraramVenda, cor: COR_VENDA },
    { nome: "Voltaram", valor: consig.voltaram, cor: COR_VOLTOU },
    { nome: "Em aberto", valor: consig.emAberto, cor: COR_EM_ABERTO },
  ];
  const totalConsig = consig.viraramVenda + consig.voltaram + consig.emAberto;
  const maiorCliente = dados.clientesFora[0]?.valorTotal ?? 0;

  return (
    <>
      <div className={styles.kpiRow}>
        <KpiTile icone={<Wallet size={22} />} rotulo="Valor total (ativos)" valor={FORMATADOR_MOEDA_COMPACTA.format(dados.valorAtivo)} />
        <KpiTile icone={<PackageCheck size={22} />} rotulo="Em estoque" valor={FORMATADOR_MOEDA_COMPACTA.format(valorDo("em_estoque"))} />
        <KpiTile icone={<HandCoins size={22} />} rotulo="Emprestado" valor={FORMATADOR_MOEDA_COMPACTA.format(valorDo("emprestado"))} />
        <KpiTile icone={<Handshake size={22} />} rotulo="Consignado" valor={FORMATADOR_MOEDA_COMPACTA.format(valorDo("consignado"))} />
        <KpiTile icone={<PackageX size={22} />} rotulo="Baixado" valor={FORMATADOR_MOEDA_COMPACTA.format(valorDo("baixado"))} />
        <KpiTile
          icone={<Percent size={22} />}
          rotulo="Do valor está fora"
          valor={dados.percentualForaValor === null ? "—" : `${dados.percentualForaValor}%`}
        />
        <KpiTile icone={<Hourglass size={22} />} rotulo="Prazo médio fora" valor={diasTexto(dados.prazoMedioForaDias)} />
        <KpiTile
          icone={<AlarmClock size={22} />}
          rotulo={`Fora há +180 dias · ${FORMATADOR_MOEDA_COMPACTA.format(dados.acima180.valor)}`}
          valor={String(dados.acima180.quantidade)}
          destaque={dados.acima180.quantidade > 0 ? "alerta" : "neutro"}
        />
        <KpiTile
          icone={<CalendarClock size={22} />}
          rotulo={dados.maiorPrazo ? `Maior prazo · Nº ${dados.maiorPrazo.numero}` : "Maior prazo fora"}
          valor={diasTexto(dados.maiorPrazo?.dias ?? null)}
          destaque={(dados.maiorPrazo?.dias ?? 0) > 365 ? "alerta" : "neutro"}
        />
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Capital por status</h2>
          <div className={styles.tileCorpo}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={porStatus} dataKey="valorTotal" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                  {porStatus.map((item) => (
                    <Cell key={item.status} fill={item.cor} />
                  ))}
                </Pie>
                <RechartsTooltip {...TOOLTIP_GRAFICO_TEMA} formatter={(valor) => FORMATADOR_MOEDA.format(Number(valor))} />
              </PieChart>
            </ResponsiveContainer>
            <ul className={styles.legenda}>
              {porStatus.map((item) => (
                <li key={item.status}>
                  <span className={styles.legendaPonto} style={{ background: item.cor }} />
                  <span className={styles.legendaLabel}>{item.label}</span>
                  <span className={styles.legendaValor}>{item.quantidade} un.</span>
                  <strong>{FORMATADOR_MOEDA_COMPACTA.format(item.valorTotal)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Há quanto tempo está fora (valor)</h2>
          <div className={styles.tileCorpoSemLegenda}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados.aging} margin={{ top: 8, right: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="faixa" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(v: number) => FORMATADOR_MOEDA_COMPACTA.format(v)} />
                <RechartsTooltip {...TOOLTIP_GRAFICO_TEMA} formatter={(valor) => FORMATADOR_MOEDA.format(Number(valor))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="emprestado" name="Emprestado" stackId="a" fill={STATUS_COR.emprestado} />
                <Bar dataKey="consignado" name="Consignado" stackId="a" fill={STATUS_COR.consignado} />
                <Bar dataKey="em_reforma" name="Em reforma" stackId="a" fill={STATUS_COR.em_reforma} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Valor com terceiros por tipo</h2>
          <div className={styles.tileCorpoSemLegenda}>
            {dados.valorForaPorTipo.length === 0 ? (
              <p className={styles.listaVazia}>Nenhum equipamento fora do estoque.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados.valorForaPorTipo} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                  <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickFormatter={(v: number) => FORMATADOR_MOEDA_COMPACTA.format(v)} />
                  <YAxis
                    type="category"
                    dataKey="tipoNome"
                    width={110}
                    stroke="var(--text-muted)"
                    fontSize={12}
                    tickFormatter={(valor: string) => truncarNome(valor, 16)}
                  />
                  <RechartsTooltip {...TOOLTIP_GRAFICO_TEMA} formatter={(valor) => FORMATADOR_MOEDA.format(Number(valor))} />
                  <Bar dataKey="valorTotal" name="Valor" fill={STATUS_COR.consignado} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Fluxo por mês: saídas, retornos e vendas</h2>
          <div className={styles.tileCorpoSemLegenda}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fluxo} margin={{ top: 8, right: 8, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--text-muted)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--text-muted)" fontSize={12} />
                <RechartsTooltip {...TOOLTIP_GRAFICO_TEMA} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="saidas" name="Saídas" fill={STATUS_COR.consignado} radius={[4, 4, 0, 0]} />
                <Bar dataKey="retornos" name="Retornos" fill={ACAO_COR.retorno} radius={[4, 4, 0, 0]} />
                <Bar dataKey="vendas" name="Vendas" fill={ACAO_COR.baixa} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.tile}>
          <h2 className={styles.tileTitulo}>Resultado das consignações</h2>
          <div className={styles.tileCorpo}>
            {totalConsig === 0 ? (
              <p className={styles.listaVazia}>Nenhuma consignação registrada.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={resultadoConsig} dataKey="valor" nameKey="nome" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                      {resultadoConsig.map((item) => (
                        <Cell key={item.nome} fill={item.cor} />
                      ))}
                    </Pie>
                    <RechartsTooltip {...TOOLTIP_GRAFICO_TEMA} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className={styles.legenda}>
                  {resultadoConsig.map((item) => (
                    <li key={item.nome}>
                      <span className={styles.legendaPonto} style={{ background: item.cor }} />
                      <span className={styles.legendaLabel}>{item.nome}</span>
                      <span className={styles.legendaValor}>{Math.round((item.valor / totalConsig) * 100)}%</span>
                      <strong>{item.valor}</strong>
                    </li>
                  ))}
                  <li className={styles.legendaNota}>Até a venda: {diasTexto(consig.diasMedioAteVenda)} em média</li>
                  <li className={styles.legendaNota}>Até voltar: {diasTexto(consig.diasMedioAteRetorno)} em média</li>
                </ul>
              </>
            )}
          </div>
        </div>

        <div className={styles.tile}>
          <div className={styles.tileTituloComLegenda}>
            <h2 className={styles.tileTitulo}>Capital com terceiros, por cliente</h2>
            <span className={styles.legendaInline}>valor · prazo médio</span>
          </div>
          <div className={styles.listaCorpo}>
            {dados.clientesFora.length === 0 && <p className={styles.listaVazia}>Nenhum equipamento com terceiros.</p>}
            {dados.clientesFora.map((cliente) => (
              <div key={cliente.nomeCliente} className={styles.linhaRankingGerencial}>
                <span className={styles.linhaRankingNome} title={cliente.nomeCliente}>
                  {truncarNome(cliente.nomeCliente, 32)}
                </span>
                <div className={styles.linhaRankingBarraFundo}>
                  <div
                    className={styles.linhaRankingBarra}
                    style={{
                      width: `${maiorCliente > 0 ? (cliente.valorTotal / maiorCliente) * 100 : 0}%`,
                      background: STATUS_COR.consignado,
                    }}
                  />
                </div>
                <span className={styles.linhaRankingValor}>{FORMATADOR_MOEDA_COMPACTA.format(cliente.valorTotal)}</span>
                <span className={styles.linhaRankingPrazo}>{diasTexto(cliente.prazoMedioDias)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className={styles.footer}>Atualizado às {new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR")}</footer>
    </>
  );
}
