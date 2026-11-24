"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, ListChecks, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
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
  FiltroStatusExecucao3dx,
  PaginaExecucoes3dx,
} from "../types/plugins3dx.types";
import {
  AMBIENTE,
  formatarDataHora,
  formatarDuracao,
  GATILHO,
  MODO,
  NOME_CURTO_PLUGIN,
  nomeCurtoPlugin,
  OPCOES_FILTRO_STATUS,
  rotuloFiltroStatus,
  rotuloObjeto,
  situacaoExecucao,
} from "../utils/exibicao";
import {
  carregarExecucoesParaExportar,
  exportarExecucoesExcel,
  exportarExecucoesPdf,
  LIMITE_EXPORTACAO,
} from "../utils/exportarPlugins3dx";
import type { FiltroAplicado } from "../utils/exportarPlugins3dx";
import { DetalheExecucaoModal } from "./DetalheExecucaoModal";
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
  ...OPCOES_FILTRO_STATUS,
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
  const [exportando, setExportando] = useState(false);
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
      status: (status || null) as FiltroStatusExecucao3dx | null,
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

  /* Filtros aplicados, em texto, para o relatório dizer o que foi exportado. */
  function filtrosAplicados(): FiltroAplicado[] {
    const lista: FiltroAplicado[] = [];
    lista.push(["Ambiente", ambiente ? AMBIENTE[ambiente].label : "Produção e Teste"]);
    if (busca) lista.push(["Busca", busca]);
    if (de || ate) {
      const data = (valor: string) => valor.split("-").reverse().join("/");
      lista.push(["Período", de && ate ? `${data(de)} a ${data(ate)}` : de ? `a partir de ${data(de)}` : `até ${data(ate)}`]);
    }
    if (plugin) lista.push(["Plugin", nomeCurtoPlugin(plugin)]);
    if (status) lista.push(["Status", rotuloFiltroStatus(status as FiltroStatusExecucao3dx)]);
    if (gatilho) lista.push(["Gatilho", GATILHO[gatilho as GatilhoExecucao3dx]]);
    return lista;
  }

  async function exportar(formato: "pdf" | "excel") {
    setExportando(true);
    try {
      const lista = await carregarExecucoesParaExportar({
        ambiente,
        plugin: plugin || null,
        status: (status || null) as FiltroStatusExecucao3dx | null,
        gatilho: (gatilho || null) as GatilhoExecucao3dx | null,
        busca: busca || null,
        de: de || null,
        ate: ate || null,
      });
      if (formato === "pdf") exportarExecucoesPdf(lista, filtrosAplicados());
      else exportarExecucoesExcel(lista, filtrosAplicados());
      if (lista.total > lista.execucoes.length) {
        onFeedback(
          "success",
          "Exportado com limite",
          `O filtro encontrou ${lista.total} execuções; o arquivo traz as ${LIMITE_EXPORTACAO} mais recentes. Use os filtros para reduzir.`
        );
      }
    } catch (error) {
      onFeedback(
        "danger",
        "Não foi possível exportar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setExportando(false);
    }
  }

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
        <Stack direction="row" gap={8} wrap>
          <Button variant="secondary" onClick={() => setRecarregar((v) => v + 1)}>
            <RefreshCw size={15} />
            Atualizar
          </Button>
          {/* Exporta a lista inteira com os filtros de baixo (todas as páginas), não só a página da tela. */}
          <DropdownMenu
            label="Exportar execuções com os filtros aplicados"
            triggerText={exportando ? "Exportando..." : "Exportar"}
            triggerIcon={<Download size={15} />}
            disabled={exportando || !resultado || resultado.total === 0}
            items={[
              {
                value: "pdf",
                label: "Lista em PDF",
                icon: <FileText size={15} />,
                onSelect: () => void exportar("pdf"),
              },
              {
                value: "excel",
                label: "Lista em Excel",
                icon: <FileSpreadsheet size={15} />,
                onSelect: () => void exportar("excel"),
              },
            ]}
          />
        </Stack>
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
                  <TableHeaderCell align="right">Itens</TableHeaderCell>
                  <TableHeaderCell align="right">Duração</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resultado.execucoes.map((execucao) => (
                  <TableRow key={execucao.id} className={styles.linhaClicavel} onClick={() => setAberta(execucao.id)}>
                    <TableCell style={{ whiteSpace: "nowrap" }}>
                      <div className={styles.celulaObjeto}>
                        <span>{formatarDataHora(execucao.enfileiradoEm)}</span>
                        <span className={styles.textoSecundario}>{GATILHO[execucao.gatilho]}</span>
                      </div>
                    </TableCell>
                    <TableCell style={{ whiteSpace: "nowrap" }}>
                      <div className={styles.celulaObjeto}>
                        <span>{nomeCurtoPlugin(execucao.pluginChave)}</span>
                        <span className={styles.ambienteMini}>
                          <span className={styles[`ponto_${execucao.ambiente}`]} aria-hidden="true" />
                          {AMBIENTE[execucao.ambiente].label}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.celulaObjeto}>
                        <span className={styles.nomeObjeto}>
                          {rotuloObjeto(execucao.objetoNome, execucao.objetoRevisao, execucao.objetoTitulo)}
                        </span>
                        {execucao.resumo && (
                          <span className={styles.resumoLinha} title={execucao.resumo}>
                            {execucao.resumo}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell style={{ whiteSpace: "nowrap" }}>
                      {execucao.atorNome ?? execucao.atorLogin ?? execucao.solicitadoPorNome ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className={styles.badgesLinha}>
                        <Badge variant={situacaoExecucao(execucao).variante}>{situacaoExecucao(execucao).label}</Badge>
                        {execucao.modo !== "ATIVO" && (
                          <Badge variant={MODO[execucao.modo].variante}>{MODO[execucao.modo].label}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell align="right" style={{ whiteSpace: "nowrap" }}>
                      <div className={styles.celulaObjeto}>
                        <span>{execucao.totalItens ?? "—"}</span>
                        {(execucao.totalFalhas ?? 0) > 0 && (
                          <span className={styles.noErro}>{execucao.totalFalhas} falha(s)</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell align="right" style={{ whiteSpace: "nowrap" }}>
                      {formatarDuracao(execucao.duracaoMs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPaginas > 1 && <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />}
          </Stack>
        )}
      </Stack>

      <DetalheExecucaoModal
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
