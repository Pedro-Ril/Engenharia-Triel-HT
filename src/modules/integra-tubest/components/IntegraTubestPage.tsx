"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Check,
  ClipboardList,
  Columns3,
  Info,
  FileArchive,
  FileSpreadsheet,
  Home,
  Search,
  Trash2,
} from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Autocomplete } from "@/components/ui/Autocomplete";
import type { AutocompleteOption } from "@/components/ui/Autocomplete/Autocomplete";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { StatCard } from "@/components/ui/StatCard";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import { ColunasModal } from "./ColunasModal";
import InfoIntegracaoModal from "./InfoIntegracaoModal";
import ValidationModal from "./ValidationModal";
import styles from "./IntegraTubestPage.module.css";
import {
  buscarOrdens,
  gerarPlanilha,
  salvarColunas,
  validarStep,
} from "../services/integraTubest.service";
import type {
  ApiIntegracaoItem,
  StepInfo,
  TipoBusca,
} from "../types/integraTubest.types";
import { copiarParaAreaDeTransferencia } from "@/lib/utils/copiar-para-area-transferencia";
import { gerarId } from "@/lib/utils/gerar-id";

import {
  definicaoDaColuna,
  type ChaveColuna,
  type DefinicaoColuna,
} from "../constants/colunas";
import { escolherDestino } from "../utils/salvar-arquivo";

const POR_PAGINA = 15;

/* O que a tela guarda de cada peça. Só as três primeiras vão para o
   arquivo; o resto é conferência (e é o que o TuBest não lê). */
interface LinhaTela {
  id: string;
  /* O item como veio do endpoint: as colunas opcionais leem daqui. */
  item: ApiIntegracaoItem;
  lote: string;
  ordem: string;
  caminho: string;
  codigo: string;
  quantidade: number | "";
  arquivo: string;
  formato: string;
  pasta: string;
  descricao: string;
  codigoMp: string;
  descricaoMp: string;
  qtdeMp: number | "";
  unidadeMp: string;
}

type FiltroStep = "todos" | "com" | "sem";
type Ordenacao = "inclusao" | "codigo" | "materia-prima" | "sem-step";

const ORDENACOES: { value: Ordenacao; label: string }[] = [
  { value: "inclusao", label: "Ordem de inclusão" },
  { value: "codigo", label: "Código da peça" },
  { value: "materia-prima", label: "Matéria-prima" },
  { value: "sem-step", label: "Sem STEP primeiro" },
];

function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { numeric: true });
}

function separarValores(valor: string): string[] {
  return [...new Set(valor.split(",").map((item) => item.trim()).filter(Boolean))];
}

/*
 * Mesma limpeza que a rota aplica -- repetida aqui para o nome que
 * aparece no modal e no "Salvar como" ser exatamente o nome dos arquivos
 * que saem. O servidor sanitiza de novo, porque nome de arquivo vindo do
 * navegador não é coisa em que se confie.
 */
function sanitizarNomeArquivo(valor: string): string {
  return valor
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
}

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/*
 * Matéria-prima vem em unidades diferentes (metro, quilo, peça), então
 * somar tudo num número só mentiria. O total sai por unidade.
 */
function totaisPorUnidade(linhas: LinhaTela[]): string {
  const soma = new Map<string, number>();

  for (const linha of linhas) {
    const quantidade = Number(linha.qtdeMp);
    if (!Number.isFinite(quantidade) || quantidade === 0) continue;

    const unidade = linha.unidadeMp || "—";
    soma.set(unidade, (soma.get(unidade) ?? 0) + quantidade);
  }

  if (soma.size === 0) return "—";

  return [...soma.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([unidade, total]) => `${total.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ${unidade}`)
    .join(" · ");
}

interface IntegraTubestPageProps {
  /* Resolvida no servidor para a tabela não piscar com o padrão antes. */
  colunasIniciais: ChaveColuna[];
}

export function IntegraTubestPage({ colunasIniciais }: IntegraTubestPageProps) {
  const [tipoBusca, setTipoBusca] = useState<TipoBusca>("ordem");
  const [valorBusca, setValorBusca] = useState("");
  /* Só entra no nome do arquivo -- não filtra nem busca nada. */
  const [numeroCarro, setNumeroCarro] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [itensEncontrados, setItensEncontrados] = useState<ApiIntegracaoItem[]>([]);
  const [stepMap, setStepMap] = useState<Record<string, StepInfo>>({});

  const [linhas, setLinhas] = useState<LinhaTela[]>([]);
  const [filtro, setFiltro] = useState("");
  const [filtroStep, setFiltroStep] = useState<FiltroStep>("todos");
  /* Um filtro por coluna habilitada -- a chave é a da coluna. */
  const [filtrosColuna, setFiltrosColuna] = useState<Partial<Record<ChaveColuna, string>>>({});
  /* Padrão: o que está faltando aparece primeiro, que é o que trava a importação. */
  const [ordem, setOrdem] = useState<Ordenacao>("sem-step");
  const [pagina, setPagina] = useState(1);
  const [exportacaoAberta, setExportacaoAberta] = useState(false);
  const [resumoAberto, setResumoAberto] = useState(false);
  const [infoAberto, setInfoAberto] = useState(false);
  const [colunasAberto, setColunasAberto] = useState(false);
  const [colunas, setColunas] = useState<ChaveColuna[]>(colunasIniciais);
  const [resumoTitulo, setResumoTitulo] = useState("");
  const [grupoCopiado, setGrupoCopiado] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  /* Código sem arquivo, sem repetir: a mesma peça pode vir em várias ordens. */
  const codigosSemStep = useMemo(
    () => [...new Set(linhas.filter((linha) => !linha.caminho).map((linha) => linha.codigo))],
    [linhas]
  );

  /* Global: é o que a exportação vai levar, independente do filtro. */
  const semStep = useMemo(() => linhas.filter((linha) => !linha.caminho).length, [linhas]);

  /* A ordem da preferência É a ordem na tela -- a pessoa arrasta no seletor. */
  const colunasVisiveis = useMemo(
    () =>
      colunas
        .map((chave) => definicaoDaColuna(chave))
        .filter((coluna): coluna is DefinicaoColuna => Boolean(coluna)),
    [colunas]
  );

  /*
   * Os filtros seguem as colunas habilitadas: cada coluna filtrável que
   * está na tabela vira um filtro, com as opções saídas dos próprios
   * dados carregados -- não adianta oferecer um valor que não existe na
   * lista.
   */
  const filtrosDisponiveis = useMemo(() => {
    return colunasVisiveis
      .filter((coluna) => coluna.filtravel && coluna.valor)
      .map((coluna) => {
        const mapa = new Map<string, string>();

        for (const linha of linhas) {
          const valor = coluna.valor?.(linha.item) ?? "";
          if (!valor) continue;
          if (!mapa.has(valor)) {
            mapa.set(valor, coluna.rotuloOpcao?.(linha.item) || valor);
          }
        }

        const opcoes: AutocompleteOption[] = [...mapa.entries()]
          .sort((a, b) => compararTexto(a[0], b[0]))
          .map(([valor, rotulo]) => ({ value: valor, label: rotulo }));

        return { coluna, opcoes };
      })
      .filter((filtro) => filtro.opcoes.length > 1);
  }, [colunasVisiveis, linhas]);

  const filtradas = useMemo(() => {
    const termo = normalizar(filtro);

    const lista = linhas.filter((linha) => {
      if (filtroStep === "com" && !linha.caminho) return false;
      if (filtroStep === "sem" && linha.caminho) return false;

      for (const [chave, escolhido] of Object.entries(filtrosColuna)) {
        if (!escolhido) continue;

        const definicao = definicaoDaColuna(chave as ChaveColuna);
        if (definicao?.valor?.(linha.item) !== escolhido) return false;
      }

      if (!termo) return true;

      return [linha.codigo, linha.descricao, linha.codigoMp, linha.descricaoMp, linha.arquivo].some(
        (campo) => normalizar(campo).includes(termo)
      );
    });

    if (ordem === "inclusao") return lista;

    /* Cópia antes de ordenar: `lista` já é nova, mas deixar explícito
       evita alguém reordenar o estado sem querer num ajuste futuro. */
    return [...lista].sort((a, b) => {
      if (ordem === "codigo") return compararTexto(a.codigo, b.codigo);

      if (ordem === "materia-prima") {
        const porMp = compararTexto(a.codigoMp, b.codigoMp);
        return porMp !== 0 ? porMp : compararTexto(a.codigo, b.codigo);
      }

      /* sem-step: quem não tem arquivo sobe, e o resto segue por código. */
      const faltaA = a.caminho ? 1 : 0;
      const faltaB = b.caminho ? 1 : 0;
      return faltaA !== faltaB ? faltaA - faltaB : compararTexto(a.codigo, b.codigo);
    });
  }, [linhas, filtro, filtroStep, filtrosColuna, ordem]);

  /*
   * Todo total da tela (cards do topo e rodapé) sai da lista FILTRADA --
   * filtrar por uma matéria-prima e ver quanto dela vai na planilha é
   * justamente o uso. A exportação é a exceção: leva a lista inteira, e
   * por isso o rodapé avisa quando há filtro ativo, e a confirmação de
   * peças sem STEP continua contando tudo.
   */
  const totalQuantidade = useMemo(
    () => filtradas.reduce((total, linha) => total + (Number(linha.quantidade) || 0), 0),
    [filtradas]
  );

  const totalMp = useMemo(() => totaisPorUnidade(filtradas), [filtradas]);

  const semStepVisiveis = useMemo(
    () => filtradas.filter((linha) => !linha.caminho).length,
    [filtradas]
  );

  /*
   * Nome dos arquivos: CARRO_LOTE. O carro é opcional e o lote sai dos
   * próprios dados -- se a busca juntou mais de um, todos entram no nome,
   * porque o arquivo realmente contém peças dos dois.
   */
  const nomeBase = useMemo(() => {
    const lotes = [...new Set(linhas.map((linha) => linha.lote).filter(Boolean))].sort();
    const partes = [sanitizarNomeArquivo(numeroCarro), lotes.join("-")].filter(Boolean);
    return partes.join("_") || "importacao-tubest";
  }, [linhas, numeroCarro]);

  /*
   * Ordens agrupadas por matéria-prima -- é o que a pessoa usa depois de
   * exportar, para imprimir as ordens de fabricação de cada MP. Mesma
   * ideia do resumo que fecha o processo no Lantek.
   */
  const ordensPorMp = useMemo(() => {
    const mapa = new Map<
      string,
      { codigoMp: string; descricaoMp: string; ordens: Set<string>; pecas: number }
    >();

    for (const linha of linhas) {
      const chave = linha.codigoMp || "sem-mp";
      const grupo = mapa.get(chave) ?? {
        codigoMp: linha.codigoMp,
        descricaoMp: linha.descricaoMp,
        ordens: new Set<string>(),
        pecas: 0,
      };

      if (linha.ordem) grupo.ordens.add(linha.ordem);
      grupo.pecas += 1;
      mapa.set(chave, grupo);
    }

    return [...mapa.values()]
      .map((grupo) => ({
        ...grupo,
        ordens: [...grupo.ordens].sort((a, b) => compararTexto(a, b)),
      }))
      .sort((a, b) => compararTexto(a.codigoMp, b.codigoMp));
  }, [linhas]);

  /* Quantos arquivos sairiam se a pessoa escolher separar por MP. */
  const totalArquivosPorMp = useMemo(
    () => new Set(linhas.map((linha) => linha.codigoMp || "SEM-MP")).size,
    [linhas]
  );

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const visiveis = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  /* Remover linhas ou filtrar pode encurtar a lista embaixo do pé da pessoa. */
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  async function handleBuscar() {
    const valores = separarValores(valorBusca);

    if (!valores.length) {
      setErro(`Informe ${tipoBusca === "ordem" ? "uma ordem" : "um lote"} para buscar.`);
      return;
    }

    try {
      setBuscando(true);
      setErro("");
      setAviso("");

      const respostas = await Promise.all(valores.map((valor) => buscarOrdens(tipoBusca, valor)));

      const itens = respostas.flatMap((resposta) =>
        Array.isArray(resposta?.value) ? resposta.value : []
      );

      if (!itens.length) {
        setErro("Nenhum registro foi encontrado para a consulta informada.");
        return;
      }

      /* O desenho vai junto: é por ele que a peça da Ciber é encontrada. */
      const validacao = await validarStep(
        itens.map((item) => ({
          codigo: String(item.cod_item ?? "").trim(),
          codDesenho: String(item.cod_desenho ?? "").trim(),
        }))
      );

      const mapa: Record<string, StepInfo> = {};
      validacao.resultados.forEach((resultado) => {
        mapa[resultado.codigo] = {
          codigoUsado: resultado.codigoUsado,
          origem: resultado.origem,
          pasta: resultado.pasta,
          existe: resultado.existe,
          duplicado: resultado.duplicado,
          caminho: resultado.caminho,
          arquivo: resultado.arquivo,
          caminhos: resultado.caminhos,
          formato: resultado.formato,
        };
      });

      setStepMap(mapa);
      setItensEncontrados(itens);
      setModalAberto(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro inesperado ao buscar os dados.");
    } finally {
      setBuscando(false);
    }
  }

  function handleConfirmarModal(itens: ApiIntegracaoItem[]) {
    const novas: LinhaTela[] = itens.map((item) => {
      const codigo = String(item.cod_item ?? "").trim();
      const info = stepMap[codigo];

      return {
        /* gerarId e não crypto.randomUUID: em HTTP o método não existe. */
        id: gerarId(),
        item,
        lote: String(item.num_lote_pro ?? "").trim(),
        ordem: String(item.num_ordem ?? "").trim(),
        caminho: info?.caminho ?? "",
        codigo,
        quantidade: item.qtde ?? "",
        arquivo: info?.arquivo ?? "",
        formato: info?.formato ?? "",
        pasta: info?.pasta ?? "",
        descricao: item.desc_tecnica ?? "",
        codigoMp: item.cod_item_mp ?? "",
        descricaoMp: item.desc_tecnica_mp ?? "",
        qtdeMp: item.qtde_mp ?? "",
        unidadeMp: item.cod_unid_med_mp ?? "",
      };
    });

    setLinhas((anteriores) => [...anteriores, ...novas]);
    setModalAberto(false);

    const faltando = novas.filter((linha) => !linha.caminho).length;
    setAviso(
      faltando > 0
        ? `${faltando} peça(s) entraram sem arquivo STEP — a coluna do caminho vai vazia na planilha.`
        : ""
    );
  }

  /*
   * As colunas com apresentação própria (peça, descrição, MP, arquivo,
   * ações) são tratadas aqui; o resto sai direto do item, pelo `valor`
   * declarado no catálogo.
   */
  function celulaDaColuna(linha: LinhaTela, chave: ChaveColuna) {
    switch (chave) {
      case "peca":
        return <strong className={styles.codigo}>{linha.codigo}</strong>;

      case "descricao":
        return (
          <span className={styles.truncado} title={linha.descricao}>
            {linha.descricao || "—"}
          </span>
        );

      case "descricaoMp":
        return (
          <span className={styles.truncado} title={linha.descricaoMp}>
            {linha.descricaoMp || "—"}
          </span>
        );

      case "qtdeMp":
        return linha.qtdeMp === ""
          ? "—"
          : `${Number(linha.qtdeMp).toLocaleString("pt-BR", {
              maximumFractionDigits: 4,
            })} ${linha.unidadeMp}`.trim();

      case "arquivo":
        return linha.caminho ? (
          /* O nome basta na tela; o caminho inteiro vai para o arquivo e
             aparece ao parar o mouse. */
          <span className={styles.arquivo} title={linha.caminho}>
            {linha.arquivo}
            {linha.formato === "igs" && <span className={styles.marcadorIgs}>IGS</span>}
            {linha.pasta === "ciber" && <span className={styles.marcadorCiber}>CIBER</span>}
          </span>
        ) : (
          <Badge variant="warning">sem arquivo STEP</Badge>
        );

      case "acoes":
        return (
          <IconButton
            icon={<Trash2 size={16} />}
            label={`Remover ${linha.codigo}`}
            variant="neutral"
            size="small"
            onClick={() => handleRemoverLinha(linha.id)}
          />
        );

      default: {
        const texto = definicaoDaColuna(chave)?.valor?.(linha.item) ?? "";

        return texto ? (
          <span className={styles.truncado} title={texto}>
            {texto}
          </span>
        ) : (
          "—"
        );
      }
    }
  }

  async function handleAplicarColunas(novas: ChaveColuna[]) {
    setColunas(novas);
    setColunasAberto(false);

    /* Falha ao salvar não desfaz a escolha na tela -- só avisa. */
    const salvou = await salvarColunas(novas);
    if (!salvou) {
      setAviso("As colunas foram aplicadas, mas não deu para salvar sua preferência.");
    }
  }

  function handleRemoverLinha(id: string) {
    setLinhas((anteriores) => anteriores.filter((linha) => linha.id !== id));
  }

  function handleLimpar() {
    setValorBusca("");
    setNumeroCarro("");
    setErro("");
    setAviso("");
    setLinhas([]);
    setFiltro("");
    setFiltroStep("todos");
    setFiltrosColuna({});
    setOrdem("sem-step");
    setPagina(1);
    setItensEncontrados([]);
    setStepMap({});
  }

  async function handleCopiarSemStep() {
    /* Um por linha: é o formato que cola direto em e-mail, chamado ou planilha. */
    const copiou = await copiarParaAreaDeTransferencia(codigosSemStep.join("\n"));

    setErro("");
    setAviso(
      copiou
        ? `${codigosSemStep.length} código(s) sem STEP copiado(s).`
        : "Não foi possível copiar — selecione e copie manualmente."
    );
  }

  async function handleCopiarOrdens(chave: string, ordens: string[]) {
    /* Vírgula: é o formato que o campo de filtro da impressão de OF aceita. */
    const copiou = await copiarParaAreaDeTransferencia(ordens.join(", "));
    if (!copiou) return;

    setGrupoCopiado(chave);
    window.setTimeout(() => {
      setGrupoCopiado((atual) => (atual === chave ? null : atual));
    }, 1800);
  }

  function handleClicarExportar() {
    if (!linhas.length) {
      setErro("Não há linhas para exportar.");
      return;
    }

    setErro("");
    setExportacaoAberta(true);
  }

  async function exportar(separarPorMp: boolean) {
    try {
      setErro("");

      const extensao = separarPorMp ? "zip" : "xlsx";

      /* O diálogo vem primeiro, ainda no gesto do clique -- ver
         escolherDestino. Só depois os arquivos são gerados. */
      const destino = await escolherDestino(`${nomeBase}.${extensao}`);

      if (!destino) {
        setExportacaoAberta(false);
        setAviso("Exportação cancelada — nada foi salvo.");
        return;
      }

      setExportando(true);

      /* Só as três colunas do modelo vão para a planilha; a MP viaja
         junto apenas para separar os arquivos. */
      const arquivo = await gerarPlanilha(
        linhas.map((linha) => ({
          caminho: linha.caminho,
          codigo: linha.codigo,
          ordem: linha.ordem,
          quantidade: linha.quantidade,
          codigoMp: linha.codigoMp,
        })),
        { separarPorMp, nomeBase, numeroCarro: numeroCarro.trim() }
      );

      const resultado = await destino.gravar(arquivo);
      const verbo = resultado === "salvo" ? "salvo" : "baixado";

      setExportacaoAberta(false);
      setAviso("");
      setResumoTitulo(
        separarPorMp
          ? `${nomeBase}.zip ${verbo} — ${totalArquivosPorMp} arquivo(s), um por matéria-prima.`
          : `${nomeBase}.xlsx ${verbo} — ${linhas.length} linha(s).`
      );
      setResumoAberto(true);
    } catch (error) {
      setExportacaoAberta(false);
      setErro(error instanceof Error ? error.message : "Erro inesperado ao exportar.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Integração TuBest"
        description="Busca as peças da ordem ou do lote no FoccoERP, confere o arquivo STEP de cada uma e monta a planilha de importação em lote do TuBest."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Integração TuBest", current: true, icon: <Boxes size={14} /> },
        ]}
      />

      <Card
        title="Consulta"
        description="Informe uma ou mais ordens ou lotes, separados por vírgula."
        actions={
          <Button variant="secondary" onClick={() => setInfoAberto(true)}>
            <Info size={15} />
            Integração ativa
          </Button>
        }
      >
        <Stack gap={16}>
          <Stack direction="row" gap={12} align="end" wrap>
            <Field label="Tipo de busca">
              <Dropdown
                value={tipoBusca}
                options={[
                  { value: "ordem", label: "Ordem" },
                  { value: "lote", label: "Lote" },
                ]}
                onValueChange={(valor) => setTipoBusca(valor as TipoBusca)}
                disabled={buscando}
              />
            </Field>

            <Field label={tipoBusca === "ordem" ? "Ordem(ns)" : "Lote(s)"}>
              <Input
                value={valorBusca}
                placeholder="Ex.: 12345, 12346"
                disabled={buscando}
                onChange={(event) => setValorBusca(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleBuscar();
                }}
              />
            </Field>

            <Field label="Nº do carro (opcional)">
              <Input
                value={numeroCarro}
                placeholder="Ex.: 1234"
                disabled={buscando}
                onChange={(event) => setNumeroCarro(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleBuscar();
                }}
              />
            </Field>

            <Stack direction="row" gap={8}>
              <Button onClick={handleBuscar} loading={buscando}>
                <Search size={16} />
                Buscar
              </Button>

              <Button variant="secondary" onClick={handleLimpar} disabled={buscando}>
                Limpar
              </Button>
            </Stack>
          </Stack>

          {erro && <Alert variant="danger">{erro}</Alert>}
          {aviso && <Alert variant="warning">{aviso}</Alert>}
        </Stack>
      </Card>

      <Card
        title="Peças da planilha"
        description="Do arquivo saem três colunas: o caminho do STEP, o nome da peça (código_ordem_carro) e a quantidade. A matéria-prima fica aqui só para conferência."
      >
        <Stack gap={16}>
          {linhas.length === 0 ? (
            <EmptyState
              title="Nenhuma peça ainda"
              description="Faça uma busca e confirme a conferência para montar a planilha."
            />
          ) : (
            <>
              <FormGrid columns={4}>
                <StatCard className={styles.card} label="Peças" value={filtradas.length} />
                <StatCard className={styles.card} label="Quantidade total" value={totalQuantidade} />
                <StatCard
                  className={styles.card}
                  label="Matéria-prima"
                  value={<span className={styles.totalMp}>{totalMp}</span>}
                  description="Somada por unidade"
                />
                <StatCard
                  className={styles.card}
                  label="Sem STEP"
                  value={semStepVisiveis}
                  variant={semStepVisiveis > 0 ? "warning" : "neutral"}
                />
              </FormGrid>

              <FormGrid columns={4}>
                <Field label="Buscar">
                  <Input
                    value={filtro}
                    placeholder="Peça, descrição, matéria-prima ou arquivo..."
                    onChange={(event) => {
                      setFiltro(event.target.value);
                      setPagina(1);
                    }}
                  />
                </Field>

                {/* Só faz sentido filtrar pelo arquivo se a coluna dele estiver na tabela. */}
                {colunas.includes("arquivo") && (
                  <Field label="Arquivo STEP">
                    <Dropdown
                      value={filtroStep}
                      options={[
                        { value: "todos", label: "Todas as peças" },
                        { value: "com", label: "Com STEP" },
                        { value: "sem", label: "Sem STEP" },
                      ]}
                      onValueChange={(valor) => {
                        setFiltroStep(valor as FiltroStep);
                        setPagina(1);
                      }}
                    />
                  </Field>
                )}

                {filtrosDisponiveis.map(({ coluna, opcoes }) => (
                  <Field key={coluna.chave} label={coluna.label}>
                    {/* Autocomplete quando a lista é longa (dezenas de MPs,
                        por exemplo): digitar é mais rápido do que rolar. */}
                    {opcoes.length > 8 ? (
                      <Autocomplete
                        options={opcoes}
                        selectedOption={
                          opcoes.find((opcao) => opcao.value === filtrosColuna[coluna.chave]) ?? null
                        }
                        placeholder={`Todos — ${coluna.label}`}
                        emptyMessage="Nenhuma opção encontrada"
                        onSelect={(opcao) => {
                          setFiltrosColuna((anterior) => ({
                            ...anterior,
                            [coluna.chave]: opcao?.value ?? "",
                          }));
                          setPagina(1);
                        }}
                      />
                    ) : (
                      <Dropdown
                        value={filtrosColuna[coluna.chave] ?? ""}
                        options={[{ value: "", label: `Todos — ${coluna.label}` }, ...opcoes.map(
                          (opcao) => ({ value: opcao.value, label: opcao.label })
                        )]}
                        onValueChange={(valor) => {
                          setFiltrosColuna((anterior) => ({ ...anterior, [coluna.chave]: valor }));
                          setPagina(1);
                        }}
                      />
                    )}
                  </Field>
                ))}

                <Field label="Ordenar por">
                  <Dropdown
                    value={ordem}
                    options={ORDENACOES}
                    onValueChange={(valor) => {
                      setOrdem(valor as Ordenacao);
                      setPagina(1);
                    }}
                  />
                </Field>
              </FormGrid>

              <Stack direction="row" gap={12} align="center" justify="between" wrap>
                <Button variant="secondary" onClick={() => setColunasAberto(true)}>
                  <Columns3 size={15} />
                  Colunas
                </Button>

                <span className={styles.contagem}>
                  {filtradas.length === linhas.length
                    ? `${linhas.length} peça(s)`
                    : `${filtradas.length} de ${linhas.length} peça(s)`}
                </span>

                {(filtro ||
                  filtroStep !== "todos" ||
                  Object.values(filtrosColuna).some(Boolean) ||
                  ordem !== "sem-step") && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFiltro("");
                      setFiltroStep("todos");
                      setFiltrosColuna({});
                      setOrdem("sem-step");
                      setPagina(1);
                    }}
                  >
                    Limpar filtros
                  </Button>
                )}
              </Stack>

              <Table minWidth={Math.max(900, colunasVisiveis.length * 150)}>
                <TableHead>
                  <TableRow>
                    {colunasVisiveis.map((coluna) => (
                      <TableHeaderCell key={coluna.chave} align={coluna.alinhamento}>
                        {coluna.label}
                      </TableHeaderCell>
                    ))}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {visiveis.map((linha) => (
                    <TableRow key={linha.id}>
                      {colunasVisiveis.map((coluna) => (
                        <TableCell key={coluna.chave} align={coluna.alinhamento}>
                          {celulaDaColuna(linha, coluna.chave)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className={styles.totais}>
                <div className={styles.totalItem}>
                  <span className={styles.totalRotulo}>Peças</span>
                  <strong className={styles.totalValor}>{filtradas.length}</strong>
                </div>

                <div className={styles.totalItem}>
                  <span className={styles.totalRotulo}>Quantidade de itens</span>
                  <strong className={styles.totalValor}>{totalQuantidade}</strong>
                </div>

                <div className={styles.totalItem}>
                  <span className={styles.totalRotulo}>Quantidade MP</span>
                  <strong className={styles.totalValor}>{totalMp}</strong>
                </div>

                {filtradas.length !== linhas.length && (
                  <span className={styles.totalObs}>
                    Totais do filtro atual — a exportação leva as {linhas.length} peças
                  </span>
                )}
              </div>

              {totalPaginas > 1 && (
                <Stack direction="row" justify="center">
                  <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
                </Stack>
              )}

              <Stack direction="row" gap={8} justify="end">
                {codigosSemStep.length > 0 && (
                  <Button variant="secondary" onClick={handleCopiarSemStep}>
                    <ClipboardList size={16} />
                    Copiar {codigosSemStep.length} código(s) sem STEP
                  </Button>
                )}

                <Button onClick={handleClicarExportar} loading={exportando}>
                  <FileSpreadsheet size={16} />
                  Exportar XLSX
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </Card>

      {colunasAberto && (
        <ColunasModal
          open
          colunas={colunas}
          onAplicar={handleAplicarColunas}
          onClose={() => setColunasAberto(false)}
        />
      )}

      <InfoIntegracaoModal open={infoAberto} onClose={() => setInfoAberto(false)} />

      <ValidationModal
        open={modalAberto}
        items={itensEncontrados}
        stepMap={stepMap}
        onClose={() => setModalAberto(false)}
        onConfirm={handleConfirmarModal}
      />

      {/*
        O aviso de peças sem STEP mora aqui dentro, e não num ConfirmDialog
        separado: são duas perguntas seguidas sobre a mesma ação, e o clique
        em uma das opções precisa ser o gesto que abre o "Salvar como".
      */}
      <Modal
        open={exportacaoAberta}
        onClose={() => setExportacaoAberta(false)}
        size="medium"
        title="Como gerar a planilha?"
        description="Um arquivo com tudo, ou um arquivo por matéria-prima."
      >
        <Stack gap={16}>
          {semStep > 0 && (
            <Alert variant="warning">
              {semStep} de {linhas.length} peça(s) não têm arquivo STEP na pasta. Elas vão para a
              planilha com a coluna do caminho vazia.
            </Alert>
          )}

          <div className={styles.opcoes}>
            <button
              type="button"
              className={styles.opcao}
              disabled={exportando}
              onClick={() => exportar(false)}
            >
              <FileSpreadsheet size={20} />
              <strong>Arquivo único</strong>
              <span>
                {nomeBase}.xlsx — {linhas.length} linha(s)
              </span>
            </button>

            <button
              type="button"
              className={styles.opcao}
              disabled={exportando}
              onClick={() => exportar(true)}
            >
              <FileArchive size={20} />
              <strong>Separar por matéria-prima</strong>
              <span>
                {nomeBase}.zip — {totalArquivosPorMp} arquivo(s), um por MP
              </span>
            </button>
          </div>
        </Stack>
      </Modal>
      {/*
        Fecha o processo: com a planilha na mão, o passo seguinte é imprimir
        as ordens de fabricação -- e elas são separadas por matéria-prima.
        Mesmo encerramento do fluxo do Lantek.
      */}
      <Modal
        open={resumoAberto}
        onClose={() => setResumoAberto(false)}
        size="xlarge"
        title="Exportação concluída"
        description={resumoTitulo}
      >
        <Stack gap={16}>
          <p className={styles.resumoIntro}>
            Ordens por matéria-prima, para imprimir as ordens de fabricação:
          </p>

          <div className={styles.grupos}>
            {ordensPorMp.map((grupo) => {
              const chave = grupo.codigoMp || "sem-mp";

              return (
                <div key={chave} className={styles.grupo}>
                  <div className={styles.grupoTopo}>
                    <strong className={styles.grupoTitulo}>
                      {grupo.codigoMp || "Sem matéria-prima"}
                      {grupo.descricaoMp && (
                        <span className={styles.grupoDescricao}> — {grupo.descricaoMp}</span>
                      )}
                    </strong>

                    <Button
                      variant="secondary"
                      className={styles.botaoCopiar}
                      disabled={grupo.ordens.length === 0}
                      onClick={() => handleCopiarOrdens(chave, grupo.ordens)}
                    >
                      {grupoCopiado === chave ? (
                        <>
                          <Check size={13} />
                          Copiado
                        </>
                      ) : (
                        <>
                          <ClipboardList size={13} />
                          Copiar {grupo.ordens.length} ordem(ns)
                        </>
                      )}
                    </Button>
                  </div>

                  <span className={styles.grupoOrdens}>
                    {grupo.ordens.length > 0 ? grupo.ordens.join(", ") : "sem ordem"}
                  </span>

                  <span className={styles.grupoPecas}>{grupo.pecas} peça(s)</span>
                </div>
              );
            })}
          </div>
        </Stack>
      </Modal>
    </PageContainer>
  );
}
