"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { buscarExecucao, cancelarExecucao } from "../services/plugins3dx.service";
import type { DetalheExecucao3dx } from "../types/plugins3dx.types";
import {
  AMBIENTE,
  formatarDataHora,
  formatarDuracao,
  GATILHO,
  MODO,
  NIVEL_EVENTO,
  nomeCurtoPlugin,
  rotuloNo,
  rotuloObjeto,
  STATUS_EXECUCAO,
} from "../utils/exibicao";
import { exportarExecucaoExcel, exportarExecucaoPdf } from "../utils/exportarPlugins3dx";
import { ItensExecucao } from "./ItensExecucao";
import styles from "./Plugins3dx.module.css";

interface DetalheProps {
  id: string | null;
  onFeedback: FeedbackHandler;
  onAbrirOutra: (id: string) => void;
  onClose: () => void;
  onAlterada: () => void;
}

/* Detalhe de uma execução: modal largo (1200 px), porque a lista de objetos tem várias colunas. */
export function DetalheExecucaoModal({ id, onFeedback, onAbrirOutra, onClose, onAlterada }: DetalheProps) {
  const [detalhe, setDetalhe] = useState<DetalheExecucao3dx | null>(null);
  const [erroId, setErroId] = useState<string | null>(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    buscarExecucao(id).then((resposta) => {
      if (cancelado) return;
      if (resposta.ok && resposta.data) {
        setDetalhe(resposta.data);
        setErroId(null);
      } else {
        setErroId(id);
        onFeedback("danger", "Não foi possível abrir", resposta.message ?? "");
      }
    });
    return () => {
      cancelado = true;
    };
  }, [id, recarregar, onFeedback]);

  async function cancelar() {
    if (!id) return;
    setCancelando(true);
    const resposta = await cancelarExecucao(id);
    setCancelando(false);
    setConfirmarCancelar(false);
    if (resposta.ok) {
      onFeedback("success", "Cancelado", resposta.message ?? "");
      setRecarregar((v) => v + 1);
      onAlterada();
    } else {
      onFeedback("danger", "Não foi possível cancelar", resposta.message ?? "");
    }
  }

  const e = detalhe?.execucao;
  const carregando = id !== null && detalhe?.execucao.id !== id && erroId !== id;

  /* Gera no navegador a partir do detalhe já carregado (todos os objetos, sem a paginação da tela). */
  function exportar(formato: "pdf" | "excel") {
    if (!detalhe) return;
    try {
      if (formato === "pdf") exportarExecucaoPdf(detalhe);
      else exportarExecucaoExcel(detalhe);
    } catch (error) {
      onFeedback("danger", "Não foi possível exportar", error instanceof Error ? error.message : "Tente novamente.");
    }
  }

  return (
    <Modal
      open={id !== null}
      size="large"
      title={e ? rotuloObjeto(e.objetoNome, e.objetoRevisao, e.objetoTitulo) : "Execução"}
      description={
        e ? `${GATILHO[e.gatilho]} · ${nomeCurtoPlugin(e.pluginChave)} · ${AMBIENTE[e.ambiente].label}` : undefined
      }
      onClose={onClose}
      footer={
        e && !carregando ? (
          <>
            <DropdownMenu
              label="Exportar esta execução"
              triggerText="Exportar"
              triggerIcon={<Download size={15} />}
              items={[
                {
                  value: "pdf",
                  label: "Em PDF",
                  icon: <FileText size={15} />,
                  onSelect: () => exportar("pdf"),
                },
                {
                  value: "excel",
                  label: "Em Excel",
                  icon: <FileSpreadsheet size={15} />,
                  onSelect: () => exportar("excel"),
                },
              ]}
            />
            {e.status === "pendente" && (
              <Button variant="danger" onClick={() => setConfirmarCancelar(true)}>
                Cancelar trabalho
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {erroId === id ? (
        <span className={styles.textoSecundario}>Não foi possível carregar esta execução.</span>
      ) : carregando || !detalhe || !e ? (
        <Loader label="Carregando..." />
      ) : (
        <Stack gap={20}>
          <div className={styles.resumoGrade}>
            <div className={styles.resumoItem}>
              <span className={styles.rotulo}>Status</span>
              <span className={styles.valor}>
                <Badge variant={STATUS_EXECUCAO[e.status].variante}>{STATUS_EXECUCAO[e.status].label}</Badge>
                <Badge variant={MODO[e.modo].variante}>{MODO[e.modo].label}</Badge>
                <Badge variant={AMBIENTE[e.ambiente].variante}>{AMBIENTE[e.ambiente].label}</Badge>
              </span>
            </div>
            <div className={styles.resumoItem}>
              <span className={styles.rotulo}>Quem</span>
              <span className={styles.valor}>
                {e.atorNome ?? e.atorLogin ?? "—"}
                {e.solicitadoPorNome && ` (pedido no Portal por ${e.solicitadoPorNome})`}
              </span>
            </div>
            <div className={styles.resumoItem}>
              <span className={styles.rotulo}>Objetos</span>
              <span className={styles.valor}>
                {e.totalItens ?? 0} · {e.totalOk ?? 0} ok ·{" "}
                <span className={(e.totalFalhas ?? 0) > 0 ? styles.noErro : undefined}>
                  {e.totalFalhas ?? 0} falha(s)
                </span>
              </span>
            </div>
            <div className={styles.resumoItem}>
              <span className={styles.rotulo}>Entrou na fila</span>
              <span className={styles.valor}>{formatarDataHora(e.enfileiradoEm)}</span>
            </div>
            <div className={styles.resumoItem}>
              <span className={styles.rotulo}>Processado</span>
              <span className={styles.valor}>
                {formatarDataHora(e.iniciadoEm)} → {formatarDataHora(e.finalizadoEm)}
              </span>
            </div>
            <div className={styles.resumoItem}>
              <span className={styles.rotulo}>Duração · nó</span>
              <span className={styles.valor}>
                {formatarDuracao(e.duracaoMs)} · {rotuloNo(e.no)}
                {e.tentativas > 1 && ` · ${e.tentativas} tentativas`}
              </span>
            </div>
            {e.resumo && (
              <div className={`${styles.resumoItem} ${styles.resumoItemLargo}`}>
                <span className={styles.rotulo}>Resumo</span>
                <span className={styles.valor}>{e.resumo}</span>
              </div>
            )}
          </div>

          {e.erro && <pre className={styles.blocoErro}>{e.erro}</pre>}

          {detalhe.relacionadas.length > 0 && (
            <Stack gap={8}>
              <h4 className={styles.tituloSecao}>Do mesmo comando no 3DEXPERIENCE</h4>
              <ul className={styles.listaRelacionadas}>
                {detalhe.relacionadas.map((r) => (
                  <li key={r.id}>
                    <button type="button" className={styles.link} onClick={() => onAbrirOutra(r.id)}>
                      {nomeCurtoPlugin(r.pluginChave)}: {rotuloObjeto(r.objetoNome, r.objetoRevisao, r.objetoTitulo)}
                    </button>{" "}
                    <Badge variant={STATUS_EXECUCAO[r.status].variante}>{STATUS_EXECUCAO[r.status].label}</Badge>
                  </li>
                ))}
              </ul>
            </Stack>
          )}

          <ItensExecucao key={e.id} itens={detalhe.itens} />

          {detalhe.eventos.length > 0 && (
            <Stack gap={8}>
              <h4 className={styles.tituloSecao}>Log técnico</h4>
              <ul className={styles.listaEventos}>
                {detalhe.eventos.map((evento) => (
                  <li key={evento.id} className={styles.itemEvento}>
                    <span className={styles.badgeEvento}>
                      <Badge variant={NIVEL_EVENTO[evento.nivel].variante}>{NIVEL_EVENTO[evento.nivel].label}</Badge>
                    </span>
                    <div className={styles.mensagemEvento}>
                      <span>{evento.mensagem}</span>
                      <span className={styles.textoSecundario}>{formatarDataHora(evento.criadoEm)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Stack>
          )}
        </Stack>
      )}

      <ConfirmDialog
        open={confirmarCancelar}
        title="Cancelar trabalho"
        variant="danger"
        message="O trabalho sai da fila e não será processado. Para rodar de novo, peça uma ação manual."
        confirmLabel="Cancelar trabalho"
        loading={cancelando}
        onConfirm={cancelar}
        onClose={() => setConfirmarCancelar(false)}
      />
    </Modal>
  );
}
