"use client";

import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Headset,
  Info,
  LogIn,
  RotateCw,
  ScrollText,
  Search,
  ServerCog,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { NumberInput } from "@/components/ui/NumberInput";
import { Pagination } from "@/components/ui/Pagination";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
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
import {
  buscarAtividadeRecente,
  buscarLogs,
  buscarResumoMonitoramento,
  limparLogsAntigos,
} from "@/modules/monitoramento/services/monitoramento.service";
import type {
  EventoAtividade,
  LogSistema,
  NivelLog,
  ResumoMonitoramento,
} from "@/modules/monitoramento/types/monitoramento.types";

import type { FeedbackHandler } from "../types/toast.types";
import styles from "./Monitoramento.module.css";

interface MonitoramentoPainelProps {
  onFeedback: FeedbackHandler;
}

type AbaMonitoramento = "geral" | "banco" | "logs";

const ABAS: { valor: AbaMonitoramento; label: string; icon: typeof ServerCog }[] = [
  { valor: "geral", label: "Visão geral", icon: ServerCog },
  { valor: "banco", label: "Banco de dados", icon: Database },
  { valor: "logs", label: "Logs", icon: ScrollText },
];

const NIVEL_CONFIG: Record<
  NivelLog,
  { label: string; badge: "neutral" | "warning" | "danger"; cor: string }
> = {
  info: { label: "Info", badge: "neutral", cor: "#3949ab" },
  aviso: { label: "Aviso", badge: "warning", cor: "#b45309" },
  erro: { label: "Erro", badge: "danger", cor: "#b71c1c" },
};

const EVENTO_CONFIG: Record<
  EventoAtividade["tipo"],
  { label: string; icon: typeof LogIn; cor: string }
> = {
  login_sucesso: { label: "Login", icon: LogIn, cor: "#166534" },
  login_falha: { label: "Falha de login", icon: XCircle, cor: "#b71c1c" },
  chamado_bloqueio_nome: { label: "Bloqueio em chamado", icon: Headset, cor: "#b45309" },
  terminal_busca_falha: { label: "Busca sem resultado", icon: Search, cor: "#6b7280" },
};

function formatarTempoRelativo(dataIso: string): string {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const diffMinutos = Math.floor(diffMs / 60000);

  if (diffMinutos < 1) return "agora há pouco";
  if (diffMinutos < 60) return `há ${diffMinutos} min`;

  const diffHoras = Math.floor(diffMinutos / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias === 1) return "ontem";
  if (diffDias < 30) return `há ${diffDias} dias`;

  return new Date(dataIso).toLocaleDateString("pt-BR");
}

function formatarDataHora(dataIso: string): string {
  return new Date(dataIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function formatarUptime(segundos: number): string {
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);

  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${minutos}min`;
  return `${minutos}min`;
}

const INTERVALO_ATUALIZACAO_MS = 20000;

export function MonitoramentoPainel({ onFeedback }: MonitoramentoPainelProps) {
  const [aba, setAba] = useState<AbaMonitoramento>("geral");

  const [resumo, setResumo] = useState<ResumoMonitoramento | null>(null);
  const [carregandoResumo, setCarregandoResumo] = useState(true);
  const [erroResumo, setErroResumo] = useState(false);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const dados = await buscarResumoMonitoramento();
      if (cancelado) return;

      if (dados) {
        setResumo(dados);
        setErroResumo(false);
        setUltimaAtualizacao(new Date());
      } else if (!resumo) {
        setErroResumo(true);
      }

      setCarregandoResumo(false);
    }

    carregar();
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stack gap={20}>
      <SegmentedTabs
        itens={ABAS.map((item) => ({
          valor: item.valor,
          label: item.label,
          icon: <item.icon size={15} />,
        }))}
        ativo={aba}
        onSelecionar={setAba}
        extra={
          ultimaAtualizacao && (
            <span className={styles.ultimaAtualizacao}>
              <RotateCw size={12} />
              Atualizado {formatarTempoRelativo(ultimaAtualizacao.toISOString())}
            </span>
          )
        }
      />

      {carregandoResumo ? (
        <Card>
          <Loader label="Carregando monitoramento..." />
        </Card>
      ) : erroResumo ? (
        <Card>
          <Alert variant="danger">Não foi possível carregar os dados de monitoramento.</Alert>
        </Card>
      ) : resumo ? (
        <>
          {aba === "geral" && <AbaVisaoGeral resumo={resumo} />}
          {aba === "banco" && <AbaBancoDeDados resumo={resumo} />}
          {aba === "logs" && <AbaLogs onFeedback={onFeedback} />}
        </>
      ) : null}
    </Stack>
  );
}

function AbaVisaoGeral({ resumo }: { resumo: ResumoMonitoramento }) {
  const { banco, sistema, logsPorNivel } = resumo;

  const dadosLogs = (Object.keys(NIVEL_CONFIG) as NivelLog[]).map((nivel) => ({
    nivel,
    label: NIVEL_CONFIG[nivel].label,
    total: logsPorNivel[nivel] ?? 0,
  }));

  return (
    <Stack gap={20}>
      <FormGrid columns={4}>
        <StatCard
          label="Conexões ativas no banco"
          value={banco.conexoesAtivas}
          icon={<Database />}
          variant="info"
        />
        <StatCard
          label="Tamanho do banco"
          value={`${banco.tamanhoBancoMB.toLocaleString("pt-BR")} MB`}
          icon={<ServerCog />}
        />
        <StatCard
          label="Memória do processo"
          value={`${sistema.memoriaUsadaMB} MB`}
          icon={<Wrench />}
        />
        <StatCard
          label="Aplicação ativa há"
          value={formatarUptime(sistema.uptimeSegundos)}
          icon={<CheckCircle2 />}
          variant="success"
        />
      </FormGrid>

      <FormGrid columns={2}>
        <Card title="Erros e avisos (últimas 24h)">
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dadosLogs}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" name="Ocorrências" radius={[8, 8, 0, 0]}>
                  {dadosLogs.map((entry) => (
                    <Cell key={entry.nivel} fill={NIVEL_CONFIG[entry.nivel].cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <AtividadeRecenteCard />
      </FormGrid>
    </Stack>
  );
}

const POR_PAGINA_ATIVIDADE = 8;

function AtividadeRecenteCard() {
  const [pagina, setPagina] = useState(1);
  const [itens, setItens] = useState<EventoAtividade[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    buscarAtividadeRecente(pagina, POR_PAGINA_ATIVIDADE).then((resultado) => {
      if (cancelado) return;

      if (resultado) {
        setItens(resultado.itens);
        setTotal(resultado.total);
      }

      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [pagina]);

  function handleMudarPagina(novaPagina: number) {
    setCarregando(true);
    setPagina(novaPagina);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_ATIVIDADE));

  return (
    <Card title="Atividade recente" description="Eventos de segurança e uso do portal.">
      <Stack gap={14}>
        {carregando ? (
          <Loader label="Carregando atividade..." />
        ) : itens.length === 0 ? (
          <EmptyState
            icon={<Info size={26} />}
            title="Nenhum evento recente"
            description="Nada relevante registrado por enquanto."
          />
        ) : (
          <div className={styles.atividadeLista}>
            {itens.map((evento, indice) => {
              const config = EVENTO_CONFIG[evento.tipo];
              const Icon = config.icon;

              return (
                <div key={indice} className={styles.atividadeItem}>
                  <span
                    className={styles.atividadeIcone}
                    style={{ color: config.cor, background: `${config.cor}1a` }}
                  >
                    <Icon size={15} />
                  </span>

                  <div className={styles.atividadeConteudo}>
                    <span className={styles.atividadeTitulo}>
                      {config.label}: {evento.titulo}
                    </span>
                    {evento.descricao && (
                      <span className={styles.atividadeDescricao}>{evento.descricao}</span>
                    )}
                  </div>

                  <span className={styles.atividadeTempo}>
                    {formatarTempoRelativo(evento.criadoEm)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <Pagination page={pagina} totalPages={totalPaginas} onPageChange={handleMudarPagina} />
      </Stack>
    </Card>
  );
}

function AbaBancoDeDados({ resumo }: { resumo: ResumoMonitoramento }) {
  const { banco } = resumo;

  const dadosTabelas = [...banco.tabelas]
    .sort((a, b) => b.tamanhoMB - a.tamanhoMB)
    .map((tabela) => ({ ...tabela, nome: tabela.nome.replace(/^portal_/, "") }));

  return (
    <Stack gap={20}>
      <FormGrid columns={2}>
        <Card title="Servidor">
          <Stack gap={10}>
            <LinhaInfo label="Servidor" valor={banco.servidor} />
            <LinhaInfo label="Banco de dados" valor={banco.banco} />
            <LinhaInfo label="Versão do SQL Server" valor={banco.versaoSqlServer} />
            <LinhaInfo label="Ativo há" valor={`${banco.horasAtivoServidor}h`} />
          </Stack>
        </Card>

        <Card title="Pool de conexões da aplicação">
          <Stack gap={10}>
            <LinhaInfo
              label="Status"
              valor={
                <Badge variant={banco.pool.saudavel ? "success" : "danger"}>
                  {banco.pool.saudavel ? "Saudável" : "Instável"}
                </Badge>
              }
            />
            <LinhaInfo label="Conexões no pool" valor={String(banco.pool.tamanho)} />
            <LinhaInfo label="Disponíveis" valor={String(banco.pool.disponiveis)} />
            <LinhaInfo label="Em uso" valor={String(banco.pool.emUso)} />
            <LinhaInfo label="Aguardando" valor={String(banco.pool.pendentes)} />
          </Stack>
        </Card>
      </FormGrid>

      <Card
        title="Tabelas do portal"
        description="As 12 maiores tabelas por espaço ocupado."
      >
        {dadosTabelas.length === 0 ? (
          <EmptyState icon={<Database size={26} />} title="Nenhum dado disponível" />
        ) : (
          <div className={styles.chartWrapper}>
            <ResponsiveContainer width="100%" height={Math.max(220, dadosTabelas.length * 34)}>
              <BarChart data={dadosTabelas} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} unit=" MB" />
                <YAxis type="category" dataKey="nome" width={160} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toLocaleString("pt-BR")} MB`, "Tamanho"]}
                />
                <Bar dataKey="tamanhoMB" name="Tamanho" fill="var(--primary)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Detalhe por tabela">
        <Table minWidth={480}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Tabela</TableHeaderCell>
              <TableHeaderCell align="center">Linhas</TableHeaderCell>
              <TableHeaderCell align="center">Tamanho</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dadosTabelas.map((tabela) => (
              <TableRow key={tabela.nome}>
                <TableCell>{tabela.nome}</TableCell>
                <TableCell align="center">{tabela.linhas.toLocaleString("pt-BR")}</TableCell>
                <TableCell align="center">{tabela.tamanhoMB.toLocaleString("pt-BR")} MB</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Stack>
  );
}

function LinhaInfo({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div className={styles.linhaInfo}>
      <span className={styles.linhaInfoLabel}>{label}</span>
      <span className={styles.linhaInfoValor}>{valor}</span>
    </div>
  );
}

const OPCOES_NIVEL = [
  { value: "", label: "Todos os níveis" },
  { value: "erro", label: "Erro" },
  { value: "aviso", label: "Aviso" },
  { value: "info", label: "Info" },
];

const POR_PAGINA_LOGS = 25;

function AbaLogs({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [nivel, setNivel] = useState("");
  const [origem, setOrigem] = useState("");
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const [itens, setItens] = useState<LogSistema[]>([]);
  const [total, setTotal] = useState(0);
  const [origens, setOrigens] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [recarregarChave, setRecarregarChave] = useState(0);

  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [diasParaManter, setDiasParaManter] = useState("30");
  const [limpando, setLimpando] = useState(false);

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setBusca(buscaDigitada);
      setPagina(1);
    }, 400);
    return () => clearTimeout(temporizador);
  }, [buscaDigitada]);

  useEffect(() => {
    let cancelado = false;

    setCarregando(true);
    buscarLogs({
      nivel: (nivel as LogSistema["nivel"]) || undefined,
      origem: origem || undefined,
      busca: busca || undefined,
      pagina,
      porPagina: POR_PAGINA_LOGS,
    }).then((resultado) => {
      if (cancelado) return;

      if (resultado) {
        setItens(resultado.itens);
        setTotal(resultado.total);
        setOrigens(resultado.origens);
      }

      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [nivel, origem, busca, pagina, recarregarChave]);

  const opcoesOrigem = [
    { value: "", label: "Todas as origens" },
    ...origens.map((item) => ({ value: item, label: item })),
  ];

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_LOGS));

  async function handleLimpar() {
    setLimpando(true);

    try {
      const resultado = await limparLogsAntigos(Number(diasParaManter) || 30);

      if (resultado.ok) {
        onFeedback(
          "success",
          "Logs antigos removidos",
          resultado.message ?? "Limpeza concluída."
        );
        setConfirmandoLimpeza(false);
        setPagina(1);
        setRecarregarChave((atual) => atual + 1);
      } else {
        onFeedback(
          "danger",
          "Não foi possível limpar os logs",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setLimpando(false);
    }
  }

  return (
    <Card
      title="Logs de sistema"
      description="Erros não tratados capturados automaticamente em qualquer rota do portal."
      actions={
        <Button variant="danger" onClick={() => setConfirmandoLimpeza(true)}>
          <Trash2 size={15} />
          Limpar antigos
        </Button>
      }
    >
      <Stack gap={16}>
        <div className={styles.filtrosLogs}>
          <div className={styles.filtroCampo}>
            <Field label="Nível">
              <Dropdown
                value={nivel}
                options={OPCOES_NIVEL}
                onValueChange={(valor) => {
                  setNivel(valor);
                  setPagina(1);
                }}
              />
            </Field>
          </div>

          <div className={styles.filtroCampo}>
            <Field label="Origem">
              <Dropdown
                value={origem}
                options={opcoesOrigem}
                onValueChange={(valor) => {
                  setOrigem(valor);
                  setPagina(1);
                }}
              />
            </Field>
          </div>

          <div className={styles.filtroCampo} style={{ flex: 1 }}>
            <Field label="Buscar">
              <Input
                value={buscaDigitada}
                placeholder="Mensagem ou caminho da rota"
                onChange={(event) => setBuscaDigitada(event.target.value)}
              />
            </Field>
          </div>
        </div>

        {carregando ? (
          <Loader label="Carregando logs..." />
        ) : itens.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={28} />}
            title="Nenhum log encontrado"
            description="Sem erros registrados para os filtros selecionados — bom sinal."
          />
        ) : (
          <>
            <Table minWidth={800}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell align="center">Nível</TableHeaderCell>
                  <TableHeaderCell>Mensagem</TableHeaderCell>
                  <TableHeaderCell>Origem</TableHeaderCell>
                  <TableHeaderCell>Quando</TableHeaderCell>
                  <TableHeaderCell align="center"> </TableHeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {itens.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        setExpandidoId((atual) => (atual === log.id ? null : log.id))
                      }
                    >
                      <TableCell align="center">
                        <Badge variant={NIVEL_CONFIG[log.nivel].badge}>
                          {NIVEL_CONFIG[log.nivel].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={styles.logMensagem}>{log.mensagem}</span>
                      </TableCell>
                      <TableCell>{log.origem}</TableCell>
                      <TableCell>{formatarDataHora(log.criadoEm)}</TableCell>
                      <TableCell align="center">
                        {expandidoId === log.id ? (
                          <ChevronDown size={15} />
                        ) : (
                          <ChevronRight size={15} />
                        )}
                      </TableCell>
                    </TableRow>

                    {expandidoId === log.id && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className={styles.logDetalhe}>
                            {(log.metodo || log.caminho) && (
                              <p>
                                <strong>Rota:</strong> {log.metodo ?? ""} {log.caminho ?? "—"}
                              </p>
                            )}
                            {log.ipOrigem && (
                              <p>
                                <strong>IP:</strong> {log.ipOrigem}
                              </p>
                            )}
                            {log.detalhes ? (
                              <pre className={styles.logStack}>{log.detalhes}</pre>
                            ) : (
                              <p className={styles.logSemDetalhe}>
                                Sem detalhes adicionais registrados.
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>

            <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
          </>
        )}
      </Stack>

      <ConfirmDialog
        open={confirmandoLimpeza}
        title="Limpar logs antigos"
        variant="warning"
        message={
          <Stack gap={12}>
            <span>Remove permanentemente os logs mais antigos que o período informado.</span>
            <Field label="Manter os últimos (dias)">
              <NumberInput
                value={diasParaManter}
                min={1}
                onChange={(event) => setDiasParaManter(event.target.value)}
              />
            </Field>
          </Stack>
        }
        confirmLabel="Limpar"
        loading={limpando}
        onClose={() => setConfirmandoLimpeza(false)}
        onConfirm={handleLimpar}
      />
    </Card>
  );
}
