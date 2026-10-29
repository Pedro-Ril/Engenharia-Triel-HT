"use client";

import { useEffect, useState } from "react";
import { FileCheck2, History, PlayCircle } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import {
  buscarRodada,
  iniciarSimulacao,
  liberarSimulacao,
  listarRodadas,
  type AcaoDesenho,
  type DesenhoDaRodada,
  type Rodada,
  type StatusRodada,
} from "../services/liberacaoDesenhos.service";
import styles from "./LiberacaoDesenhosTab.module.css";

const EM_ANDAMENTO: StatusRodada[] = ["explodindo", "buscando_desenhos", "processando"];

const ETAPA: Record<StatusRodada, string> = {
  explodindo: "Explodindo a estrutura no 3DX…",
  buscando_desenhos: "Buscando os desenhos de todos os itens…",
  processando: "Processando os desenhos no 3DX…",
  concluida: "Concluída",
  erro: "Erro",
};

const ACAO: Record<AcaoDesenho, { label: string; variant: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  pendente: { label: "Aguardando", variant: "neutral" },
  seria_liberado: { label: "Seria liberado", variant: "info" },
  liberado: { label: "Liberado", variant: "success" },
  ja_liberado: { label: "Já liberado", variant: "neutral" },
  ignorado: { label: "Ignorado", variant: "warning" },
  erro: { label: "Erro", variant: "danger" },
};

function formatarData(valorIso: string | null): string {
  return valorIso ? new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";
}

/*
 * Liberação de desenhos em trabalho: explode a estrutura do pai no 3DX,
 * busca os desenhos de todos os itens e libera todo desenho IN_WORK, de
 * baixo para cima. Sempre simula antes (nada muda no 3DX); a liberação
 * real só acontece com confirmação, a partir de uma simulação concluída.
 * Período de teste: tudo fica registrado e aparece no histórico.
 */
export function LiberacaoDesenhosTab() {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [rodadaId, setRodadaId] = useState<string | null>(null);
  const [dados, setDados] = useState<{ rodada: Rodada; desenhos: DesenhoDaRodada[] } | null>(null);
  const [historico, setHistorico] = useState<Rodada[] | null>(null);
  const [recargaHistorico, setRecargaHistorico] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [liberando, setLiberando] = useState(false);

  useEffect(() => {
    let ativo = true;
    listarRodadas().then((resultado) => {
      if (ativo && resultado.ok && resultado.data) setHistorico(resultado.data);
    });
    return () => {
      ativo = false;
    };
  }, [recargaHistorico]);

  /* Acompanha a rodada aberta: em andamento, pergunta de novo a cada 3 s. */
  useEffect(() => {
    if (!rodadaId) return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function atualizar() {
      const resultado = await buscarRodada(rodadaId!);
      if (!ativo) return;
      if (resultado.ok && resultado.data) {
        setDados(resultado.data);
        if (EM_ANDAMENTO.includes(resultado.data.rodada.status)) {
          timer = setTimeout(atualizar, 3000);
        } else {
          setRecargaHistorico((n) => n + 1);
        }
      } else {
        setErro(resultado.message ?? "Não foi possível acompanhar a rodada.");
      }
    }

    void atualizar();
    return () => {
      ativo = false;
      if (timer) clearTimeout(timer);
    };
  }, [rodadaId]);

  async function simular() {
    const codigoLimpo = codigo.trim();
    if (!codigoLimpo) {
      setErro("Informe o código do item pai.");
      return;
    }
    setErro(null);
    setIniciando(true);
    try {
      const resultado = await iniciarSimulacao(codigoLimpo);
      if (resultado.ok && resultado.data) {
        setDados(null);
        setRodadaId(resultado.data.id);
        setRecargaHistorico((n) => n + 1);
      } else {
        setErro(resultado.message ?? "Não foi possível iniciar a simulação.");
      }
    } finally {
      setIniciando(false);
    }
  }

  async function liberar() {
    if (!dados) return;
    setLiberando(true);
    try {
      const resultado = await liberarSimulacao(dados.rodada.id);
      if (resultado.ok && resultado.data) {
        setConfirmando(false);
        setDados(null);
        setRodadaId(resultado.data.id);
        setRecargaHistorico((n) => n + 1);
      } else {
        setConfirmando(false);
        setErro(resultado.message ?? "Não foi possível iniciar a liberação.");
      }
    } finally {
      setLiberando(false);
    }
  }

  const rodada = dados?.rodada ?? null;
  const desenhos = dados?.desenhos ?? [];
  const emAndamento = rodada ? EM_ANDAMENTO.includes(rodada.status) : rodadaId !== null;
  const aLiberar = dados?.desenhos.filter((d) => d.acao === "seria_liberado").length ?? 0;
  const podeLiberar = Boolean(rodada?.dryRun && rodada.status === "concluida" && !rodada.liberacaoId && aLiberar > 0);

  return (
    <Stack gap={20}>
      <Card
        title="Liberação de desenhos em trabalho"
        description="Explode a estrutura do item pai no 3DX (todos os níveis, incluindo o pai) e libera os desenhos que estão em trabalho, de baixo para cima."
      >
        <Stack gap={16}>
          <Alert variant="info">
            Primeiro o Portal <strong>simula</strong>: mostra o que seria liberado sem mudar nada no 3DX. A liberação de
            verdade só acontece quando você confirmar. O 3DX atende uma rodada por vez.
          </Alert>
          <Stack direction="row" gap={12} align="end" wrap>
            <Field label="Código do item pai" htmlFor="liberacaoCodigo">
              <Input
                id="liberacaoCodigo"
                value={codigo}
                placeholder="Ex.: 300309"
                disabled={iniciando || emAndamento}
                onChange={(evento) => setCodigo(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter") void simular();
                }}
              />
            </Field>
            <Button onClick={() => void simular()} loading={iniciando} disabled={emAndamento}>
              <PlayCircle size={16} />
              Simular
            </Button>
          </Stack>
          {erro && <Alert variant="danger">{erro}</Alert>}
        </Stack>
      </Card>

      {rodadaId && (
        <Card
          title={
            rodada
              ? `${rodada.dryRun ? "Simulação" : "Liberação"} · ${rodada.codigoPai}`
              : "Carregando a rodada…"
          }
          description={rodada ? `${rodada.usuarioNome} · ${formatarData(rodada.criadoEm)}` : undefined}
        >
          {!rodada ? (
            <Loader label="Carregando…" />
          ) : (
            <Stack gap={16}>
              {emAndamento && <Loader label={ETAPA[rodada.status]} />}
              {rodada.status === "erro" && <Alert variant="danger">{rodada.mensagem ?? "A rodada falhou."}</Alert>}
              {rodada.status !== "erro" && rodada.mensagem && <Alert variant="warning">{rodada.mensagem}</Alert>}

              <div className={styles.totais}>
                <StatCard label="Itens na estrutura" value={rodada.totalItens ?? "-"} />
                <StatCard label="Desenhos" value={rodada.totalDesenhos ?? "-"} />
                <StatCard label="Em trabalho" value={rodada.totalEmTrabalho ?? "-"} variant="warning" />
                <StatCard
                  label={rodada.dryRun ? "Seriam liberados" : "Liberados"}
                  value={rodada.totalLiberados ?? "-"}
                  variant="success"
                />
                <StatCard label="Erros" value={rodada.totalErros ?? "-"} variant="danger" />
              </div>

              {podeLiberar && (
                <Stack direction="row" justify="between" align="center" gap={12} wrap>
                  <span className={styles.secundario}>
                    A simulação terminou. Confira a lista e, se estiver certa, libere de verdade.
                  </span>
                  <Button variant="danger" onClick={() => setConfirmando(true)}>
                    <FileCheck2 size={16} />
                    Liberar {aLiberar} desenho(s) no 3DX
                  </Button>
                </Stack>
              )}
              {rodada.dryRun && rodada.liberacaoId && (
                <Alert variant="info">
                  Esta simulação já foi liberada.{" "}
                  <button type="button" className={styles.link} onClick={() => setRodadaId(rodada.liberacaoId)}>
                    Ver a liberação
                  </button>
                </Alert>
              )}

              {desenhos.length === 0 ? (
                !emAndamento && <span className={styles.secundario}>Nenhum desenho encontrado na estrutura.</span>
              ) : (
                <Table minWidth={900}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell align="right">#</TableHeaderCell>
                      <TableHeaderCell>Item</TableHeaderCell>
                      <TableHeaderCell align="center">Nível</TableHeaderCell>
                      <TableHeaderCell>Desenho</TableHeaderCell>
                      <TableHeaderCell>Status antes</TableHeaderCell>
                      <TableHeaderCell>Resultado</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {desenhos.map((d) => (
                      <TableRow key={d.desenhoPhysicalId}>
                        <TableCell align="right">{d.ordem}</TableCell>
                        <TableCell>
                          <strong>{d.itemCodigo ?? "-"}</strong>
                          {d.itemRevisao ? ` | ${d.itemRevisao}` : ""}
                          {d.itemStatus && <span className={styles.secundario}> · {d.itemStatus}</span>}
                        </TableCell>
                        <TableCell align="center">{d.itemNivel ?? "-"}</TableCell>
                        <TableCell>
                          {d.desenhoTitulo ?? d.desenhoPhysicalId}
                          {d.desenhoRevisao ? ` | ${d.desenhoRevisao}` : ""}
                        </TableCell>
                        <TableCell>{d.statusAntes ?? "-"}</TableCell>
                        <TableCell>
                          <Stack gap={4}>
                            <Badge variant={ACAO[d.acao].variant}>{ACAO[d.acao].label}</Badge>
                            {d.mensagem && <span className={styles.mensagem}>{d.mensagem}</span>}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Stack>
          )}
        </Card>
      )}

      <Card title="Histórico" description="As últimas rodadas — simulações e liberações. Clique para ver os desenhos.">
        {!historico ? (
          <Loader label="Carregando…" />
        ) : historico.length === 0 ? (
          <EmptyState icon={<History size={28} />} title="Nenhuma rodada ainda" />
        ) : (
          <Table minWidth={760}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Quando</TableHeaderCell>
                <TableHeaderCell>Item pai</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Situação</TableHeaderCell>
                <TableHeaderCell align="right">Em trabalho</TableHeaderCell>
                <TableHeaderCell align="right">Liberados</TableHeaderCell>
                <TableHeaderCell align="right">Erros</TableHeaderCell>
                <TableHeaderCell>Quem</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historico.map((r) => (
                <TableRow key={r.id} style={{ cursor: "pointer" }} onClick={() => setRodadaId(r.id)}>
                  <TableCell>{formatarData(r.criadoEm)}</TableCell>
                  <TableCell>
                    <strong>{r.codigoPai}</strong>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.dryRun ? "info" : "success"}>{r.dryRun ? "Simulação" : "Liberação"}</Badge>
                  </TableCell>
                  <TableCell>{ETAPA[r.status]}</TableCell>
                  <TableCell align="right">{r.totalEmTrabalho ?? "-"}</TableCell>
                  <TableCell align="right">{r.totalLiberados ?? "-"}</TableCell>
                  <TableCell align="right">{r.totalErros ?? "-"}</TableCell>
                  <TableCell>{r.usuarioNome}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={confirmando}
        title={`Liberar ${aLiberar} desenho(s) no 3DX?`}
        variant="danger"
        confirmLabel="Sim, liberar no 3DX"
        loading={liberando}
        message={`Os desenhos em trabalho da estrutura de ${rodada?.codigoPai ?? ""} passam para RELEASED no 3DEXPERIENCE de produção, de baixo para cima. Não há desfazer simples: voltar exige um administrador do 3DX. Tudo fica registrado no histórico.`}
        onConfirm={liberar}
        onClose={() => {
          if (!liberando) setConfirmando(false);
        }}
      />
    </Stack>
  );
}
