"use client";

import { useEffect, useState } from "react";
import { ListChecks, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { listarExecucoes } from "../services/plugins3dx.service";
import type {
  Ambiente3dx,
  GatilhoExecucao3dx,
  PaginaExecucoes3dx,
  StatusExecucao3dx,
} from "../types/plugins3dx.types";
import {
  AMBIENTE,
  formatarDataHora,
  formatarDuracao,
  GATILHO,
  MODO,
  NOME_CURTO_PLUGIN,
  nomeCurtoPlugin,
  rotuloObjeto,
  STATUS_EXECUCAO,
} from "../utils/exibicao";
import { DetalheExecucaoDrawer } from "./DetalheExecucaoDrawer";
import styles from "./Plugins3dx.module.css";

interface ExecucoesProps {
  ambiente: Ambiente3dx | null;
  onFeedback: FeedbackHandler;
  execucaoInicial: string | null;
  onFecharInicial: () => void;
}

const OPCOES_PLUGIN = [
  { value: "", label: "Todos os plugins" },
  ...Object.entries(NOME_CURTO_PLUGIN).map(([valor, label]) => ({ value: valor, label })),
];

const OPCOES_STATUS = [
  { value: "", label: "Todos os status" },
  ...Object.entries(STATUS_EXECUCAO).map(([valor, info]) => ({ value: valor, label: info.label })),
];

const OPCOES_GATILHO = [
  { value: "", label: "Todos os gatilhos" },
  ...Object.entries(GATILHO).map(([valor, label]) => ({ value: valor, label })),
];

export function ExecucoesPlugins3dx({ ambiente, onFeedback, execucaoInicial, onFecharInicial }: ExecucoesProps) {
  const [plugin, setPlugin] = useState("");
  const [status, setStatus] = useState("");
  const [gatilho, setGatilho] = useState("");
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState<PaginaExecucoes3dx | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recarregar, setRecarregar] = useState(0);
  const [aberta, setAberta] = useState<string | null>(execucaoInicial);
  /* Trocar o ambiente no topo do painel volta para a página 1 (ajuste durante o render, sem efeito). */
  const [ambienteAnterior, setAmbienteAnterior] = useState(ambiente);
  if (ambiente !== ambienteAnterior) {
    setAmbienteAnterior(ambiente);
    setPagina(1);
  }

  /* Busca com debounce de 400 ms (estado digitado separado do aplicado). */
  useEffect(() => {
    const timer = setTimeout(() => {
      setBusca(buscaDigitada.trim());
      setPagina(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [buscaDigitada]);

  useEffect(() => {
    let cancelado = false;
    listarExecucoes({
      ambiente,
      plugin: plugin || null,
      status: (status || null) as StatusExecucao3dx | null,
      gatilho: (gatilho || null) as GatilhoExecucao3dx | null,
      busca: busca || null,
      de: de || null,
      ate: ate || null,
      pagina,
    }).then((resposta) => {
      if (cancelado) return;
      setResultado(resposta.ok && resposta.data ? resposta.data : null);
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
  }, [ambiente, plugin, status, gatilho, busca, de, ate, pagina, recarregar]);

  const totalPaginas = resultado ? Math.max(1, Math.ceil(resultado.total / resultado.tamanhoPagina)) : 1;

  function mudar(setter: (valor: string) => void) {
    return (valor: string) => {
      setter(valor);
      setPagina(1);
    };
  }

  return (
    <Card
      title="Execuções"
      description="Cada liberação, duplicação, rotina noturna ou ação manual tratada pelos plugins. Clique para ver o detalhe de cada objeto."
      actions={
        <Button variant="secondary" onClick={() => setRecarregar((v) => v + 1)}>
          <RefreshCw size={15} />
          Atualizar
        </Button>
      }
    >
      <Stack gap={16}>
        <div className={styles.filtros}>
          <div className={styles.filtroBusca}>
            <Field label="Buscar">
              <Input
                value={buscaDigitada}
                placeholder="Item, título, conjunto afetado ou usuário"
                onChange={(e) => setBuscaDigitada(e.target.value)}
              />
            </Field>
          </div>
          <div className={styles.filtroData}>
            <Field label="De">
              <Input type="date" value={de} onChange={(e) => mudar(setDe)(e.target.value)} />
            </Field>
          </div>
          <div className={styles.filtroData}>
            <Field label="Até">
              <Input type="date" value={ate} onChange={(e) => mudar(setAte)(e.target.value)} />
            </Field>
          </div>
          <div className={styles.filtroCampo}>
            <Field label="Plugin">
              <Dropdown value={plugin} options={OPCOES_PLUGIN} onValueChange={mudar(setPlugin)} />
            </Field>
          </div>
          <div className={styles.filtroCampo}>
            <Field label="Status">
              <Dropdown value={status} options={OPCOES_STATUS} onValueChange={mudar(setStatus)} />
            </Field>
          </div>
          <div className={styles.filtroCampo}>
            <Field label="Gatilho">
              <Dropdown value={gatilho} options={OPCOES_GATILHO} onValueChange={mudar(setGatilho)} />
            </Field>
          </div>
        </div>

        {carregando ? (
          <Loader label="Carregando execuções..." />
        ) : !resultado || resultado.execucoes.length === 0 ? (
          <EmptyState
            icon={busca ? <Search size={26} /> : <ListChecks size={26} />}
            title="Nenhuma execução"
            description="As execuções aparecem aqui assim que os plugins do 3DSpace tratam uma liberação, duplicação ou ação manual."
          />
        ) : (
          <Stack gap={16}>
            <Table minWidth={980}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Quando</TableHeaderCell>
                  <TableHeaderCell>Plugin</TableHeaderCell>
                  <TableHeaderCell>Objeto</TableHeaderCell>
                  <TableHeaderCell>Quem</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Itens</TableHeaderCell>
                  <TableHeaderCell>Duração</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resultado.execucoes.map((execucao) => (
                  <TableRow key={execucao.id} className={styles.linhaClicavel} onClick={() => setAberta(execucao.id)}>
                    <TableCell style={{ whiteSpace: "nowrap" }}>
                      {formatarDataHora(execucao.enfileiradoEm)}
                      <div className={styles.textoSecundario}>{GATILHO[execucao.gatilho]}</div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.celulaObjeto}>
                        <span>{nomeCurtoPlugin(execucao.pluginChave)}</span>
                        <span className={styles.badges}>
                          <Badge variant={AMBIENTE[execucao.ambiente].variante}>
                            {AMBIENTE[execucao.ambiente].label}
                          </Badge>
                          {execucao.modo !== "ATIVO" && (
                            <Badge variant={MODO[execucao.modo].variante}>{MODO[execucao.modo].label}</Badge>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.celulaObjeto}>
                        <span>{rotuloObjeto(execucao.objetoNome, execucao.objetoRevisao, execucao.objetoTitulo)}</span>
                        {execucao.resumo && <span className={styles.textoSecundario}>{execucao.resumo}</span>}
                      </div>
                    </TableCell>
                    <TableCell>{execucao.atorNome ?? execucao.atorLogin ?? execucao.solicitadoPorNome ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_EXECUCAO[execucao.status].variante}>
                        {STATUS_EXECUCAO[execucao.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell style={{ whiteSpace: "nowrap" }}>
                      {execucao.totalItens ?? "—"}
                      {(execucao.totalFalhas ?? 0) > 0 && (
                        <span className={styles.textoSecundario}> ({execucao.totalFalhas} falha(s))</span>
                      )}
                    </TableCell>
                    <TableCell style={{ whiteSpace: "nowrap" }}>{formatarDuracao(execucao.duracaoMs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPaginas > 1 && <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />}
          </Stack>
        )}
      </Stack>

      <DetalheExecucaoDrawer
        id={aberta}
        onFeedback={onFeedback}
        onAbrirOutra={setAberta}
        onClose={() => {
          setAberta(null);
          onFecharInicial();
        }}
        onAlterada={() => setRecarregar((v) => v + 1)}
      />
    </Card>
  );
}
