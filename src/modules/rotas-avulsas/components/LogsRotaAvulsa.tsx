"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, ScrollText, ShieldX, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import { listarLogs, listarTokens } from "../services/rotasAvulsas.service";
import type { LogRotaAvulsa, PaginaLogs, ResultadoLog, TokenRotaAvulsa } from "../types/rotasAvulsas.types";
import styles from "./RotasAvulsas.module.css";

const POR_PAGINA = 25;

const RESULTADO: Record<ResultadoLog, { label: string; variant: "success" | "warning" | "danger" }> = {
  aceito: { label: "Aceito", variant: "success" },
  recusado: { label: "Recusado", variant: "warning" },
  erro: { label: "Erro", variant: "danger" },
};

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

/* Texto digitado -> aplicado depois de 400 ms parado (padrão das buscas do Portal). */
function useDebounce(valor: string): string {
  const [aplicado, setAplicado] = useState(valor);
  useEffect(() => {
    const timer = setTimeout(() => setAplicado(valor.trim()), 400);
    return () => clearTimeout(timer);
  }, [valor]);
  return aplicado;
}

/* Resumo de uma linha do log para a tabela (o detalhe completo fica no modal). */
function resumo(log: LogRotaAvulsa): string {
  const d = (log.detalhes ?? {}) as Record<string, unknown>;
  if (log.motivo) return log.motivo;
  if (typeof d.impressora === "string" && typeof d.paginas === "number") {
    return `${d.impressora} · ${d.paginas} pág. · ${d.copias ?? 1} cópia(s)${d.jobId ? ` · trabalho ${d.jobId}` : ""}`;
  }
  if (typeof d.estado === "string") return `Consulta: ${d.estado}`;
  return "—";
}

/*
 * Log de uma rota avulsa: toda requisição, aceita ou recusada, com quem
 * chamou (token), de onde (IP), o resultado e o motivo. Os cartões contam
 * as últimas 24 h, sem filtro.
 */
export function LogsRotaAvulsa({ chave }: { chave: string }) {
  const [resultado, setResultado] = useState<ResultadoLog | "">("");
  const [tokenId, setTokenId] = useState("");
  const [busca, setBusca] = useState("");
  const buscaAplicada = useDebounce(busca);
  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);
  const [dados, setDados] = useState<PaginaLogs | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenRotaAvulsa[]>([]);
  const [aberto, setAberto] = useState<LogRotaAvulsa | null>(null);

  useEffect(() => {
    let vivo = true;
    listarTokens(chave).then((resposta) => {
      if (vivo) setTokens(resposta.data ?? []);
    });
    return () => {
      vivo = false;
    };
  }, [chave]);

  useEffect(() => {
    let vivo = true;
    listarLogs(chave, {
      resultado: resultado || null,
      tokenId: tokenId || null,
      busca: buscaAplicada,
      pagina,
      porPagina: POR_PAGINA,
    }).then((resposta) => {
      if (!vivo) return;
      if (resposta.ok && resposta.data) {
        setDados(resposta.data);
        setErro(null);
      } else {
        setErro(resposta.message ?? "Não foi possível carregar o log.");
      }
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [chave, resultado, tokenId, buscaAplicada, pagina, recarga]);

  function filtrar(aplicar: () => void) {
    aplicar();
    setPagina(1);
    setCarregando(true);
  }

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1;

  return (
    <Stack gap={20}>
      <FormGrid columns={3}>
        <StatCard
          label="Aceitas (24 h)"
          value={dados?.resumo24h.aceitos ?? "—"}
          description="Requisições atendidas."
          icon={<CheckCircle2 />}
          variant="success"
        />
        <StatCard
          label="Recusadas (24 h)"
          value={dados?.resumo24h.recusados ?? "—"}
          description="Token, limite, arquivo ou dados inválidos."
          icon={<ShieldX />}
          variant="warning"
        />
        <StatCard
          label="Erros (24 h)"
          value={dados?.resumo24h.erros ?? "—"}
          description="Falha da impressora ou do Portal."
          icon={<TriangleAlert />}
          variant="danger"
        />
      </FormGrid>

      <Card
        title="Requisições"
        description="Mais recentes primeiro. Clique numa linha para ver o detalhe completo."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setCarregando(true);
              setRecarga((n) => n + 1);
            }}
          >
            <RefreshCw size={16} /> Atualizar
          </Button>
        }
      >
        <Stack gap={16}>
          <FormGrid columns={3}>
            <Field label="Resultado">
              <Dropdown
                value={resultado}
                options={[
                  { value: "", label: "Todos" },
                  { value: "aceito", label: "Aceitos" },
                  { value: "recusado", label: "Recusados" },
                  { value: "erro", label: "Erros" },
                ]}
                onValueChange={(valor) => filtrar(() => setResultado(valor as ResultadoLog | ""))}
              />
            </Field>
            <Field label="Token">
              <Dropdown
                value={tokenId}
                options={[
                  { value: "", label: "Todos" },
                  ...tokens.map((t) => ({ value: t.id, label: `${t.nome} (${t.prefixo}…)` })),
                ]}
                onValueChange={(valor) => filtrar(() => setTokenId(valor))}
              />
            </Field>
            <Field label="Buscar" htmlFor={`logBusca-${chave}`} hint="IP, motivo, sistema, impressora, arquivo...">
              <Input
                id={`logBusca-${chave}`}
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(1);
                }}
              />
            </Field>
          </FormGrid>

          {erro ? (
            <EmptyState title="Não foi possível carregar o log" description={erro} icon={<ScrollText />} />
          ) : carregando && !dados ? (
            <Loader label="Carregando log..." />
          ) : !dados || dados.itens.length === 0 ? (
            <EmptyState
              title="Nenhuma requisição"
              description={resultado || tokenId || buscaAplicada ? "Nada com esses filtros." : "Esta rota ainda não recebeu chamadas."}
              icon={<ScrollText />}
            />
          ) : (
            <>
              <div className={styles.tabela}>
                <Table minWidth={900}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Data</TableHeaderCell>
                      <TableHeaderCell>Resultado</TableHeaderCell>
                      <TableHeaderCell>Chamada</TableHeaderCell>
                      <TableHeaderCell>Sistema</TableHeaderCell>
                      <TableHeaderCell>IP</TableHeaderCell>
                      <TableHeaderCell>Resumo</TableHeaderCell>
                      <TableHeaderCell align="right">Tempo</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dados.itens.map((log) => (
                      <TableRow key={log.id} className={styles.linhaClicavel} onClick={() => setAberto(log)}>
                        <TableCell className={styles.semQuebra}>{formatarData(log.criadoEm)}</TableCell>
                        <TableCell className={styles.semQuebra}>
                          <Badge variant={RESULTADO[log.resultado].variant}>
                            {RESULTADO[log.resultado].label} · {log.statusHttp}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={styles.mono}>
                            {log.metodo} {log.caminho}
                          </span>
                        </TableCell>
                        <TableCell>{log.tokenNome ?? <span className={styles.suave}>sem token válido</span>}</TableCell>
                        <TableCell>
                          <span className={`${styles.mono} ${styles.semQuebra}`}>{log.ipOrigem ?? "—"}</span>
                        </TableCell>
                        <TableCell>{resumo(log)}</TableCell>
                        <TableCell align="right">{log.duracaoMs !== null ? `${log.duracaoMs} ms` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Stack direction="row" justify="between" align="center" wrap>
                <span className={styles.suave}>{dados.total.toLocaleString("pt-BR")} requisição(ões)</span>
                <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} disabled={carregando} />
              </Stack>
            </>
          )}
        </Stack>
      </Card>

      <Modal
        open={aberto !== null}
        title="Detalhe da requisição"
        description={aberto ? formatarData(aberto.criadoEm) : undefined}
        size="large"
        onClose={() => setAberto(null)}
        footer={
          <Stack direction="row" justify="end">
            <Button variant="secondary" onClick={() => setAberto(null)}>
              Fechar
            </Button>
          </Stack>
        }
      >
        {aberto && (
          <Stack gap={16}>
            <dl className={styles.listaDefinicao}>
              <dt>Resultado</dt>
              <dd>
                <Badge variant={RESULTADO[aberto.resultado].variant}>{RESULTADO[aberto.resultado].label}</Badge> HTTP{" "}
                {aberto.statusHttp}
              </dd>
              <dt>Chamada</dt>
              <dd className={styles.mono}>
                {aberto.metodo} {aberto.caminho}
              </dd>
              <dt>Sistema</dt>
              <dd>{aberto.tokenNome ?? "Sem token válido"}</dd>
              <dt>IP de origem</dt>
              <dd className={styles.mono}>{aberto.ipOrigem ?? "—"}</dd>
              <dt>Motivo</dt>
              <dd>{aberto.motivo ?? "—"}</dd>
              <dt>Tempo</dt>
              <dd>{aberto.duracaoMs !== null ? `${aberto.duracaoMs} ms` : "—"}</dd>
            </dl>
            {aberto.detalhes !== null && (
              <pre className={styles.codigo}>{JSON.stringify(aberto.detalhes, null, 2)}</pre>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
