import "server-only";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import {
  COR_FUNDO_ALTERNADO,
  COR_LINHA,
  COR_PRIMARIA,
  COR_TEXTO,
  COR_TEXTO_SUAVE,
  CORES_VARIANTE_PDF,
  ESTILO_CABECALHO_TABELA,
  ESTILO_TABELA,
  MARGEM,
  MARGEM_TOPO_TABELA,
  TOPO_CONTEUDO,
  desenharFaixa,
  desenharRodapes,
  desenharTituloSecao,
  fimUltimaTabela,
  larguraPagina,
  limiteConteudoY,
  textoPdf,
} from "@/lib/pdf/padrao-portal";
import type { CabecalhoPdf, CorRgb } from "@/lib/pdf/padrao-portal";
import type {
  Ambiente3dx,
  Execucao3dx,
  ItemExecucao3dx,
  ModoPlugin3dx,
} from "@/modules/plugins-3dx/types/plugins3dx.types";
import {
  ACAO_ITEM,
  AMBIENTE,
  formatarDuracao,
  GATILHO,
  MODO,
  NOME_CURTO_PLUGIN,
  nomeCurtoPlugin,
  rotuloObjeto,
  situacaoExecucao,
  STATUS_BARRADA,
  STATUS_EXECUCAO,
} from "@/modules/plugins-3dx/utils/exibicao";

/*
 * Relatório diário de uso dos Plugins 3DX: números do dia (resumo gerencial) e os arquivos anexos.
 * Tudo aqui é função pura sobre os dados já carregados (relatorio-diario.ts busca no banco e envia):
 *  - calcularResumo: os indicadores usados no e-mail, no PDF e no Excel (uma conta só, os três batem);
 *  - gerarPdf: padrão visual dos PDFs do portal (src/lib/pdf/padrao-portal.ts), em paisagem;
 *  - gerarExcel: resumo + detalhe completo (todos os objetos, inclusive os que não mudaram nada);
 *  - montarCorpoEmail: o resumo gerencial no corpo (os detalhes vão nos anexos).
 */

const MODULO = "Plugins 3DX";

/* O que de fato mudou no 3DEXPERIENCE (Ativo) e o que mudaria (Simulação). "pai_nao_liberado" não altera nada. */
const ACOES_ALTERACAO = new Set(["titulo_alterado", "instancia_substituida", "revisao_obsoleta", "vinculo_criado"]);
const ACOES_SIMULADAS = new Set([...ACOES_ALTERACAO].map((acao) => `seria_${acao}`));

export interface ItemRelatorio3dx extends ItemExecucao3dx {
  execucaoId: string;
}

export interface DiaRelatorio3dx {
  /* AAAA-MM-DD */
  data: string;
  execucoes: number;
  comFalha: number;
  alteracoes: number;
}

export interface ModoAtualPlugin3dx {
  pluginChave: string;
  ambiente: Ambiente3dx;
  modo: ModoPlugin3dx;
}

export interface DadosRelatorio3dx {
  /* AAAA-MM-DD: o dia coberto */
  data: string;
  /* null = produção e teste juntos */
  ambiente: Ambiente3dx | null;
  execucoes: Execucao3dx[];
  itens: ItemRelatorio3dx[];
  /* os 7 dias terminando em `data` (o próprio dia incluído), do mais antigo ao mais novo */
  ultimosDias: DiaRelatorio3dx[];
  modos: ModoAtualPlugin3dx[];
}

interface LinhaPlugin {
  chave: string;
  nome: string;
  modos: string;
  execucoes: number;
  objetos: number;
  alteracoes: number;
  simuladas: number;
  falhas: number;
}

interface LinhaUsuario {
  nome: string;
  execucoes: number;
  alteracoes: number;
  simuladas: number;
}

export interface ResumoRelatorio3dx {
  execucoes: number;
  porStatus: [string, number][];
  comFalha: number;
  objetos: number;
  alteracoes: number;
  simuladas: number;
  falhasObjeto: number;
  usuarios: number;
  duracaoMediaMs: number | null;
  duracaoMaxMs: number | null;
  porPlugin: LinhaPlugin[];
  porGatilho: [string, number][];
  porAmbiente: [string, number, number, number][];
  porUsuario: LinhaUsuario[];
  execucoesComFalha: Execucao3dx[];
}

// ------------------------------------------------------------------ formatação

export function formatarDia(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function diaDaSemana(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return DIAS_SEMANA[new Date(ano, mes - 1, dia).getDay()];
}

/* O banco grava hora local sem fuso ("2026-11-23T08:47:56.123"): a hora sai direto do texto, sem passar por Date. */
function hora(iso: string | null): string {
  return iso && iso.length >= 19 ? iso.slice(11, 19) : "—";
}

export function rotuloEscopo(ambiente: Ambiente3dx | null): string {
  return ambiente ? AMBIENTE[ambiente].label : "Produção e Teste";
}

function quem(execucao: Execucao3dx): string {
  return execucao.atorNome ?? execucao.atorLogin ?? execucao.solicitadoPorNome ?? "—";
}

function pct(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : "—";
}

// ------------------------------------------------------------------ indicadores

export function calcularResumo(dados: DadosRelatorio3dx): ResumoRelatorio3dx {
  const { execucoes, itens } = dados;
  const itensPorExecucao = new Map<string, ItemRelatorio3dx[]>();
  for (const item of itens) {
    itensPorExecucao.set(item.execucaoId, [...(itensPorExecucao.get(item.execucaoId) ?? []), item]);
  }
  const contarItens = (lista: ItemRelatorio3dx[]) => ({
    alteracoes: lista.filter((i) => i.sucesso && ACOES_ALTERACAO.has(i.acao)).length,
    simuladas: lista.filter((i) => i.sucesso && ACOES_SIMULADAS.has(i.acao)).length,
    falhas: lista.filter((i) => !i.sucesso).length,
  });
  const totais = contarItens(itens);

  /* "Barrada" (liberação que não se concretizou no 3DX) sai à parte de "Ignorada", como na tela. */
  const porStatus = [
    ...Object.entries(STATUS_EXECUCAO).map(([status, info]): [string, number] => [
      info.label,
      execucoes.filter((e) => e.status === status && !e.barrada).length,
    ]),
    [STATUS_BARRADA.label, execucoes.filter((e) => e.barrada).length] as [string, number],
  ].filter(([, n]) => n > 0);

  const duracoes = execucoes.map((e) => e.duracaoMs).filter((d): d is number => d !== null);

  /* Todos os plugins conhecidos aparecem, mesmo sem uso no dia (o "zero" também é informação). */
  const chaves = [...new Set([...Object.keys(NOME_CURTO_PLUGIN), ...execucoes.map((e) => e.pluginChave)])];
  const porPlugin = chaves.map((chave): LinhaPlugin => {
    const doPlugin = execucoes.filter((e) => e.pluginChave === chave);
    const itensPlugin = doPlugin.flatMap((e) => itensPorExecucao.get(e.id) ?? []);
    const contagem = contarItens(itensPlugin);
    const modos = dados.modos
      .filter((m) => m.pluginChave === chave && (dados.ambiente === null || m.ambiente === dados.ambiente))
      .sort((a, b) => a.ambiente.localeCompare(b.ambiente))
      .map((m) => (dados.ambiente ? MODO[m.modo].label : `${AMBIENTE[m.ambiente].label}: ${MODO[m.modo].label}`))
      .join(" · ");
    return {
      chave,
      nome: nomeCurtoPlugin(chave),
      modos: modos || "—",
      execucoes: doPlugin.length,
      objetos: itensPlugin.length,
      alteracoes: contagem.alteracoes,
      simuladas: contagem.simuladas,
      falhas: doPlugin.filter((e) => e.status === "falha" || e.status === "parcial").length,
    };
  });

  const porGatilho = Object.entries(GATILHO)
    .map(([gatilho, label]): [string, number] => [label, execucoes.filter((e) => e.gatilho === gatilho).length])
    .filter(([, n]) => n > 0);

  const porAmbiente =
    dados.ambiente === null
      ? (["PRODUCAO", "TESTE"] as Ambiente3dx[]).map((ambiente): [string, number, number, number] => {
          const doAmbiente = execucoes.filter((e) => e.ambiente === ambiente);
          const contagem = contarItens(doAmbiente.flatMap((e) => itensPorExecucao.get(e.id) ?? []));
          return [
            AMBIENTE[ambiente].label,
            doAmbiente.length,
            contagem.alteracoes + contagem.simuladas,
            doAmbiente.filter((e) => e.status === "falha" || e.status === "parcial").length,
          ];
        })
      : [];

  const usuarios = new Map<string, LinhaUsuario>();
  for (const execucao of execucoes) {
    const nome = quem(execucao);
    const linha = usuarios.get(nome) ?? { nome, execucoes: 0, alteracoes: 0, simuladas: 0 };
    const contagem = contarItens(itensPorExecucao.get(execucao.id) ?? []);
    linha.execucoes += 1;
    linha.alteracoes += contagem.alteracoes;
    linha.simuladas += contagem.simuladas;
    usuarios.set(nome, linha);
  }

  return {
    execucoes: execucoes.length,
    porStatus,
    comFalha: execucoes.filter((e) => e.status === "falha" || e.status === "parcial").length,
    objetos: itens.length,
    alteracoes: totais.alteracoes,
    simuladas: totais.simuladas,
    falhasObjeto: totais.falhas,
    usuarios: [...usuarios.keys()].filter((nome) => nome !== "—").length,
    duracaoMediaMs: duracoes.length ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length) : null,
    duracaoMaxMs: duracoes.length ? Math.max(...duracoes) : null,
    porPlugin,
    porGatilho,
    porAmbiente,
    porUsuario: [...usuarios.values()].sort((a, b) => b.execucoes - a.execucoes || a.nome.localeCompare(b.nome)),
    execucoesComFalha: execucoes.filter((e) => e.status === "falha" || e.status === "parcial"),
  };
}

/* Indicadores do topo -- os mesmos no e-mail, no PDF e no Excel. */
function indicadores(resumo: ResumoRelatorio3dx): { rotulo: string; valor: string; detalhe: string }[] {
  return [
    {
      rotulo: "Execuções",
      valor: String(resumo.execucoes),
      detalhe: resumo.porStatus.map(([label, n]) => `${n} ${label.toLowerCase()}`).join(" · ") || "nenhuma",
    },
    {
      rotulo: "Alterações feitas",
      valor: String(resumo.alteracoes),
      detalhe: `em ${resumo.objetos} objeto(s) tratado(s)`,
    },
    {
      rotulo: "Em simulação",
      valor: String(resumo.simuladas),
      detalhe: "alterações que seriam feitas",
    },
    {
      rotulo: "Com falha",
      valor: String(resumo.comFalha),
      detalhe: `${resumo.falhasObjeto} objeto(s) não tratado(s)`,
    },
    {
      rotulo: "Usuários",
      valor: String(resumo.usuarios),
      detalhe: "acionaram os plugins",
    },
    {
      rotulo: "Tempo médio",
      valor: formatarDuracao(resumo.duracaoMediaMs),
      detalhe: `maior: ${formatarDuracao(resumo.duracaoMaxMs)}`,
    },
  ];
}

// ------------------------------------------------------------------ linhas de detalhe (PDF e Excel)

function linhaExecucao(execucao: Execucao3dx): string[] {
  const status = situacaoExecucao(execucao).label;
  return [
    hora(execucao.enfileiradoEm),
    AMBIENTE[execucao.ambiente].label,
    nomeCurtoPlugin(execucao.pluginChave),
    GATILHO[execucao.gatilho],
    rotuloObjeto(execucao.objetoNome, execucao.objetoRevisao, execucao.objetoTitulo),
    quem(execucao),
    execucao.modo === "ATIVO" ? status : `${status} (${MODO[execucao.modo].label})`,
    execucao.totalItens === null ? "—" : String(execucao.totalItens),
    formatarDuracao(execucao.duracaoMs),
  ];
}

const CABECALHO_EXECUCOES = ["Hora", "Ambiente", "Plugin", "Gatilho", "Objeto", "Quem", "Status", "Itens", "Duração"];

/* No PDF só entra o que mudou (ou mudaria, ou falhou); os "nada a fazer" ficam no Excel. */
function itemRelevante(item: ItemRelatorio3dx): boolean {
  return !item.sucesso || ACOES_ALTERACAO.has(item.acao) || ACOES_SIMULADAS.has(item.acao);
}

// ------------------------------------------------------------------ PDF

/* Usuários no PDF (os demais ficam no Excel): cabe na meia página ao lado dos últimos 7 dias. */
const MAX_USUARIOS_PDF = 15;
const ESPACO_ENTRE_COLUNAS = 8;

/* Começo da próxima seção depois de `y`: se não couber `espaco` mm (título + algumas linhas), abre página nova. */
function posicaoSecao(doc: jsPDF, y: number, redesenharFaixa: () => void, espaco = 30): number {
  const cursorY = y + 12;
  if (cursorY > limiteConteudoY(doc) - espaco) {
    doc.addPage();
    redesenharFaixa();
    return TOPO_CONTEUDO;
  }
  return cursorY;
}

/* Texto cinza de observação logo abaixo de uma tabela. Devolve onde terminou. */
function nota(doc: jsPDF, texto: string, y: number, x = MARGEM, largura?: number): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COR_TEXTO_SUAVE);
  const linhas = doc.splitTextToSize(textoPdf(texto), largura ?? larguraPagina(doc) - MARGEM * 2);
  doc.text(linhas, x, y + 5);
  return y + 5 + (linhas.length - 1) * 3.5;
}

/* Cartões de indicador (o "painel" do topo): valor grande, rótulo e detalhe. */
function desenharIndicadores(doc: jsPDF, resumo: ResumoRelatorio3dx, y: number): number {
  const lista = indicadores(resumo);
  const espaco = 4;
  const largura = (larguraPagina(doc) - MARGEM * 2 - espaco * (lista.length - 1)) / lista.length;
  const altura = 26;
  lista.forEach((indicador, i) => {
    const x = MARGEM + i * (largura + espaco);
    doc.setFillColor(...COR_FUNDO_ALTERNADO);
    doc.setDrawColor(...COR_LINHA);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, largura, altura, 2, 2, "FD");
    doc.setFillColor(...COR_PRIMARIA);
    doc.rect(x, y + 3, 1.2, altura - 6, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_TEXTO_SUAVE);
    doc.text(textoPdf(indicador.rotulo), x + 5, y + 6.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    const destaqueFalha = indicador.rotulo === "Com falha" && resumo.comFalha > 0;
    doc.setTextColor(...(destaqueFalha ? CORES_VARIANTE_PDF.danger.cor : COR_TEXTO));
    doc.text(textoPdf(indicador.valor), x + 5, y + 15.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR_TEXTO_SUAVE);
    const detalhe = doc.splitTextToSize(textoPdf(indicador.detalhe), largura - 8).slice(0, 2);
    doc.text(detalhe, x + 5, y + 20);
  });
  return y + altura;
}

/*
 * Seção = título + tabela. `lado` põe a tabela em meia página (duas seções pequenas lado a lado, mesmo inicioY);
 * só usar com tabelas que cabem na página (poucas linhas), senão a quebra de página desalinharia as duas.
 * Devolve o fim da tabela.
 */
function tabelaPdf(
  doc: jsPDF,
  titulo: string,
  cabecalho: string[],
  corpo: string[][],
  redesenharFaixa: () => void,
  opcoes: {
    inicioY?: number;
    lado?: "esquerda" | "direita";
    larguras?: Record<number, number | "auto">;
    alinharDireita?: number[];
    vazio?: string;
    cor?: (linha: number, coluna: number) => CorRgb | null;
    desenharCelula?: Parameters<typeof autoTable>[1]["didDrawCell"];
  } = {}
): number {
  const cursorY = opcoes.inicioY ?? posicaoSecao(doc, fimUltimaTabela(doc), redesenharFaixa);
  const meia = (larguraPagina(doc) - MARGEM * 2 - ESPACO_ENTRE_COLUNAS) / 2;
  const margem =
    opcoes.lado === "esquerda"
      ? { left: MARGEM, right: MARGEM + meia + ESPACO_ENTRE_COLUNAS }
      : opcoes.lado === "direita"
        ? { left: MARGEM + meia + ESPACO_ENTRE_COLUNAS, right: MARGEM }
        : { left: MARGEM, right: MARGEM };

  desenharTituloSecao(doc, titulo, cursorY, margem.left);
  const columnStyles: Record<number, { cellWidth?: number | "auto"; halign?: "right" }> = {};
  for (const [coluna, largura] of Object.entries(opcoes.larguras ?? {})) {
    columnStyles[Number(coluna)] = { cellWidth: largura };
  }
  for (const coluna of opcoes.alinharDireita ?? []) {
    columnStyles[coluna] = { ...columnStyles[coluna], halign: "right" };
  }
  autoTable(doc, {
    startY: cursorY + 4,
    margin: { top: MARGEM_TOPO_TABELA, ...margem },
    head: [cabecalho],
    body:
      corpo.length > 0
        ? corpo.map((linha) => linha.map(textoPdf))
        : [[opcoes.vazio ?? "Nada neste dia.", ...cabecalho.slice(1).map(() => "")]],
    styles: { ...ESTILO_TABELA, fontSize: 8.5, valign: "top" },
    headStyles: ESTILO_CABECALHO_TABELA,
    columnStyles,
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    rowPageBreak: "avoid",
    didParseCell: (celula) => {
      if (celula.section !== "body" || corpo.length === 0) return;
      const cor = opcoes.cor?.(celula.row.index, celula.column.index);
      if (cor) celula.cell.styles.textColor = cor;
    },
    didDrawCell: opcoes.desenharCelula,
    didDrawPage: redesenharFaixa,
  });
  return fimUltimaTabela(doc);
}

export function gerarPdf(dados: DadosRelatorio3dx): Buffer {
  const resumo = calcularResumo(dados);
  const doc = new jsPDF("l", "mm", "a4");
  const cabecalho: CabecalhoPdf = {
    modulo: MODULO,
    titulo: `Relatório diário de uso · ${rotuloEscopo(dados.ambiente)}`,
    chip: formatarDia(dados.data),
    selo: {
      texto: diaDaSemana(dados.data),
      ...CORES_VARIANTE_PDF[dados.ambiente === "TESTE" ? "info" : "neutral"],
    },
  };
  const redesenharFaixa = () => desenharFaixa(doc, cabecalho);
  const cores = CORES_VARIANTE_PDF;
  const meiaLargura = (larguraPagina(doc) - MARGEM * 2 - ESPACO_ENTRE_COLUNAS) / 2;
  redesenharFaixa();

  // ---- página 1: indicadores, por plugin, por ambiente + por gatilho
  desenharTituloSecao(doc, "Resumo do dia", TOPO_CONTEUDO);
  const fimIndicadores = desenharIndicadores(doc, resumo, TOPO_CONTEUDO + 4);

  const fimPlugins = tabelaPdf(
    doc,
    "Por plugin",
    ["Plugin", "Modo atual", "Execuções", "Objetos", "Alterações", "Em simulação", "Com falha"],
    resumo.porPlugin.map((p) => [
      p.nome,
      p.modos,
      String(p.execucoes),
      String(p.objetos),
      String(p.alteracoes),
      String(p.simuladas),
      String(p.falhas),
    ]),
    redesenharFaixa,
    {
      inicioY: fimIndicadores + 12,
      larguras: { 0: 52, 1: "auto", 2: 24, 3: 22, 4: 24, 5: 28, 6: 24 },
      alinharDireita: [2, 3, 4, 5, 6],
      cor: (linha, coluna) =>
        coluna === 6 && (resumo.porPlugin[linha]?.falhas ?? 0) > 0
          ? cores.danger.cor
          : coluna === 1
            ? COR_TEXTO_SUAVE
            : null,
    }
  );

  let y = posicaoSecao(doc, fimPlugins, redesenharFaixa, 50);
  const finsLinha: number[] = [];
  const temAmbiente = resumo.porAmbiente.length > 0;
  if (temAmbiente) {
    finsLinha.push(
      tabelaPdf(
        doc,
        "Por ambiente",
        ["Ambiente", "Execuções", "Alterações + simuladas", "Com falha"],
        resumo.porAmbiente.map(([label, execucoes, alteracoes, falhas]) => [
          label,
          String(execucoes),
          String(alteracoes),
          String(falhas),
        ]),
        redesenharFaixa,
        { inicioY: y, lado: "esquerda", larguras: { 1: 24, 2: 40, 3: 22 }, alinharDireita: [1, 2, 3] }
      )
    );
  }
  finsLinha.push(
    tabelaPdf(
      doc,
      "Por gatilho",
      ["Gatilho", "Execuções", "% do dia"],
      resumo.porGatilho.map(([label, n]) => [label, String(n), pct(n, resumo.execucoes)]),
      redesenharFaixa,
      {
        inicioY: y,
        lado: temAmbiente ? "direita" : "esquerda",
        larguras: { 1: 26, 2: 24 },
        alinharDireita: [1, 2],
        vazio: "Nenhuma execução.",
      }
    )
  );

  // ---- por usuário + últimos 7 dias, lado a lado (normalmente na página 2)
  y = posicaoSecao(doc, Math.max(...finsLinha), redesenharFaixa, 140);
  const paginaLinha = doc.getNumberOfPages();
  const usuariosPdf = resumo.porUsuario.slice(0, MAX_USUARIOS_PDF);
  let fimUsuarios = tabelaPdf(
    doc,
    "Por usuário",
    ["Usuário", "Execuções", "Alterações", "Simuladas", "% do dia"],
    usuariosPdf.map((u) => [
      u.nome,
      String(u.execucoes),
      String(u.alteracoes),
      String(u.simuladas),
      pct(u.execucoes, resumo.execucoes),
    ]),
    redesenharFaixa,
    {
      inicioY: y,
      lado: "esquerda",
      larguras: { 1: 23, 2: 22, 3: 21, 4: 18 },
      alinharDireita: [1, 2, 3, 4],
      vazio: "Ninguém acionou os plugins neste dia.",
    }
  );
  if (resumo.porUsuario.length > usuariosPdf.length) {
    fimUsuarios = nota(
      doc,
      `Mais ${resumo.porUsuario.length - usuariosPdf.length} usuário(s) na planilha Excel anexa.`,
      fimUsuarios,
      MARGEM,
      meiaLargura
    );
  }

  /* Últimos 7 dias com uma barrinha proporcional às execuções (tendência de uso de relance). */
  doc.setPage(paginaLinha);
  const maiorDia = Math.max(1, ...dados.ultimosDias.map((d) => d.execucoes));
  const fimDias = tabelaPdf(
    doc,
    "Últimos 7 dias",
    ["Dia", "Execuções", "Com falha", "Alterações", "Volume"],
    dados.ultimosDias.map((d) => [
      `${formatarDia(d.data).slice(0, 5)} (${diaDaSemana(d.data).slice(0, 3)})`,
      String(d.execucoes),
      String(d.comFalha),
      String(d.alteracoes),
      "",
    ]),
    redesenharFaixa,
    {
      inicioY: y,
      lado: "direita",
      larguras: { 0: 24, 1: 23, 2: 22, 3: 22 },
      alinharDireita: [1, 2, 3],
      cor: (linha, coluna) => (coluna === 2 && (dados.ultimosDias[linha]?.comFalha ?? 0) > 0 ? cores.danger.cor : null),
      desenharCelula: (celula) => {
        if (celula.section !== "body" || celula.column.index !== 4) return;
        const dia = dados.ultimosDias[celula.row.index];
        if (!dia || dia.execucoes === 0) return;
        const larguraMax = celula.cell.width - 6;
        const largura = Math.max(1, (dia.execucoes / maiorDia) * larguraMax);
        const ehODia = dia.data === dados.data;
        celula.doc.setFillColor(...(ehODia ? COR_PRIMARIA : ([229, 160, 160] as CorRgb)));
        celula.doc.rect(celula.cell.x + 3, celula.cell.y + celula.cell.height / 2 - 1.6, largura, 3.2, "F");
      },
    }
  );
  y = Math.max(fimUsuarios, fimDias);

  if (resumo.execucoesComFalha.length > 0) {
    y = tabelaPdf(
      doc,
      "Precisa de atenção",
      ["Hora", "Ambiente", "Plugin", "Objeto", "Status", "Erro / resumo"],
      resumo.execucoesComFalha.map((e) => [
        hora(e.enfileiradoEm),
        AMBIENTE[e.ambiente].label,
        nomeCurtoPlugin(e.pluginChave),
        rotuloObjeto(e.objetoNome, e.objetoRevisao, e.objetoTitulo),
        situacaoExecucao(e).label,
        e.erro ?? e.resumo ?? "",
      ]),
      redesenharFaixa,
      {
        inicioY: posicaoSecao(doc, y, redesenharFaixa),
        larguras: { 0: 18, 1: 21, 2: 34, 3: 70, 4: 20, 5: "auto" },
        cor: (_linha, coluna) => (coluna === 4 ? cores.danger.cor : null),
      }
    );
  }

  // ---- detalhado (página nova): só o que mudou, mudaria, falhou ou teve a liberação barrada; o resto está no Excel
  const relevantes = dados.itens.filter(itemRelevante);
  const comItemRelevante = new Set(relevantes.map((item) => item.execucaoId));
  const execucoesPdf = dados.execucoes.filter(
    (e) => comItemRelevante.has(e.id) || e.status === "falha" || e.status === "parcial" || e.barrada
  );
  doc.addPage();
  redesenharFaixa();
  y = tabelaPdf(
    doc,
    `Execuções com alteração, falha ou liberação barrada (${execucoesPdf.length} de ${dados.execucoes.length})`,
    CABECALHO_EXECUCOES,
    execucoesPdf.map((execucao) => {
      const linha = linhaExecucao(execucao);
      if (execucao.resumo) linha[4] = `${linha[4]}\n${execucao.resumo}`;
      return linha;
    }),
    redesenharFaixa,
    {
      inicioY: TOPO_CONTEUDO,
      larguras: { 0: 18, 1: 21, 2: 30, 3: 22, 4: "auto", 5: 32, 6: 28, 7: 12, 8: 19 },
      alinharDireita: [7, 8],
      vazio: "Nenhuma execução alterou algo neste dia.",
      cor: (linha, coluna) => {
        const execucao = execucoesPdf[linha];
        if (!execucao) return null;
        if (coluna === 0) return COR_TEXTO_SUAVE;
        if (coluna === 6) return cores[situacaoExecucao(execucao).variante].cor;
        return null;
      },
    }
  );

  const execucaoPorId = new Map(dados.execucoes.map((e) => [e.id, e]));
  y = tabelaPdf(
    doc,
    `Objetos alterados (${relevantes.length})`,
    ["Hora", "Plugin", "Origem", "Objeto", "Ação", "Antes", "Depois", "Resultado"],
    relevantes.map((item) => {
      const execucao = execucaoPorId.get(item.execucaoId);
      return [
        hora(execucao?.enfileiradoEm ?? null),
        execucao ? nomeCurtoPlugin(execucao.pluginChave) : "",
        execucao ? [execucao.objetoNome, execucao.objetoRevisao].filter(Boolean).join(" ") : "",
        rotuloObjeto(item.alvoNome, item.alvoRevisao, item.alvoTitulo),
        ACAO_ITEM[item.acao] ?? item.acao,
        item.valorAntes ?? "—",
        item.valorDepois ?? "—",
        item.sucesso ? "OK" : `Falha${item.mensagem ? `: ${item.mensagem}` : ""}`,
      ];
    }),
    redesenharFaixa,
    {
      inicioY: posicaoSecao(doc, y, redesenharFaixa),
      larguras: { 0: 18, 1: 28, 2: 34, 3: "auto", 4: 34, 5: 30, 6: 30, 7: 24 },
      vazio: "Nenhum objeto alterado neste dia.",
      cor: (linha, coluna) => {
        const item = relevantes[linha];
        if (!item) return null;
        if (coluna === 0 || coluna === 5) return COR_TEXTO_SUAVE;
        if (coluna === 7) return cores[item.sucesso ? "success" : "danger"].cor;
        return null;
      },
    }
  );

  const outrasExecucoes = dados.execucoes.length - execucoesPdf.length;
  const outrosObjetos = dados.itens.length - relevantes.length;
  if (outrasExecucoes > 0 || outrosObjetos > 0) {
    const partes = [
      outrasExecucoes > 0 ? `${outrasExecucoes} execução(ões) sem nada a alterar (ex.: desenho já completo, título já digitado)` : null,
      outrosObjetos > 0 ? `${outrosObjetos} objeto(s) tratados sem alteração (ex.: conjunto não liberado, mantido como estava)` : null,
    ].filter(Boolean);
    if (y + 12 > limiteConteudoY(doc)) {
      doc.addPage();
      redesenharFaixa();
      y = TOPO_CONTEUDO - 6;
    }
    nota(doc, `Fora deste PDF, na planilha Excel anexa: ${partes.join("; ")}.`, y);
  }

  desenharRodapes(doc, MODULO, new Date());
  return Buffer.from(doc.output("arraybuffer"));
}

// ------------------------------------------------------------------ Excel

export function gerarExcel(dados: DadosRelatorio3dx): Buffer {
  const resumo = calcularResumo(dados);
  const pasta = XLSX.utils.book_new();

  const planilhaResumo = XLSX.utils.aoa_to_sheet([
    ["Relatório diário de uso — Plugins 3DX"],
    ["Dia", `${formatarDia(dados.data)} (${diaDaSemana(dados.data)})`],
    ["Ambiente", rotuloEscopo(dados.ambiente)],
    [],
    ["Indicador", "Valor", "Detalhe"],
    ...indicadores(resumo).map((i) => [i.rotulo, i.valor, i.detalhe]),
    [],
    ["Gatilho", "Execuções"],
    ...resumo.porGatilho,
    ...(resumo.porAmbiente.length > 0
      ? [[], ["Ambiente", "Execuções", "Alterações (feitas + simuladas)", "Com falha"], ...resumo.porAmbiente]
      : []),
  ]);
  planilhaResumo["!cols"] = [{ wch: 26 }, { wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(pasta, planilhaResumo, "Resumo");

  const planilhaPlugins = XLSX.utils.aoa_to_sheet([
    ["Plugin", "Modo atual", "Execuções", "Objetos", "Alterações", "Em simulação", "Com falha"],
    ...resumo.porPlugin.map((p) => [p.nome, p.modos, p.execucoes, p.objetos, p.alteracoes, p.simuladas, p.falhas]),
  ]);
  planilhaPlugins["!cols"] = [{ wch: 26 }, { wch: 44 }, { wch: 11 }, { wch: 10 }, { wch: 11 }, { wch: 13 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(pasta, planilhaPlugins, "Por plugin");

  const planilhaUsuarios = XLSX.utils.aoa_to_sheet([
    ["Usuário", "Execuções", "Alterações", "Em simulação"],
    ...resumo.porUsuario.map((u) => [u.nome, u.execucoes, u.alteracoes, u.simuladas]),
  ]);
  planilhaUsuarios["!cols"] = [{ wch: 36 }, { wch: 11 }, { wch: 11 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(pasta, planilhaUsuarios, "Por usuário");

  const planilhaDias = XLSX.utils.aoa_to_sheet([
    ["Dia", "Dia da semana", "Execuções", "Com falha", "Alterações"],
    ...dados.ultimosDias.map((d) => [formatarDia(d.data), diaDaSemana(d.data), d.execucoes, d.comFalha, d.alteracoes]),
  ]);
  planilhaDias["!cols"] = [{ wch: 12 }, { wch: 15 }, { wch: 11 }, { wch: 10 }, { wch: 11 }];
  XLSX.utils.book_append_sheet(pasta, planilhaDias, "Últimos 7 dias");

  const planilhaExecucoes = XLSX.utils.aoa_to_sheet([
    [...CABECALHO_EXECUCOES, "Modo", "Falhas", "Início", "Fim", "Resumo", "Erro"],
    ...dados.execucoes.map((e) => [
      ...linhaExecucao(e).slice(0, 7),
      e.totalItens ?? "",
      formatarDuracao(e.duracaoMs),
      MODO[e.modo].label,
      e.totalFalhas ?? "",
      hora(e.iniciadoEm),
      hora(e.finalizadoEm),
      e.resumo ?? "",
      e.erro ?? "",
    ]),
  ]);
  planilhaExecucoes["!cols"] = [
    { wch: 9 },
    { wch: 10 },
    { wch: 24 },
    { wch: 15 },
    { wch: 50 },
    { wch: 28 },
    { wch: 22 },
    { wch: 7 },
    { wch: 10 },
    { wch: 11 },
    { wch: 7 },
    { wch: 9 },
    { wch: 9 },
    { wch: 70 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(pasta, planilhaExecucoes, "Execuções");

  const execucaoPorId = new Map(dados.execucoes.map((e) => [e.id, e]));
  const planilhaObjetos = XLSX.utils.aoa_to_sheet([
    [
      "Hora",
      "Ambiente",
      "Plugin",
      "Origem",
      "Ação",
      "Objeto",
      "Revisão",
      "Título",
      "Tipo",
      "Estado",
      "Responsável",
      "Antes",
      "Depois",
      "Resultado",
      "Mensagem",
    ],
    ...dados.itens.map((item) => {
      const execucao = execucaoPorId.get(item.execucaoId);
      return [
        hora(execucao?.enfileiradoEm ?? null),
        execucao ? AMBIENTE[execucao.ambiente].label : "",
        execucao ? nomeCurtoPlugin(execucao.pluginChave) : "",
        execucao ? [execucao.objetoNome, execucao.objetoRevisao].filter(Boolean).join(" ") : "",
        ACAO_ITEM[item.acao] ?? item.acao,
        item.alvoNome ?? "",
        item.alvoRevisao ?? "",
        item.alvoTitulo ?? "",
        item.alvoTipo ?? "",
        item.alvoEstado ?? "",
        item.alvoOwner ?? "",
        item.valorAntes ?? "",
        item.valorDepois ?? "",
        item.sucesso ? "OK" : "Falha",
        item.mensagem ?? "",
      ];
    }),
  ]);
  planilhaObjetos["!cols"] = [
    { wch: 9 },
    { wch: 10 },
    { wch: 24 },
    { wch: 26 },
    { wch: 30 },
    { wch: 24 },
    { wch: 8 },
    { wch: 36 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
    { wch: 30 },
    { wch: 30 },
    { wch: 10 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(pasta, planilhaObjetos, "Objetos");

  return XLSX.write(pasta, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ------------------------------------------------------------------ e-mail

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CELULA = "padding: 6px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top;";
const CELULA_NUM = `${CELULA} text-align: right;`;
const CABECALHO = "text-align: left; padding: 6px 10px; border-bottom: 2px solid #d1d5db; font-size: 12px;";

function tabelaHtml(cabecalho: string[], linhas: string[][], numericas: number[] = []): string {
  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 0 0 18px;">
      <thead><tr>${cabecalho
        .map((c, i) => `<th style="${CABECALHO}${numericas.includes(i) ? " text-align: right;" : ""}">${escaparHtml(c)}</th>`)
        .join("")}</tr></thead>
      <tbody>${linhas
        .map(
          (linha) =>
            `<tr>${linha.map((c, i) => `<td style="${numericas.includes(i) ? CELULA_NUM : CELULA}">${c}</td>`).join("")}</tr>`
        )
        .join("")}</tbody>
    </table>`;
}

export function assuntoEmail(dados: DadosRelatorio3dx): string {
  const resumo = calcularResumo(dados);
  const prefixo = dados.ambiente === "TESTE" ? "[TESTE] " : "";
  const escopo = dados.ambiente === "PRODUCAO" ? " (produção)" : "";
  const falhas = resumo.comFalha > 0 ? `, ${resumo.comFalha} com falha` : "";
  return `${prefixo}Plugins 3DX${escopo}: uso de ${formatarDia(dados.data)} — ${resumo.execucoes} execução(ões), ${resumo.alteracoes} alteração(ões)${falhas}`;
}

export function montarCorpoEmail(dados: DadosRelatorio3dx): string {
  const resumo = calcularResumo(dados);
  const cartoes = indicadores(resumo)
    .map((i) => {
      const falha = i.rotulo === "Com falha" && resumo.comFalha > 0;
      return `
        <td style="width: 33%; padding: 10px 12px; background: #f8f9fb; border: 1px solid #e5e7eb; border-left: 3px solid #b71c1c; vertical-align: top;">
          <div style="font-size: 11px; color: #6b7280;">${escaparHtml(i.rotulo)}</div>
          <div style="font-size: 22px; font-weight: 700; color: ${falha ? "#b91c1c" : "#212121"}; margin: 2px 0;">${escaparHtml(i.valor)}</div>
          <div style="font-size: 11px; color: #6b7280;">${escaparHtml(i.detalhe)}</div>
        </td>`;
    })
    .reduce<string[][]>((linhas, cartao, i) => {
      if (i % 3 === 0) linhas.push([]);
      linhas[linhas.length - 1].push(cartao);
      return linhas;
    }, [])
    .map((linha) => `<tr>${linha.join("")}</tr>`)
    .join("");

  const falhas =
    resumo.execucoesComFalha.length > 0
      ? `<p style="margin: 0 0 6px; font-weight: 600; color: #b91c1c;">Precisa de atenção</p>
         ${tabelaHtml(
           ["Hora", "Plugin", "Objeto", "Erro / resumo"],
           resumo.execucoesComFalha.slice(0, 15).map((e) => [
             hora(e.enfileiradoEm),
             escaparHtml(nomeCurtoPlugin(e.pluginChave)),
             escaparHtml(rotuloObjeto(e.objetoNome, e.objetoRevisao, e.objetoTitulo)),
             escaparHtml(e.erro ?? e.resumo ?? ""),
           ])
         )}`
      : "";

  return `
    <p style="margin: 0 0 14px;">Uso dos Plugins 3DX em <strong>${formatarDia(dados.data)}</strong> (${diaDaSemana(dados.data)})
      · ${escaparHtml(rotuloEscopo(dados.ambiente))}.</p>
    <table style="width: 100%; border-collapse: separate; border-spacing: 6px; margin: 0 -6px 14px;">${cartoes}</table>
    <p style="margin: 0 0 6px; font-weight: 600;">Por plugin</p>
    ${tabelaHtml(
      ["Plugin", "Modo atual", "Execuções", "Alterações", "Em simulação", "Com falha"],
      resumo.porPlugin.map((p) => [
        escaparHtml(p.nome),
        `<span style="color: #6b7280;">${escaparHtml(p.modos)}</span>`,
        String(p.execucoes),
        String(p.alteracoes),
        String(p.simuladas),
        p.falhas > 0 ? `<span style="color: #b91c1c; font-weight: 600;">${p.falhas}</span>` : "0",
      ]),
      [2, 3, 4, 5]
    )}
    ${falhas}
    <p style="margin: 0; color: #6b7280; font-size: 12px;">O relatório completo (por usuário, últimos 7 dias, todas as execuções
      e objetos alterados) está nos anexos em PDF e Excel. Detalhes de cada execução em Administração → Plugins 3DX → Execuções.</p>`;
}
