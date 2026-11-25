"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Boxes, Cpu, History, Hourglass, ListChecks, Puzzle, Server } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import { Tooltip } from "@/components/ui/Tooltip";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { buscarVisaoGeral, listarVersoes, salvarPlugin } from "../services/plugins3dx.service";
import type {
  Ambiente3dx,
  ModoPlugin3dx,
  NoPlugin3dx,
  Plugin3dx,
  Versao3dx,
  VisaoGeralPlugins3dx as VisaoGeral,
} from "../types/plugins3dx.types";
import { AMBIENTES_3DX } from "../types/plugins3dx.types";
import {
  AMBIENTE,
  formatarDataHora,
  formatarDataHoraCurta,
  formatarDataLancamento,
  MODO,
  rotuloNo,
  rotuloVersao,
} from "../utils/exibicao";
import { AmbienteDassault3dx, PadraoVisualizacao3dx, useVerificacaoAmbiente } from "./AmbienteDassault3dx";
import { AvisosRecentes3dx } from "./AvisosRecentes3dx";
import { HistoricoVersoesModal } from "./HistoricoVersoesModal";
import styles from "./Plugins3dx.module.css";

interface VisaoGeralProps {
  ambiente: Ambiente3dx | null;
  onFeedback: FeedbackHandler;
  onAbrirExecucao: (id: string) => void;
}

interface MudancaModo {
  plugin: Plugin3dx;
  ambiente: Ambiente3dx;
  modo: ModoPlugin3dx;
}

const MODOS: ModoPlugin3dx[] = ["DESLIGADO", "SIMULACAO", "ATIVO"];

/* Componente do núcleo comum na tabela de versões (os plugins usam a própria chave). */
const NUCLEO = "core";
/* Padrão de visualização do "Abrir com": melhoria sem plugin (sem modo nem nós), só com histórico de versões. */
const VISUALIZACAO = "visualizacao";

interface HistoricoAberto {
  titulo: string;
  componente: string;
  nos: NoPlugin3dx[];
}

/* Plugin: versão do jar do plugin; núcleo: versão do triel-3dx-core que o nó carregou. */
function versaoDoNoPara(componente: string) {
  return (no: NoPlugin3dx) => (componente === NUCLEO ? no.coreVersao : no.versao);
}

export function VisaoGeralPlugins3dx({ ambiente, onFeedback, onAbrirExecucao }: VisaoGeralProps) {
  const [dados, setDados] = useState<VisaoGeral | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mudanca, setMudanca] = useState<MudancaModo | null>(null);
  const [salvando, setSalvando] = useState(false);
  /* Notas de versão: null = indisponível (ex.: migração 0174 ainda não aplicada) -> a tela só esconde as notas. */
  const [versoes, setVersoes] = useState<Versao3dx[] | null>(null);
  const [historico, setHistorico] = useState<HistoricoAberto | null>(null);
  /* Verificação do ambiente (versão da Dassault e padrão de visualização em cada nó), repartida entre dois cards. */
  const verificacao = useVerificacaoAmbiente(onFeedback);

  /* Uma busca só (todas as notas), agrupada no cliente. Não muda com o ambiente nem a cada 30 s. */
  useEffect(() => {
    let cancelado = false;
    listarVersoes().then((resposta) => {
      if (!cancelado) setVersoes(resposta.ok && resposta.data ? resposta.data : null);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const carregar = useCallback(async () => {
    const resposta = await buscarVisaoGeral(ambiente);
    if (resposta.ok && resposta.data) {
      setDados(resposta.data);
      setErro(null);
    } else {
      setErro(resposta.message ?? "Não foi possível carregar.");
    }
    setCarregando(false);
  }, [ambiente]);

  useEffect(() => {
    let cancelado = false;
    buscarVisaoGeral(ambiente).then((resposta) => {
      if (cancelado) return;
      if (resposta.ok && resposta.data) {
        setDados(resposta.data);
        setErro(null);
      } else {
        setErro(resposta.message ?? "Não foi possível carregar.");
      }
      setCarregando(false);
    });
    /* Saúde dos nós e fila mudam sozinhas: atualiza a cada 30 s enquanto a aba está aberta. */
    const timer = setInterval(() => {
      buscarVisaoGeral(ambiente).then((resposta) => {
        if (!cancelado && resposta.ok && resposta.data) setDados(resposta.data);
      });
    }, 30_000);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [ambiente]);

  async function confirmarMudanca() {
    if (!mudanca) return;
    setSalvando(true);
    const resposta = await salvarPlugin(mudanca.plugin.chave, { ambiente: mudanca.ambiente, modo: mudanca.modo });
    setSalvando(false);
    if (resposta.ok) {
      onFeedback("success", "Modo alterado", resposta.message ?? "");
      setMudanca(null);
      await carregar();
    } else {
      onFeedback("danger", "Não foi possível alterar", resposta.message ?? "");
    }
  }

  if (carregando) return <Loader label="Carregando plugins..." />;
  if (erro || !dados) {
    return (
      <Card title="Plugins 3DX">
        <EmptyState icon={<Puzzle size={26} />} title="Não foi possível carregar" description={erro ?? ""} />
      </Card>
    );
  }

  /* Com filtro, o card mostra só o modo daquele ambiente; em "Ambos", os dois. */
  const ambientesVisiveis = ambiente ? [ambiente] : AMBIENTES_3DX;
  const versoesDe = (componente: string) => (versoes ?? []).filter((v) => v.componente === componente);
  const notaDe = (componente: string, versao: string | null) =>
    versao ? versoes?.find((v) => v.componente === componente && v.versao === versao) : undefined;
  /* Nós únicos (o mesmo nó aparece em cada plugin), para o núcleo. */
  const todosNos = [...new Map(dados.plugins.flatMap((p) => p.nos).map((no) => [no.no, no])).values()];
  const versoesNucleo = versoesDe(NUCLEO);
  const ultimaNucleo = versoesNucleo[0];
  const ativandoProducao = mudanca?.ambiente === "PRODUCAO" && mudanca.modo === "ATIVO";

  return (
    <Stack gap={20}>
      <AmbienteDassault3dx ambiente={ambiente} estado={verificacao} />

      {/* Tudo abaixo é o que a Triel-HT acrescentou ao 3DEXPERIENCE (o card acima é a infraestrutura da Dassault). */}
      <div className={styles.grupoMelhorias}>
        <h3 className={styles.tituloGrupo}>Melhorias da Triel-HT no 3DEXPERIENCE</h3>
        <p className={styles.textoGrupo}>
          <strong>Plugins</strong> rodam dentro do 3DSpace e têm modo por ambiente (Desligado, Simulação, Ativo).{" "}
          <strong>Ajustes de arquivos</strong> são aplicados por script e só precisam continuar aplicados. Depois de um
          hotfix da Dassault, confira o autoteste de cada plugin e o padrão de visualização.
        </p>
      </div>

      <PadraoVisualizacao3dx
        ambiente={ambiente}
        estado={verificacao}
        temVersoes={versoesDe(VISUALIZACAO).length > 0}
        onVerVersoes={() =>
          setHistorico({ titulo: 'Versões: padrão de visualização ("Abrir com")', componente: VISUALIZACAO, nos: [] })
        }
      />

      {dados.plugins.map((plugin) => (
        <CardPlugin
          key={plugin.chave}
          plugin={plugin}
          ambientes={ambientesVisiveis}
          temVersoes={versoesDe(plugin.chave).length > 0}
          notaDe={notaDe}
          onMudarModo={(amb, modo) => setMudanca({ plugin, ambiente: amb, modo })}
          onVerVersoes={() => setHistorico({ titulo: `Versões: ${plugin.nome}`, componente: plugin.chave, nos: plugin.nos })}
        />
      ))}

      {ultimaNucleo && (
        <Card
          title="Núcleo comum"
          description="triel-3dx-core: a base que os três plugins usam (fila, configuração vinda do Portal, registro e heartbeat)."
          actions={
            <Button
              variant="secondary"
              onClick={() => setHistorico({ titulo: "Versões: núcleo comum", componente: NUCLEO, nos: todosNos })}
            >
              <History size={15} />
              Versões
            </Button>
          }
        >
          <div className={styles.versaoAtual}>
            <span className={styles.noIcone} aria-hidden="true">
              <Cpu size={16} />
            </span>
            <div className={styles.noInfo}>
              <span className={styles.noNome}>
                Versão mais recente: {rotuloVersao(ultimaNucleo.versao)}
                {ultimaNucleo.lancadaEm && (
                  <span className={styles.textoSecundario}> · {formatarDataLancamento(ultimaNucleo.lancadaEm)}</span>
                )}
              </span>
              <span className={styles.notaVersao}>{ultimaNucleo.notas}</span>
              {todosNos.length > 0 && (
                <span className={styles.textoSecundario}>
                  Em uso:{" "}
                  {todosNos
                    .map(
                      (no) =>
                        `${rotuloNo(no.no).split(" · ")[0]}${no.ambiente ? ` (${AMBIENTE[no.ambiente].label})` : ""} ${
                          no.coreVersao ? rotuloVersao(no.coreVersao) : "?"
                        }`
                    )
                    .join(" · ")}
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      <AvisosRecentes3dx ambiente={ambiente} onAbrirExecucao={onAbrirExecucao} />

      <ConfirmDialog
        open={mudanca !== null}
        title={ativandoProducao ? "Ativar em produção" : "Alterar o modo do plugin"}
        variant={ativandoProducao ? "danger" : mudanca?.modo === "ATIVO" ? "warning" : "default"}
        message={
          mudanca && (
            <>
              <strong>{mudanca.plugin.nome}</strong> em <strong>{AMBIENTE[mudanca.ambiente].label}</strong>:{" "}
              {MODO[mudanca.plugin.ambientes[mudanca.ambiente].modo].label} → {MODO[mudanca.modo].label}.
              <br />
              {MODO[mudanca.modo].descricao} Os nós do 3DSpace de {AMBIENTE[mudanca.ambiente].label.toLowerCase()}{" "}
              aplicam em até 1 minuto, sem reiniciar.
              {ativandoProducao && (
                <>
                  <br />
                  <strong>A partir daí o plugin altera o 3DEXPERIENCE de produção.</strong>
                </>
              )}
            </>
          )
        }
        confirmLabel={ativandoProducao ? "Ativar em produção" : "Alterar"}
        loading={salvando}
        onConfirm={confirmarMudanca}
        onClose={() => setMudanca(null)}
      />

      <HistoricoVersoesModal
        titulo={historico?.titulo ?? null}
        versoes={historico ? versoesDe(historico.componente) : []}
        nos={historico?.nos ?? []}
        versaoDoNo={versaoDoNoPara(historico?.componente ?? NUCLEO)}
        onClose={() => setHistorico(null)}
      />
    </Stack>
  );
}

function CardPlugin({
  plugin,
  ambientes,
  temVersoes,
  notaDe,
  onMudarModo,
  onVerVersoes,
}: {
  plugin: Plugin3dx;
  ambientes: Ambiente3dx[];
  temVersoes: boolean;
  notaDe: (componente: string, versao: string | null) => Versao3dx | undefined;
  onMudarModo: (ambiente: Ambiente3dx, modo: ModoPlugin3dx) => void;
  onVerVersoes: () => void;
}) {
  const est = plugin.estatisticas;
  const versoes = new Set(plugin.nos.map((n) => `${n.ambiente}|${n.versao}|${n.jarMd5}`));
  const porAmbiente = new Set(plugin.nos.map((n) => n.ambiente));
  /* Só faz sentido comparar versões dentro do mesmo ambiente (dev costuma estar à frente da produção). */
  const divergente = plugin.nos.length > 1 && versoes.size > porAmbiente.size;

  return (
    <Card
      title={plugin.nome}
      description={plugin.descricao ?? undefined}
      actions={
        temVersoes ? (
          <Button variant="secondary" onClick={onVerVersoes}>
            <History size={15} />
            Versões
          </Button>
        ) : undefined
      }
    >
      <Stack gap={16}>
        <div className={styles.modosAmbiente}>
          {ambientes.map((amb) => {
            const config = plugin.ambientes[amb];
            return (
              <div key={amb} className={styles.linhaModo}>
                <div className={styles.ambienteInfo}>
                  <span className={styles.ambienteNome}>
                    <span className={styles[`ponto_${amb}`]} aria-hidden="true" />
                    {AMBIENTE[amb].label}
                  </span>
                  <span
                    className={styles.textoSecundario}
                    title={
                      config.atualizadoEm
                        ? `Alterado por ${config.atualizadoPorNome ?? "—"} em ${formatarDataHora(config.atualizadoEm)}`
                        : undefined
                    }
                  >
                    {config.atualizadoEm
                      ? `${config.atualizadoPorNome ?? "—"} · ${formatarDataHoraCurta(config.atualizadoEm)}`
                      : "sem alteração pela tela"}
                  </span>
                </div>
                <div
                  className={styles.grupoOpcoes}
                  role="group"
                  aria-label={`Modo de ${plugin.nome} em ${AMBIENTE[amb].label}`}
                >
                  {MODOS.map((modo) => (
                    <button
                      key={modo}
                      type="button"
                      className={`${styles.opcao} ${config.modo === modo ? styles[`modoAtivo_${modo}`] : ""}`}
                      disabled={config.modo === modo}
                      aria-pressed={config.modo === modo}
                      title={MODO[modo].descricao}
                      onClick={() => onMudarModo(amb, modo)}
                    >
                      {MODO[modo].label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.estatisticas}>
          <StatCard
            label="Execuções 24 h"
            value={est.execucoes24h}
            description={`${est.execucoes7d} em 7 dias`}
            icon={<ListChecks size={18} />}
          />
          <StatCard
            label="Objetos tratados 24 h"
            value={est.itens24h}
            description={`${est.itens7d} em 7 dias`}
            icon={<Boxes size={18} />}
          />
          <StatCard
            label="Falhas 24 h"
            value={est.falhas24h}
            description={`${est.falhas7d} em 7 dias`}
            variant={est.falhas24h > 0 ? "danger" : "neutral"}
            icon={<AlertTriangle size={18} />}
          />
          <StatCard
            label="Na fila"
            value={est.pendentes}
            description={est.ultimaExecucaoEm ? `última: ${formatarDataHora(est.ultimaExecucaoEm)}` : "sem execução"}
            variant={est.pendentes > 20 ? "warning" : "neutral"}
            icon={<Hourglass size={18} />}
          />
        </div>

        <Stack gap={8}>
          <h4 className={styles.tituloSecao}>
            Nós do 3DSpace {divergente && <Badge variant="warning">versões diferentes entre os nós</Badge>}
          </h4>
          {plugin.nos.length === 0 ? (
            <span className={styles.textoSecundario}>
              Nenhum nó informou presença ainda (plugin não instalado ou sem acesso ao banco).
            </span>
          ) : (
            <div className={styles.nos}>
              {plugin.nos.map((no) => (
                <LinhaNo
                  key={no.no}
                  no={no}
                  plugin={plugin}
                  notaPlugin={notaDe(plugin.chave, no.versao)}
                  notaNucleo={notaDe(NUCLEO, no.coreVersao)}
                />
              ))}
            </div>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}

/* Versão com a nota no tooltip; sem nota (ou notas indisponíveis), só o texto. */
function VersaoComNota({ texto, nota }: { texto: string; nota: Versao3dx | undefined }) {
  if (!nota) return <>{texto}</>;
  return (
    <Tooltip
      content={
        <>
          <strong>{rotuloVersao(nota.versao)}</strong>
          {nota.lancadaEm && ` · ${formatarDataLancamento(nota.lancadaEm)}`}
          <br />
          {nota.notas}
        </>
      }
    >
      <span className={styles.versaoComNota} tabIndex={0}>
        {texto}
      </span>
    </Tooltip>
  );
}

function LinhaNo({
  no,
  plugin,
  notaPlugin,
  notaNucleo,
}: {
  no: NoPlugin3dx;
  plugin: Plugin3dx;
  notaPlugin: Versao3dx | undefined;
  notaNucleo: Versao3dx | undefined;
}) {
  /* Nó sem ambiente desliga todos os plugins (fail-safe do núcleo): o esperado nele é DESLIGADO. */
  const modoEsperado = no.ambiente ? plugin.ambientes[no.ambiente].modo : "DESLIGADO";

  return (
    <div className={styles.no}>
      <div className={styles.noIdentificacao}>
        <span className={styles.noIcone} aria-hidden="true">
          <Server size={16} />
        </span>
        <div className={styles.noInfo}>
          <span className={styles.noNome}>{rotuloNo(no.no)}</span>
          <span className={styles.textoSecundario}>
            <VersaoComNota texto={`v${no.versao ?? "?"}`} nota={notaPlugin} /> ·{" "}
            <VersaoComNota texto={`núcleo ${no.coreVersao ?? "?"}`} nota={notaNucleo} /> ·{" "}
            <span className={styles.mono}>{no.jarMd5 ? no.jarMd5.slice(0, 8) : "md5 ?"}</span> · no ar desde{" "}
            {formatarDataHora(no.iniciadoEm)}
          </span>
          {!no.ambiente && (
            <span className={styles.noErro}>
              Nó sem ambiente: plugins desligados. Informe ambiente=TESTE ou PRODUCAO em
              /App/triel/triel-plugins.properties.
            </span>
          )}
          {no.autoteste === "falha" && (
            <span className={styles.noErro}>
              Autoteste falhou: o 3DSpace não tem mais{" "}
              {no.autotesteDetalhe ? <span className={styles.mono}>{no.autotesteDetalhe}</span> : "partes que o plugin usa"}
              . O plugin vai falhar até ser ajustado para esta versão da Dassault.
            </span>
          )}
          {no.ultimoErro && (
            <span className={styles.noErro}>
              Último erro ({formatarDataHora(no.ultimoErroEm)}): {no.ultimoErro}
            </span>
          )}
        </div>
      </div>
      <div className={styles.noStatus}>
        {no.ambiente ? (
          <Badge variant={AMBIENTE[no.ambiente].variante}>{AMBIENTE[no.ambiente].label}</Badge>
        ) : (
          <Badge variant="danger">Sem ambiente</Badge>
        )}
        {no.autoteste === "ok" && (
          <Badge variant="success" title="As partes internas da Dassault que o plugin usa existem neste 3DSpace.">
            Autoteste OK
          </Badge>
        )}
        {no.autoteste === "falha" && <Badge variant="danger">Autoteste falhou</Badge>}
        {no.modoEmUso && no.modoEmUso !== modoEsperado && (
          <Badge variant="warning">usando {MODO[no.modoEmUso].label}</Badge>
        )}
        <Badge variant={no.atrasado ? "danger" : "success"}>
          {no.atrasado ? "Sem contato" : "Online"} · {formatarDataHora(no.ultimoContato)}
        </Badge>
      </div>
    </div>
  );
}
