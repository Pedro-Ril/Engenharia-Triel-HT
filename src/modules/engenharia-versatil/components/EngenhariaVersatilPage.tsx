"use client";

import { useEffect, useState } from "react";
import { FolderPlus, FolderTree, History, Home, RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileUpload } from "@/components/ui/FileUpload";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import {
  analisarPlanilha,
  buscarSeparacao,
  executarSeparacao,
  listarSeparacoes,
  type AcaoItem,
  type ItemSeparacao,
  type MotivoAbaIgnorada,
  type PreviaSeparacao,
  type Separacao,
  type SituacaoItem,
} from "../services/engenhariaVersatil.service";
import styles from "./EngenhariaVersatil.module.css";
import { BotaoDetalhes } from "./BotaoDetalhes";
import { FatoresConversaoCard } from "./FatoresConversaoCard";
import { TabelaArquivos, type LinhaArquivo, type VarianteSituacao } from "./TabelaArquivos";

const POR_PAGINA = 20;

const SITUACAO: Record<SituacaoItem, { rotulo: string; variante: VarianteSituacao }> = {
  copiar: { rotulo: "Vai copiar", variante: "info" },
  ja_existe: { rotulo: "Já existe (pula)", variante: "neutral" },
  nao_encontrado: { rotulo: "Não encontrado", variante: "warning" },
};

const ACAO: Record<AcaoItem, { rotulo: string; variante: VarianteSituacao }> = {
  copiado: { rotulo: "Copiado", variante: "success" },
  ja_existia: { rotulo: "Já existia", variante: "neutral" },
  nao_encontrado: { rotulo: "Não encontrado", variante: "warning" },
  erro: { rotulo: "Erro", variante: "danger" },
};

const MOTIVO: Record<MotivoAbaIgnorada, string> = {
  blacklist: "blacklist",
  sem_cabecalho: "sem a coluna Nº DA PEÇA",
  nome_invalido: "nome que não vale como pasta",
  sem_arquivos: "nenhum arquivo encontrado",
};

function formatarData(valorIso: string | null): string {
  return valorIso ? new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";
}

/*
 * Engenharia Versátil -- separação da engenharia de um projeto: sobe a
 * planilha, vê a prévia (pastas e arquivos) e, confirmando, o Portal
 * cria as pastas na pasta do projeto e copia os desenhos. Nada é
 * sobrescrito nem apagado no destino. Com a mesma planilha, o card de
 * pesos e fatores confere o peso com o ERP e grava o fator para KG.
 */
export function EngenhariaVersatilPage() {
  const [planilha, setPlanilha] = useState<File | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<PreviaSeparacao | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [aberta, setAberta] = useState<{ separacao: Separacao; itens: ItemSeparacao[] } | null>(null);
  const [historico, setHistorico] = useState<{ itens: Separacao[]; total: number } | null>(null);
  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);
  /* Os cards mostram só o resumo; listas e tabelas ficam recolhidas. */
  const [detalhesPrevia, setDetalhesPrevia] = useState(false);
  const [detalhesResultado, setDetalhesResultado] = useState(false);

  useEffect(() => {
    let ativo = true;
    listarSeparacoes({ pagina, porPagina: POR_PAGINA }).then((resultado) => {
      if (ativo && resultado.ok && resultado.data) setHistorico(resultado.data);
    });
    return () => {
      ativo = false;
    };
  }, [pagina, recarga]);

  async function analisar(arquivo: File) {
    setErro(null);
    setPrevia(null);
    setAberta(null);
    setAnalisando(true);
    try {
      const resultado = await analisarPlanilha(arquivo);
      if (resultado.ok && resultado.data) {
        setPrevia(resultado.data);
        setDetalhesPrevia(false);
      }
      else setErro(resultado.message ?? "Não foi possível analisar a planilha.");
    } finally {
      setAnalisando(false);
    }
  }

  function escolherPlanilha(arquivos: File[]) {
    const arquivo = arquivos[0] ?? null;
    setPlanilha(arquivo);
    if (arquivo) void analisar(arquivo);
    else {
      setPrevia(null);
      setErro(null);
    }
  }

  async function abrirSeparacao(id: string) {
    const resultado = await buscarSeparacao(id);
    if (resultado.ok && resultado.data) {
      setAberta(resultado.data);
      setDetalhesResultado(false);
      setPrevia(null);
    } else {
      setErro(resultado.message ?? "Não foi possível abrir a separação.");
    }
  }

  async function executar() {
    if (!planilha) return;
    setExecutando(true);
    try {
      const resultado = await executarSeparacao(planilha);
      setConfirmando(false);
      setRecarga((n) => n + 1);
      if (resultado.ok && resultado.data) {
        /* A planilha continua selecionada: a etapa dos fatores usa o mesmo arquivo. */
        await abrirSeparacao(resultado.data.id);
      } else {
        setErro(resultado.message ?? "Não foi possível concluir a separação.");
      }
    } finally {
      setExecutando(false);
    }
  }

  const linhasPrevia: LinhaArquivo[] = (previa?.plano.itens ?? []).map((i, indice) => ({
    chave: `${indice}`,
    pastaDestino: i.pastaDestino,
    codigo: i.codigo,
    tipo: i.tipo,
    arquivo: i.arquivo,
    situacao: i.situacao,
    ...SITUACAO[i.situacao],
  }));

  const linhasResultado: LinhaArquivo[] = (aberta?.itens ?? []).map((i) => ({
    chave: `${i.ordem}`,
    pastaDestino: i.pastaDestino,
    codigo: i.codigo,
    tipo: i.tipo,
    arquivo: i.arquivo,
    situacao: i.acao,
    ...ACAO[i.acao],
    mensagem: i.acao === "erro" ? i.mensagem : null,
  }));

  const temTrabalho = Boolean(previa && (previa.totais.copiar > 0 || previa.totais.pastasCriar > 0));
  const totalPaginas = historico ? Math.max(1, Math.ceil(historico.total / POR_PAGINA)) : 1;

  return (
    <PageContainer>
      <PageHeader
        title="Engenharia Versátil"
        description="Separa a engenharia de um projeto: cria as pastas a partir das abas da planilha, copia os desenhos para a pasta do projeto na rede e cadastra o fator de conversão no ERP."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Engenharia Versátil", current: true, icon: <FolderTree size={14} /> },
        ]}
      />

      <Stack gap={20}>
        <Card
          title="Planilha do projeto"
          description="O número antes do hífen no nome do arquivo (ex.: 1111 - CAÇAMBA ... .xls) indica a pasta do projeto em PROJETOS GERAL."
        >
          <Stack gap={16}>
            <FileUpload
              label="Selecionar planilha"
              description="Cada aba vira uma pasta (menos as ignoradas). As abas configuradas (ex.: CHAPARIA) recebem PDF e DXF; as demais, só PDF."
              accept=".xls,.xlsx"
              files={planilha ? [planilha] : []}
              disabled={analisando || executando}
              onFilesChange={escolherPlanilha}
            />
            {analisando && <Loader label="Lendo a planilha e conferindo as pastas…" />}
            {erro && <Alert variant="danger">{erro}</Alert>}
          </Stack>
        </Card>

        {previa && (
          <Card
            title={`Prévia · projeto ${previa.numeroProjeto}`}
            description="Nada foi criado nem copiado ainda. Confira e confirme."
          >
            <Stack gap={16}>
              <span className={styles.caminho}>{previa.pastaProjeto}</span>

              <div className={styles.totais}>
                <StatCard label="Pastas a criar" value={previa.totais.pastasCriar} variant="info" />
                <StatCard label="Arquivos a copiar" value={previa.totais.copiar} variant="success" />
                <StatCard label="Já existem (pula)" value={previa.totais.jaExistem} />
                <StatCard label="Não encontrados" value={previa.totais.naoEncontrados} variant="warning" />
              </div>

              <Stack direction="row" justify="between" align="center" gap={12} wrap>
                <Stack direction="row" gap={12} wrap>
                  <Button variant="secondary" onClick={() => planilha && void analisar(planilha)} disabled={analisando}>
                    <RefreshCw size={16} />
                    Analisar de novo
                  </Button>
                  <BotaoDetalhes
                    aberto={detalhesPrevia}
                    onAlternar={() => setDetalhesPrevia((v) => !v)}
                    quantidade={linhasPrevia.length}
                  />
                </Stack>
                <Button onClick={() => setConfirmando(true)} disabled={!temTrabalho}>
                  <FolderPlus size={16} />
                  {temTrabalho
                    ? `Criar ${previa.totais.pastasCriar} pasta(s) e copiar ${previa.totais.copiar} arquivo(s)`
                    : "Nada a fazer: tudo já está na pasta"}
                </Button>
              </Stack>

              {detalhesPrevia && (
                <>
                  <div className={styles.pastas}>
                    {previa.plano.pastas.map((p) => (
                      <span key={p.caminho} className={styles.pasta}>
                        {p.caminho}
                        <Badge variant={p.criar ? "info" : "neutral"}>{p.criar ? "nova" : "já existe"}</Badge>
                      </span>
                    ))}
                  </div>

                  {previa.plano.abasIgnoradas.length > 0 && (
                    <Alert variant="info">
                      Abas que não viram pasta:{" "}
                      {previa.plano.abasIgnoradas
                        .map((a) => `${a.aba} (${MOTIVO[a.motivo]}${a.motivo === "sem_arquivos" ? `, ${a.itens} itens` : ""})`)
                        .join(" · ")}
                    </Alert>
                  )}

                  <TabelaArquivos linhas={linhasPrevia} />
                </>
              )}
            </Stack>
          </Card>
        )}

        {planilha && <FatoresConversaoCard key={`${planilha.name}-${planilha.lastModified}`} planilha={planilha} />}

        {aberta && (
          <Card
            title={`Separação · projeto ${aberta.separacao.numeroProjeto}`}
            description={`${aberta.separacao.arquivoPlanilha} · ${aberta.separacao.usuarioNome} · ${formatarData(aberta.separacao.criadoEm)}`}
          >
            <Stack gap={16}>
              {aberta.separacao.pastaProjeto && <span className={styles.caminho}>{aberta.separacao.pastaProjeto}</span>}
              {aberta.separacao.status === "erro" && (
                <Alert variant="danger">{aberta.separacao.mensagem ?? "A separação falhou."}</Alert>
              )}
              <div className={styles.totais}>
                <StatCard label="Pastas criadas" value={aberta.separacao.pastasCriadas} variant="info" />
                <StatCard label="Copiados" value={aberta.separacao.arquivosCopiados} variant="success" />
                <StatCard label="Já existiam" value={aberta.separacao.arquivosJaExistiam} />
                <StatCard label="Não encontrados" value={aberta.separacao.arquivosNaoEncontrados} variant="warning" />
                <StatCard label="Erros" value={aberta.separacao.arquivosComErro} variant="danger" />
              </div>
              {(linhasResultado.length > 0 || aberta.separacao.mensagem) && (
                <div>
                  <BotaoDetalhes
                    aberto={detalhesResultado}
                    onAlternar={() => setDetalhesResultado((v) => !v)}
                    quantidade={linhasResultado.length}
                  />
                </div>
              )}
              {detalhesResultado && (
                <>
                  {aberta.separacao.status !== "erro" && aberta.separacao.mensagem && (
                    <Alert variant="info">{aberta.separacao.mensagem}</Alert>
                  )}
                  {linhasResultado.length > 0 && <TabelaArquivos linhas={linhasResultado} />}
                </>
              )}
            </Stack>
          </Card>
        )}

        <Card title="Histórico" description="As separações feitas, das mais recentes para as mais antigas. Clique para ver os arquivos.">
          {!historico ? (
            <Loader label="Carregando…" />
          ) : historico.itens.length === 0 ? (
            <EmptyState icon={<History size={28} />} title="Nenhuma separação ainda" />
          ) : (
            <Stack gap={16}>
              <Table minWidth={820}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Quando</TableHeaderCell>
                    <TableHeaderCell>Projeto</TableHeaderCell>
                    <TableHeaderCell>Planilha</TableHeaderCell>
                    <TableHeaderCell>Situação</TableHeaderCell>
                    <TableHeaderCell align="right">Pastas</TableHeaderCell>
                    <TableHeaderCell align="right">Copiados</TableHeaderCell>
                    <TableHeaderCell align="right">Não encontrados</TableHeaderCell>
                    <TableHeaderCell align="right">Erros</TableHeaderCell>
                    <TableHeaderCell>Quem</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historico.itens.map((s) => (
                    <TableRow key={s.id} style={{ cursor: "pointer" }} onClick={() => void abrirSeparacao(s.id)}>
                      <TableCell>{formatarData(s.criadoEm)}</TableCell>
                      <TableCell>
                        <strong>{s.numeroProjeto}</strong>
                      </TableCell>
                      <TableCell>{s.arquivoPlanilha}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "concluida" ? "success" : s.status === "erro" ? "danger" : "info"}>
                          {s.status === "concluida" ? "Concluída" : s.status === "erro" ? "Erro" : "Executando"}
                        </Badge>
                      </TableCell>
                      <TableCell align="right">{s.pastasCriadas}</TableCell>
                      <TableCell align="right">{s.arquivosCopiados}</TableCell>
                      <TableCell align="right">{s.arquivosNaoEncontrados}</TableCell>
                      <TableCell align="right">{s.arquivosComErro}</TableCell>
                      <TableCell>{s.usuarioNome}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPaginas > 1 && (
                <Stack direction="row" justify="end">
                  <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
                </Stack>
              )}
            </Stack>
          )}
        </Card>
      </Stack>

      <ConfirmDialog
        open={confirmando}
        title="Criar as pastas e copiar os arquivos?"
        confirmLabel="Sim, criar e copiar"
        loading={executando}
        message={
          previa
            ? `Em ${previa.pastaProjeto}: ${previa.totais.pastasCriar} pasta(s) nova(s) e ${previa.totais.copiar} arquivo(s) copiados. O que já existe na pasta não é sobrescrito nem apagado.`
            : ""
        }
        onConfirm={executar}
        onClose={() => {
          if (!executando) setConfirmando(false);
        }}
      />
    </PageContainer>
  );
}
