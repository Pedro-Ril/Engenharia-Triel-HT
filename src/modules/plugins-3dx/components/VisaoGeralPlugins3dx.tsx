"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Boxes, Hourglass, ListChecks, Puzzle, RefreshCw, Server } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { buscarVisaoGeral, salvarPlugin } from "../services/plugins3dx.service";
import type {
  Ambiente3dx,
  ModoPlugin3dx,
  NoPlugin3dx,
  Plugin3dx,
  VisaoGeralPlugins3dx as VisaoGeral,
} from "../types/plugins3dx.types";
import { AMBIENTES_3DX } from "../types/plugins3dx.types";
import { AMBIENTE, formatarDataHora, formatarDataHoraCurta, MODO, NIVEL_EVENTO, nomeCurtoPlugin, rotuloNo } from "../utils/exibicao";
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

export function VisaoGeralPlugins3dx({ ambiente, onFeedback, onAbrirExecucao }: VisaoGeralProps) {
  const [dados, setDados] = useState<VisaoGeral | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mudanca, setMudanca] = useState<MudancaModo | null>(null);
  const [salvando, setSalvando] = useState(false);

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
  const ativandoProducao = mudanca?.ambiente === "PRODUCAO" && mudanca.modo === "ATIVO";

  return (
    <Stack gap={20}>
      {dados.plugins.map((plugin) => (
        <CardPlugin
          key={plugin.chave}
          plugin={plugin}
          ambientes={ambientesVisiveis}
          onMudarModo={(amb, modo) => setMudanca({ plugin, ambiente: amb, modo })}
        />
      ))}

      <Card
        title="Avisos e erros recentes"
        description="O que os plugins registraram como aviso ou erro (log técnico dos nós do 3DSpace)."
        actions={
          <Button variant="secondary" onClick={() => carregar()}>
            <RefreshCw size={15} />
            Atualizar
          </Button>
        }
      >
        {dados.eventosRecentes.length === 0 ? (
          <EmptyState icon={<Activity size={26} />} title="Nada por aqui" description="Nenhum aviso ou erro registrado." />
        ) : (
          <ul className={styles.listaEventos}>
            {dados.eventosRecentes.map((evento) => (
              <li key={evento.id} className={styles.itemEvento}>
                <span className={styles.badgeEvento}>
                  <Badge variant={NIVEL_EVENTO[evento.nivel].variante}>{NIVEL_EVENTO[evento.nivel].label}</Badge>
                </span>
                <div className={styles.mensagemEvento}>
                  <span>{evento.mensagem}</span>
                  <span className={styles.textoSecundario}>
                    {formatarDataHora(evento.criadoEm)} ·{" "}
                    {evento.ambiente ? AMBIENTE[evento.ambiente].label : "sem ambiente"} ·{" "}
                    {evento.pluginChave ? nomeCurtoPlugin(evento.pluginChave) : "núcleo"} · {rotuloNo(evento.no)}
                    {evento.execucaoId && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className={styles.link}
                          onClick={() => onAbrirExecucao(evento.execucaoId as string)}
                        >
                          ver execução
                        </button>
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
    </Stack>
  );
}

function CardPlugin({
  plugin,
  ambientes,
  onMudarModo,
}: {
  plugin: Plugin3dx;
  ambientes: Ambiente3dx[];
  onMudarModo: (ambiente: Ambiente3dx, modo: ModoPlugin3dx) => void;
}) {
  const est = plugin.estatisticas;
  const versoes = new Set(plugin.nos.map((n) => `${n.ambiente}|${n.versao}|${n.jarMd5}`));
  const porAmbiente = new Set(plugin.nos.map((n) => n.ambiente));
  /* Só faz sentido comparar versões dentro do mesmo ambiente (dev costuma estar à frente da produção). */
  const divergente = plugin.nos.length > 1 && versoes.size > porAmbiente.size;

  return (
    <Card title={plugin.nome} description={plugin.descricao ?? undefined}>
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
                <LinhaNo key={no.no} no={no} plugin={plugin} />
              ))}
            </div>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}

function LinhaNo({ no, plugin }: { no: NoPlugin3dx; plugin: Plugin3dx }) {
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
            v{no.versao ?? "?"} · núcleo {no.coreVersao ?? "?"} ·{" "}
            <span className={styles.mono}>{no.jarMd5 ? no.jarMd5.slice(0, 8) : "md5 ?"}</span> · no ar desde{" "}
            {formatarDataHora(no.iniciadoEm)}
          </span>
          {!no.ambiente && (
            <span className={styles.noErro}>
              Nó sem ambiente: plugins desligados. Informe ambiente=TESTE ou PRODUCAO em
              /App/triel/triel-plugins.properties.
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
