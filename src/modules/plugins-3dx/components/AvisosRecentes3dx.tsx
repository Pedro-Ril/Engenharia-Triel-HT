"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";

import { listarAvisosRecentes } from "../services/plugins3dx.service";
import type { Ambiente3dx, NivelAviso3dx, PaginaEventos3dx } from "../types/plugins3dx.types";
import { AMBIENTE, formatarDataHora, NIVEL_EVENTO, nomeCurtoPlugin, rotuloNo } from "../utils/exibicao";
import styles from "./Plugins3dx.module.css";

interface AvisosRecentesProps {
  ambiente: Ambiente3dx | null;
  onAbrirExecucao: (id: string) => void;
}

const OPCOES_NIVEL = [
  { value: "", label: "Avisos e erros" },
  { value: "erro", label: "Só erros" },
  { value: "aviso", label: "Só avisos" },
];

/*
 * Card "Avisos e erros recentes" da Visão geral: log técnico dos nós do 3DSpace, paginado no servidor (o plugin de
 * desenho grava um aviso por desenho ignorado na varredura, então o volume cresce). Atualiza sozinho a cada 30 s só
 * na primeira página -- nas outras, a lista andaria por baixo de quem está lendo.
 */
export function AvisosRecentes3dx({ ambiente, onAbrirExecucao }: AvisosRecentesProps) {
  const [nivel, setNivel] = useState<NivelAviso3dx | null>(null);
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState<PaginaEventos3dx | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  /* Trocar o ambiente do topo volta para a primeira página (ajuste durante o render, sem efeito). */
  const [ambienteAnterior, setAmbienteAnterior] = useState(ambiente);
  if (ambiente !== ambienteAnterior) {
    setAmbienteAnterior(ambiente);
    setPagina(1);
  }

  const carregar = useCallback(async () => {
    const resposta = await listarAvisosRecentes({ ambiente, nivel, pagina });
    if (resposta.ok && resposta.data) {
      setResultado(resposta.data);
      setErro(null);
    } else {
      setErro(resposta.message ?? "Não foi possível carregar os avisos.");
    }
    setCarregando(false);
  }, [ambiente, nivel, pagina]);

  useEffect(() => {
    let cancelado = false;
    listarAvisosRecentes({ ambiente, nivel, pagina }).then((resposta) => {
      if (cancelado) return;
      if (resposta.ok && resposta.data) {
        setResultado(resposta.data);
        setErro(null);
      } else {
        setErro(resposta.message ?? "Não foi possível carregar os avisos.");
      }
      setCarregando(false);
    });
    const timer =
      pagina === 1
        ? setInterval(() => {
            listarAvisosRecentes({ ambiente, nivel, pagina }).then((resposta) => {
              if (!cancelado && resposta.ok && resposta.data) setResultado(resposta.data);
            });
          }, 30_000)
        : null;
    return () => {
      cancelado = true;
      if (timer) clearInterval(timer);
    };
  }, [ambiente, nivel, pagina]);

  function trocarNivel(valor: string) {
    setNivel(valor === "erro" || valor === "aviso" ? valor : null);
    setPagina(1);
  }

  const total = resultado?.total ?? 0;
  const tamanho = resultado?.tamanhoPagina ?? 20;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
  const eventos = resultado?.eventos ?? [];
  /* A lista encolheu (limpeza de logs) com a página além do fim: volta para a última que existe. */
  if (resultado && pagina > totalPaginas) setPagina(totalPaginas);

  return (
    <Card
      title="Avisos e erros recentes"
      description="O que os plugins registraram como aviso ou erro (log técnico dos nós do 3DSpace)."
      actions={
        <div className={styles.acoesAvisos}>
          <div className={styles.filtroNivel}>
            <Dropdown value={nivel ?? ""} options={OPCOES_NIVEL} onValueChange={trocarNivel} />
          </div>
          <Button variant="secondary" onClick={() => carregar()}>
            <RefreshCw size={15} />
            Atualizar
          </Button>
        </div>
      }
    >
      {carregando ? (
        <Loader label="Carregando avisos..." />
      ) : erro ? (
        <EmptyState icon={<Activity size={26} />} title="Não foi possível carregar" description={erro} />
      ) : eventos.length === 0 ? (
        <EmptyState
          icon={<Activity size={26} />}
          title="Nada por aqui"
          description={
            nivel ? `Nenhum ${nivel === "erro" ? "erro" : "aviso"} registrado.` : "Nenhum aviso ou erro registrado."
          }
        />
      ) : (
        <Stack gap={16}>
          <ul className={styles.listaEventos}>
            {eventos.map((evento) => (
              <li key={evento.id} className={styles.itemEvento}>
                <span className={styles.badgeEvento}>
                  <Badge variant={NIVEL_EVENTO[evento.nivel].variante}>{NIVEL_EVENTO[evento.nivel].label}</Badge>
                </span>
                <div className={styles.mensagemEvento}>
                  <span>{evento.mensagem}</span>
                  <span className={styles.textoSecundario}>
                    {formatarDataHora(evento.criadoEm)} ·{" "}
                    {evento.ambiente ? AMBIENTE[evento.ambiente].label : "sem ambiente"} ·{" "}
                    {evento.pluginChave ? nomeCurtoPlugin(evento.pluginChave) : "núcleo / ambiente"} · {rotuloNo(evento.no)}
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

          <Stack direction="row" justify="between" align="center" wrap>
            <span className={styles.textoSecundario}>
              {(pagina - 1) * tamanho + 1}–{Math.min(pagina * tamanho, total)} de {total}
            </span>
            {/* div em volta: o Pagination ocupa 100% da largura e jogaria a contagem para outra linha. */}
            {totalPaginas > 1 && (
              <div>
                <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
              </div>
            )}
          </Stack>
        </Stack>
      )}
    </Card>
  );
}
