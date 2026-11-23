"use client";

import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

import type { NoPlugin3dx, Versao3dx } from "../types/plugins3dx.types";
import { AMBIENTE, formatarDataLancamento, rotuloNo, rotuloVersao } from "../utils/exibicao";
import styles from "./Plugins3dx.module.css";

interface HistoricoVersoesModalProps {
  /* null = fechado */
  titulo: string | null;
  /* Já filtradas pelo componente e na ordem da API (mais nova primeiro). */
  versoes: Versao3dx[];
  /* Nós que rodam este componente, para marcar a versão em uso em cada um. */
  nos: NoPlugin3dx[];
  /* Qual versão de cada nó corresponde a este componente (plugin: versao; núcleo: coreVersao). */
  versaoDoNo: (no: NoPlugin3dx) => string | null;
  onClose: () => void;
}

/*
 * Histórico de versões de um plugin ou do núcleo, em linha do tempo: o que mudou em cada versão (as notas vivem
 * no código Java e cada nó grava no Portal na subida). A versão que cada nó roda fica destacada.
 */
export function HistoricoVersoesModal({ titulo, versoes, nos, versaoDoNo, onClose }: HistoricoVersoesModalProps) {
  const total = versoes.length;

  return (
    <Modal
      open={titulo !== null}
      size="medium"
      title={titulo ?? ""}
      description={`${total} ${total === 1 ? "versão" : "versões"}, da mais nova para a mais antiga.`}
      onClose={onClose}
    >
      <ol className={styles.linhaTempo}>
        {versoes.map((v, indice) => {
          const emUso = nos.filter((no) => versaoDoNo(no) === v.versao);
          const atual = emUso.length > 0;
          return (
            <li key={v.versao} className={`${styles.marcoVersao} ${atual ? styles.marcoVersaoAtual : ""}`}>
              <span className={styles.pontoTempo} aria-hidden="true" />
              <div className={styles.conteudoVersao}>
                <div className={styles.cabecalhoVersao}>
                  <span className={styles.numeroVersao}>{rotuloVersao(v.versao)}</span>
                  {emUso.map((no) => (
                    <Badge key={no.no} variant="success">
                      em uso · {rotuloNo(no.no).split(" · ")[0]}
                      {no.ambiente ? ` (${AMBIENTE[no.ambiente].label})` : ""}
                    </Badge>
                  ))}
                  {indice === 0 && !atual && <Badge variant="neutral">mais recente</Badge>}
                  {v.lancadaEm && <span className={styles.dataVersao}>{formatarDataLancamento(v.lancadaEm)}</span>}
                </div>
                <p className={styles.notaVersao}>{v.notas}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
