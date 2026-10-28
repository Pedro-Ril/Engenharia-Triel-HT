"use client";

import { CheckCircle2, Circle, Clock, MinusCircle, Undo2 } from "lucide-react";

import { Stack } from "@/components/ui/Stack";

import type { EtapaAprovacao, EventoHistoricoAprovacao, StatusEtapa } from "../types/aprovacoes.types";
import styles from "./CadeiaAprovacao.module.css";

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const ICONE: Record<StatusEtapa, typeof Circle> = {
  aguardando: Circle,
  pendente: Clock,
  aprovado: CheckCircle2,
  devolvido: Undo2,
  encerrado: MinusCircle,
};

const ROTULO: Record<StatusEtapa, string> = {
  aguardando: "Aguardando",
  pendente: "Na vez",
  aprovado: "Aprovado",
  devolvido: "Devolvido",
  encerrado: "Não chegou",
};

const ACAO: Record<EventoHistoricoAprovacao["acao"], string> = {
  enviado: "Enviado para aprovação",
  reenviado: "Reenviado",
  aprovado_nivel: "Aprovado no nível",
  aprovado: "Aprovado em definitivo",
  devolvido: "Devolvido ao solicitante",
  direcionado: "Direcionado",
};

interface CadeiaAprovacaoProps {
  etapas: EtapaAprovacao[];
  historico: EventoHistoricoAprovacao[];
}

/*
 * A cadeia da alçada (nível por nível, de quem é a vez agora e quem
 * pode decidir) e o histórico de tudo que aconteceu com a solicitação,
 * inclusive as rodadas anteriores a uma devolução. Serve a qualquer
 * tipo de aprovação.
 */
export function CadeiaAprovacao({ etapas, historico }: CadeiaAprovacaoProps) {
  if (etapas.length === 0 && historico.length === 0) {
    return <span className={styles.vazio}>Esta solicitação ainda não entrou numa alçada de aprovação.</span>;
  }

  return (
    <Stack gap={20}>
      {etapas.length > 0 && (
        <Stack gap={8}>
          <strong>Alçada de aprovação</strong>
          <ol className={styles.cadeia}>
            {etapas.map((etapa) => {
              const Icone = ICONE[etapa.status];
              return (
                <li key={`${etapa.ciclo}-${etapa.ordem}`} className={`${styles.etapa} ${styles[etapa.status]}`}>
                  <Icone size={18} className={styles.icone} aria-hidden="true" />
                  <div className={styles.etapaTexto}>
                    <span className={styles.etapaTitulo}>
                      Nível {etapa.ordem} · {etapa.nivelNome}
                      <span className={styles.etapaStatus}>{ROTULO[etapa.status]}</span>
                    </span>
                    {etapa.decididoPor && etapa.decididoEm ? (
                      <span className={styles.etapaDetalhe}>
                        {etapa.decididoPor}, {formatarData(etapa.decididoEm)}
                        {etapa.comentario ? ` — "${etapa.comentario}"` : ""}
                      </span>
                    ) : etapa.direcionadoPara && (etapa.status === "pendente" || etapa.status === "aguardando") ? (
                      <span className={styles.etapaDetalhe}>Direcionado para {etapa.direcionadoPara}</span>
                    ) : (
                      etapa.aprovadores.length > 0 &&
                      (etapa.status === "pendente" || etapa.status === "aguardando") && (
                        <span className={styles.etapaDetalhe}>
                          {etapa.status === "pendente" ? "Pode decidir: " : "Vai decidir: "}
                          {etapa.aprovadores.join(", ")}
                        </span>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Stack>
      )}

      {historico.length > 0 && (
        <Stack gap={8}>
          <strong>Histórico</strong>
          <ul className={styles.historico}>
            {historico.map((evento, indice) => (
              <li key={indice}>
                <span className={styles.historicoQuando}>
                  {formatarData(evento.criadoEm)}
                  {evento.numeroAprovacao !== undefined ? ` · aprovação #${evento.numeroAprovacao}` : ""}
                </span>
                <span>
                  {ACAO[evento.acao]}
                  {evento.nivelNome && evento.acao !== "enviado" && evento.acao !== "reenviado"
                    ? ` (${evento.nivelNome})`
                    : ""}
                  {evento.usuarioNome ? ` — ${evento.usuarioNome}` : ""}
                </span>
                {evento.comentario && <span className={styles.historicoComentario}>&ldquo;{evento.comentario}&rdquo;</span>}
              </li>
            ))}
          </ul>
        </Stack>
      )}
    </Stack>
  );
}
