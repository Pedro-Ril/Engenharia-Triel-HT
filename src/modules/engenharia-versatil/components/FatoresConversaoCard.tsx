"use client";

import { useState } from "react";
import { ClipboardCopy, Scale } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Loader } from "@/components/ui/Loader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import {
  analisarFatores,
  gravarFatores,
  type AnaliseFatores,
  type LinhaFator,
  type ResultadoFatores,
  type SituacaoFator,
} from "../services/engenhariaVersatil.service";
import styles from "./EngenhariaVersatil.module.css";
import type { VarianteSituacao } from "./TabelaArquivos";

const POR_PAGINA = 25;

const SITUACAO: Record<SituacaoFator, { rotulo: string; variante: VarianteSituacao }> = {
  incluir: { rotulo: "Sem fator: incluir", variante: "info" },
  alterar: { rotulo: "Fator errado: alterar", variante: "info" },
  ok: { rotulo: "Fator certo", variante: "success" },
  peso_divergente: { rotulo: "Peso divergente", variante: "warning" },
  erp_sem_peso: { rotulo: "ERP sem peso", variante: "warning" },
  planilha_sem_peso: { rotulo: "Planilha sem peso", variante: "neutral" },
  estoque_kg: { rotulo: "Estoque já em KG", variante: "neutral" },
  sem_unidade: { rotulo: "Sem unidade de estoque no ERP", variante: "danger" },
  planilha_conflito: { rotulo: "Pesos diferentes na planilha", variante: "warning" },
  nao_encontrado: { rotulo: "Não existe no ERP", variante: "danger" },
};

/* Linhas que pedem atenção: destacadas, desmarcadas, com o fator pelo peso da planilha. */
const DESTACADAS: SituacaoFator[] = ["peso_divergente", "erp_sem_peso"];

function numero(valor: number | null, casas: number): string {
  return valor === null ? "—" : valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/*
 * Pesos e fatores de conversão (unidade de estoque -> KG) dos itens da
 * planilha, conferidos contra o ERP (empresa e ambiente da administração).
 * Peso certo: o fator vem marcado (incluir ou corrigir para 1 / peso
 * líquido). Peso divergente ou ERP sem peso: linha destacada e
 * desmarcada; marcando, o fator usa o peso da planilha.
 */
export function FatoresConversaoCard({ planilha }: { planilha: File }) {
  const [analise, setAnalise] = useState<AnaliseFatores | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("todas");
  const [pagina, setPagina] = useState(1);
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoFatores | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function conferir(manterResultado = false) {
    setErro(null);
    if (!manterResultado) setResultado(null);
    setConferindo(true);
    try {
      const r = await analisarFatores(planilha);
      if (r.ok && r.data) {
        setAnalise(r.data);
        setMarcados(new Set(r.data.linhas.filter((l) => l.marcadoPorPadrao).map((l) => l.codigo)));
        setPagina(1);
      } else {
        setErro(r.message ?? "Não foi possível consultar o ERP.");
      }
    } finally {
      setConferindo(false);
    }
  }

  async function gravar() {
    setGravando(true);
    try {
      const r = await gravarFatores(planilha, [...marcados]);
      setConfirmando(false);
      if (r.ok && r.data) {
        setResultado(r.data);
        await conferir(true);
      } else {
        setErro(r.message ?? "Não foi possível gravar os fatores no ERP.");
      }
    } finally {
      setGravando(false);
    }
  }

  function alternar(codigo: string, marcar: boolean) {
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (marcar) proximo.add(codigo);
      else proximo.delete(codigo);
      return proximo;
    });
  }

  const linhas = analise?.linhas ?? [];
  /* O que já está certo no ERP não pede ação: fica só no cartão "Fator certo", fora da tabela. */
  const pendentes = linhas.filter((l) => l.situacao !== "ok");
  const filtradas = filtro === "todas" ? pendentes : pendentes.filter((l) => l.situacao === filtro);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const visiveis = filtradas.slice(inicio, inicio + POR_PAGINA);
  const marcaveisFiltradas = filtradas.filter((l) => l.marcavel);
  const todosMarcados = marcaveisFiltradas.length > 0 && marcaveisFiltradas.every((l) => marcados.has(l.codigo));

  const escolhidas = linhas.filter((l) => l.marcavel && marcados.has(l.codigo));
  const aIncluir = escolhidas.filter((l) => l.operacao === "incluir").length;
  const aAlterar = escolhidas.filter((l) => l.operacao === "alterar").length;
  const peloPesoDaPlanilha = escolhidas.filter((l) => l.origemPeso === "planilha").length;
  const comProblema = linhas.filter((l) => DESTACADAS.includes(l.situacao));
  const ambienteRotulo = analise?.ambiente === "producao" ? "PRODUÇÃO" : "TESTE";

  const opcoesFiltro = [
    { value: "todas", label: `Todos (${pendentes.length})` },
    ...(Object.keys(SITUACAO) as SituacaoFator[])
      .filter((s) => s !== "ok" && (analise?.totais[s] ?? 0) > 0)
      .map((s) => ({ value: s, label: `${SITUACAO[s].rotulo} (${analise!.totais[s]})` })),
  ];

  async function copiarCodigos() {
    const texto = comProblema.map((l) => l.codigo).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não foi possível copiar. Códigos: " + comProblema.map((l) => l.codigo).join(", "));
    }
  }

  return (
    <Card
      title="Pesos e fatores de conversão (KG)"
      description="Confere o peso de cada item com o peso líquido do ERP e cadastra ou corrige o fator da unidade de estoque para KG (1 / peso líquido)."
      actions={
        analise ? (
          <Badge variant={analise.ambiente === "producao" ? "danger" : "warning"}>
            ERP {ambienteRotulo} · empresa {analise.codEmpresa}
          </Badge>
        ) : undefined
      }
    >
      <Stack gap={16}>
        <Stack direction="row" gap={12} align="center" wrap>
          <Button variant={analise ? "secondary" : "primary"} onClick={() => void conferir()} loading={conferindo}>
            <Scale size={16} />
            {analise ? "Conferir de novo" : "Conferir pesos e fatores"}
          </Button>
          {conferindo && <Loader label="Consultando o ERP…" />}
        </Stack>

        {erro && <Alert variant="danger">{erro}</Alert>}
        {resultado && (
          <Alert variant={resultado.erro ? "danger" : "success"}>
            {resultado.erro
              ? `Gravação incompleta no ERP (${resultado.ambiente}): ${resultado.incluidos} incluído(s), ${resultado.alterados} alterado(s). ${resultado.erro}`
              : `Gravado no ERP (${resultado.ambiente}): ${resultado.incluidos} fator(es) incluído(s) e ${resultado.alterados} alterado(s). A lista abaixo já foi conferida de novo.`}
          </Alert>
        )}

        {analise && (
          <>
            <div className={styles.totais}>
              <StatCard label="Sem fator (incluir)" value={analise.totais.incluir} variant="info" />
              <StatCard label="Fator errado (alterar)" value={analise.totais.alterar} variant="info" />
              <StatCard label="Fator certo" value={analise.totais.ok} variant="success" />
              <StatCard
                label="Peso divergente / ERP sem peso"
                value={analise.totais.peso_divergente + analise.totais.erp_sem_peso}
                variant="warning"
              />
              <StatCard label="Não existem no ERP" value={analise.totais.nao_encontrado} variant="danger" />
            </div>

            {comProblema.length > 0 && (
              <Alert variant="warning">
                <Stack direction="row" justify="between" align="center" gap={12} wrap>
                  <span>
                    {comProblema.length} item(ns) com peso divergente ou sem peso no ERP estão destacados e desmarcados.
                    Marcando, o fator é gravado com o peso da planilha.
                  </span>
                  <Button variant="secondary" onClick={() => void copiarCodigos()}>
                    <ClipboardCopy size={16} />
                    {copiado ? "Copiado!" : "Copiar códigos"}
                  </Button>
                </Stack>
              </Alert>
            )}

            <Stack direction="row" justify="between" align="end" gap={12} wrap>
              <div className={styles.filtro}>
                <Field label="Mostrar">
                  <Dropdown
                    value={filtro}
                    options={opcoesFiltro}
                    onValueChange={(valor) => {
                      setFiltro(valor);
                      setPagina(1);
                    }}
                  />
                </Field>
              </div>
              <Button onClick={() => setConfirmando(true)} disabled={escolhidas.length === 0}>
                {escolhidas.length === 0
                  ? "Marque os itens para gravar"
                  : `Gravar ${escolhidas.length} fator(es) no ERP (${ambienteRotulo})`}
              </Button>
            </Stack>

            {analise.totais.ok > 0 && pendentes.length > 0 && (
              <span className={styles.secundario}>
                {analise.totais.ok} item(ns) com o fator certo no ERP não aparecem na lista.
              </span>
            )}

            {pendentes.length === 0 ? (
              <Alert variant="success">Todos os itens já estão com o fator certo no ERP. Nada a fazer.</Alert>
            ) : (
              <Table minWidth={960}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell align="center">
                      <div className={styles.checkboxCentro}>
                        <Checkbox
                          label=""
                          aria-label="Marcar todos os itens que podem ser gravados"
                          checked={todosMarcados}
                          disabled={marcaveisFiltradas.length === 0}
                          onChange={(e) =>
                            setMarcados((atual) => {
                              const proximo = new Set(atual);
                              for (const l of marcaveisFiltradas) {
                                if (e.target.checked) proximo.add(l.codigo);
                                else proximo.delete(l.codigo);
                              }
                              return proximo;
                            })
                          }
                        />
                      </div>
                    </TableHeaderCell>
                    <TableHeaderCell>Código</TableHeaderCell>
                    <TableHeaderCell>Aba</TableHeaderCell>
                    <TableHeaderCell>Unid.</TableHeaderCell>
                    <TableHeaderCell align="right">Peso planilha (kg)</TableHeaderCell>
                    <TableHeaderCell align="right">Peso líq. ERP (kg)</TableHeaderCell>
                    <TableHeaderCell align="right">Fator atual</TableHeaderCell>
                    <TableHeaderCell align="right">Fator novo</TableHeaderCell>
                    <TableHeaderCell>Situação</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visiveis.map((l: LinhaFator) => (
                    <TableRow key={l.codigo} className={DESTACADAS.includes(l.situacao) ? styles.linhaAlerta : undefined}>
                      <TableCell align="center">
                        {l.marcavel && (
                          <div className={styles.checkboxCentro}>
                            <Checkbox
                              label=""
                              aria-label={`Gravar o fator de ${l.codigo}`}
                              checked={marcados.has(l.codigo)}
                              onChange={(e) => alternar(l.codigo, e.target.checked)}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <strong>{l.codigo}</strong>
                      </TableCell>
                      <TableCell>{l.aba}</TableCell>
                      <TableCell>{l.unidEstoque ?? "—"}</TableCell>
                      <TableCell align="right">
                        <span className={styles.numero}>{numero(l.pesoPlanilha, 4)}</span>
                      </TableCell>
                      <TableCell align="right">
                        <span className={styles.numero}>{numero(l.pesoErp, 4)}</span>
                      </TableCell>
                      <TableCell align="right">
                        <span className={styles.numero}>{numero(l.taxaAtual, 6)}</span>
                      </TableCell>
                      <TableCell align="right">
                        {l.operacao ? (
                          <span className={styles.numero}>
                            {numero(l.taxaProposta, 6)}
                            <span className={styles.detalhe}>pelo peso {l.origemPeso === "planilha" ? "da planilha" : "do ERP"}</span>
                          </span>
                        ) : (
                          <span className={styles.secundario}>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={SITUACAO[l.situacao].variante}>{SITUACAO[l.situacao].rotulo}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {filtradas.length > 0 && (
              <Stack direction="row" justify="between" align="center" gap={12} wrap>
                <span className={styles.secundario}>
                  {filtradas.length > POR_PAGINA
                    ? `${inicio + 1}–${inicio + visiveis.length} de ${filtradas.length} item(ns)`
                    : `${filtradas.length} item(ns)`}
                </span>
                {totalPaginas > 1 && <Pagination page={paginaAtual} totalPages={totalPaginas} onPageChange={setPagina} />}
              </Stack>
            )}
          </>
        )}
      </Stack>

      <ConfirmDialog
        open={confirmando}
        title={`Gravar ${escolhidas.length} fator(es) no ERP (${ambienteRotulo})?`}
        confirmLabel="Sim, gravar no ERP"
        variant={analise?.ambiente === "producao" ? "danger" : "default"}
        loading={gravando}
        message={`Empresa ${analise?.codEmpresa ?? ""}, unidade de estoque → KG: ${aIncluir} inclusão(ões) e ${aAlterar} alteração(ões)${
          peloPesoDaPlanilha ? `, ${peloPesoDaPlanilha} delas pelo peso da planilha (peso divergente ou sem peso no ERP)` : ""
        }. O ERP confere tudo antes de gravar; se recusar algum item, nada é gravado.`}
        onConfirm={gravar}
        onClose={() => {
          if (!gravando) setConfirmando(false);
        }}
      />
    </Card>
  );
}
