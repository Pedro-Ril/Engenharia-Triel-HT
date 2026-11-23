"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { buscarExecucao, cancelarExecucao } from "../services/plugins3dx.service";
import type { DetalheExecucao3dx } from "../types/plugins3dx.types";
import {
  ACAO_ITEM,
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
import styles from "./Plugins3dx.module.css";

interface DetalheProps {
  id: string | null;
  onFeedback: FeedbackHandler;
  onAbrirOutra: (id: string) => void;
  onClose: () => void;
  onAlterada: () => void;
}

export function DetalheExecucaoDrawer({ id, onFeedback, onAbrirOutra, onClose, onAlterada }: DetalheProps) {
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

  return (
    <Drawer
      open={id !== null}
      size="large"
      title={e ? rotuloObjeto(e.objetoNome, e.objetoRevisao, e.objetoTitulo) : "Execução"}
      description={
        e ? `${GATILHO[e.gatilho]} · ${nomeCurtoPlugin(e.pluginChave)} · ${AMBIENTE[e.ambiente].label}` : undefined
      }
      onClose={onClose}
      footer={
        e?.status === "pendente" ? (
          <Button variant="danger" onClick={() => setConfirmarCancelar(true)}>
            Cancelar trabalho
          </Button>
        ) : undefined
      }
    >
      {erroId === id ? (
        <span className={styles.textoSecundario}>Não foi possível carregar esta execução.</span>
      ) : carregando || !detalhe || !e ? (
        <Loader label="Carregando..." />
      ) : (
        <Stack gap={20}>
          <div className={styles.detalhes}>
            <span className={styles.rotulo}>Status</span>
            <span className={styles.valor}>
              <Badge variant={STATUS_EXECUCAO[e.status].variante}>{STATUS_EXECUCAO[e.status].label}</Badge>
              <Badge variant={MODO[e.modo].variante}>{MODO[e.modo].label}</Badge>
              <Badge variant={AMBIENTE[e.ambiente].variante}>{AMBIENTE[e.ambiente].label}</Badge>
            </span>
            <span className={styles.rotulo}>Quem</span>
            <span className={styles.valor}>
              {e.atorNome ?? e.atorLogin ?? "—"}
              {e.solicitadoPorNome && ` (pedido no Portal por ${e.solicitadoPorNome})`}
            </span>
            <span className={styles.rotulo}>Entrou na fila</span>
            <span className={styles.valor}>{formatarDataHora(e.enfileiradoEm)}</span>
            <span className={styles.rotulo}>Processado</span>
            <span className={styles.valor}>
              {formatarDataHora(e.iniciadoEm)} → {formatarDataHora(e.finalizadoEm)} ({formatarDuracao(e.duracaoMs)})
            </span>
            <span className={styles.rotulo}>Nó</span>
            <span className={styles.valor}>
              {rotuloNo(e.no)}
              {e.tentativas > 1 && ` · ${e.tentativas} tentativas`}
            </span>
            <span className={styles.rotulo}>Totais</span>
            <span className={styles.valor}>
              {e.totalItens ?? 0} item(ns), {e.totalOk ?? 0} ok, {e.totalFalhas ?? 0} falha(s)
            </span>
            {e.resumo && (
              <>
                <span className={styles.rotulo}>Resumo</span>
                <span className={styles.valor}>{e.resumo}</span>
              </>
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

          <Stack gap={8}>
            <h4 className={styles.tituloSecao}>Objetos ({detalhe.itens.length})</h4>
            {detalhe.itens.length === 0 ? (
              <span className={styles.textoSecundario}>Nenhum objeto alterado nesta execução.</span>
            ) : (
              <Table minWidth={760}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Ação</TableHeaderCell>
                    <TableHeaderCell>Objeto</TableHeaderCell>
                    <TableHeaderCell>De → para</TableHeaderCell>
                    <TableHeaderCell>Resultado</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detalhe.itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell style={{ whiteSpace: "nowrap" }}>{ACAO_ITEM[item.acao] ?? item.acao}</TableCell>
                      <TableCell>
                        <div className={styles.celulaObjeto}>
                          <span>{rotuloObjeto(item.alvoNome, item.alvoRevisao, item.alvoTitulo)}</span>
                          {(item.alvoEstado || item.alvoOwner) && (
                            <span className={styles.textoSecundario}>
                              {[item.alvoEstado, item.alvoOwner && `responsável: ${item.alvoOwner}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.valorAntes ?? "—"}
                        <span className={styles.deParaSeta}>→</span>
                        {item.valorDepois ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.sucesso ? "success" : "danger"}>{item.sucesso ? "OK" : "Falha"}</Badge>
                        {item.mensagem && <div className={styles.textoSecundario}>{item.mensagem}</div>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>

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
    </Drawer>
  );
}
