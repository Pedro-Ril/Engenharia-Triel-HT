import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import {
  COR_FUNDO_ALTERNADO,
  COR_PRIMARIA,
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
  limiteConteudoY,
  nomeArquivoSeguro,
  textoPdf,
} from "@/lib/pdf/padrao-portal";
import type { CabecalhoPdf, SeloPdf } from "@/lib/pdf/padrao-portal";

import { listarExecucoes } from "../services/plugins3dx.service";
import type {
  DetalheExecucao3dx,
  Execucao3dx,
  FiltrosExecucoes3dx,
  ItemExecucao3dx,
  StatusExecucao3dx,
} from "../types/plugins3dx.types";
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
} from "./exibicao";

/*
 * Exportação das execuções dos Plugins 3DX (PDF e Excel), no navegador, no padrão visual dos PDFs do portal
 * (src/lib/pdf/padrao-portal.ts -- o mesmo de Chamados, Equipamentos Usados e Workstations):
 *  - a lista, com os filtros aplicados na tela (todas as páginas, até LIMITE_EXPORTACAO);
 *  - uma execução: dados, objetos (todos, sem a paginação da tela), relacionadas e log técnico.
 */

const MODULO = "Plugins 3DX";
/* A rota lista 25 por página: até 1000 linhas = 40 chamadas, feitas em lotes. */
export const LIMITE_EXPORTACAO = 1000;
const CHAMADAS_EM_PARALELO = 5;

/* Pares rótulo/valor dos filtros aplicados, para o relatório dizer o que foi exportado. */
export type FiltroAplicado = [string, string];

export interface ListaParaExportar {
  execucoes: Execucao3dx[];
  /* Total que o filtro encontrou (pode ser maior que execucoes.length se passar do limite). */
  total: number;
}

/* Busca todas as páginas da lista com os mesmos filtros da tela. */
export async function carregarExecucoesParaExportar(
  filtros: Omit<FiltrosExecucoes3dx, "pagina">
): Promise<ListaParaExportar> {
  const primeira = await listarExecucoes({ ...filtros, pagina: 1 });
  if (!primeira.ok || !primeira.data) {
    throw new Error(primeira.message ?? "Não foi possível carregar as execuções.");
  }

  const { total, tamanhoPagina } = primeira.data;
  const execucoes = [...primeira.data.execucoes];
  const ultimaPagina = Math.ceil(Math.min(total, LIMITE_EXPORTACAO) / tamanhoPagina);

  for (let inicio = 2; inicio <= ultimaPagina; inicio += CHAMADAS_EM_PARALELO) {
    const paginas = Array.from(
      { length: Math.min(CHAMADAS_EM_PARALELO, ultimaPagina - inicio + 1) },
      (_, i) => inicio + i
    );
    const respostas = await Promise.all(paginas.map((pagina) => listarExecucoes({ ...filtros, pagina })));
    for (const resposta of respostas) {
      if (!resposta.ok || !resposta.data) {
        throw new Error(resposta.message ?? "Não foi possível carregar todas as execuções.");
      }
      execucoes.push(...resposta.data.execucoes);
    }
  }

  return { execucoes: execucoes.slice(0, LIMITE_EXPORTACAO), total };
}

function seloStatus(status: StatusExecucao3dx): SeloPdf {
  const info = STATUS_EXECUCAO[status];
  return { texto: info.label, ...CORES_VARIANTE_PDF[info.variante] };
}

/* Status com o modo quando não é o normal (Simulação/Desligado), como os badges da tela. */
function textoStatus(execucao: Execucao3dx): string {
  const status = STATUS_EXECUCAO[execucao.status].label;
  return execucao.modo === "ATIVO" ? status : `${status} (${MODO[execucao.modo].label})`;
}

function quem(execucao: Execucao3dx): string {
  const ator = execucao.atorNome ?? execucao.atorLogin ?? "—";
  return execucao.solicitadoPorNome ? `${ator} (pedido no Portal por ${execucao.solicitadoPorNome})` : ator;
}

function textoItens(execucao: Execucao3dx): string {
  if (execucao.totalItens === null) return "—";
  const falhas = execucao.totalFalhas ?? 0;
  return falhas > 0 ? `${execucao.totalItens} (${falhas} falha${falhas === 1 ? "" : "s"})` : String(execucao.totalItens);
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/* Garante espaço para um título de seção + começo da tabela; senão abre página nova. */
function proximaSecaoY(doc: jsPDF, redesenharFaixa: () => void): number {
  let cursorY = fimUltimaTabela(doc) + 12;
  if (cursorY > limiteConteudoY(doc) - 30) {
    doc.addPage();
    redesenharFaixa();
    cursorY = TOPO_CONTEUDO;
  }
  return cursorY;
}

/* Tabela rótulo/valor (dados, filtros, resumo). */
function tabelaChaveValor(
  doc: jsPDF,
  linhas: [string, string][],
  startY: number,
  redesenharFaixa: () => void,
  larguras: { rotulo: number; tabela?: number }
): void {
  autoTable(doc, {
    startY,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    tableWidth: larguras.tabela ?? "auto",
    body: linhas.map(([rotulo, valor]) => [rotulo, textoPdf(valor)]),
    styles: { ...ESTILO_TABELA, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: larguras.rotulo, fontStyle: "bold", textColor: COR_PRIMARIA },
      1: { cellWidth: "auto" },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    didDrawPage: redesenharFaixa,
  });
}

/* ------------------------------------------------------------------ lista */

function resumoDaLista(lista: ListaParaExportar): [string, string][] {
  const linhas: [string, string][] = [
    [
      "Execuções",
      lista.total > lista.execucoes.length
        ? `${lista.execucoes.length} de ${lista.total} (limite de ${LIMITE_EXPORTACAO} por relatório)`
        : String(lista.total),
    ],
  ];
  for (const [status, info] of Object.entries(STATUS_EXECUCAO)) {
    const quantidade = lista.execucoes.filter((e) => e.status === status).length;
    if (quantidade > 0) linhas.push([info.label, String(quantidade)]);
  }
  const objetos = lista.execucoes.reduce((soma, e) => soma + (e.totalItens ?? 0), 0);
  const falhas = lista.execucoes.reduce((soma, e) => soma + (e.totalFalhas ?? 0), 0);
  linhas.push(["Objetos tratados", `${objetos}${falhas > 0 ? ` (${plural(falhas, "falha", "falhas")})` : ""}`]);
  return linhas;
}

const CABECALHO_LISTA = ["Quando", "Gatilho", "Plugin", "Ambiente", "Objeto", "Quem", "Status", "Itens", "Duração"];

function linhaDaLista(execucao: Execucao3dx): string[] {
  return [
    formatarDataHora(execucao.enfileiradoEm),
    GATILHO[execucao.gatilho],
    nomeCurtoPlugin(execucao.pluginChave),
    AMBIENTE[execucao.ambiente].label,
    rotuloObjeto(execucao.objetoNome, execucao.objetoRevisao, execucao.objetoTitulo),
    quem(execucao),
    textoStatus(execucao),
    textoItens(execucao),
    formatarDuracao(execucao.duracaoMs),
  ];
}

export function exportarExecucoesPdf(lista: ListaParaExportar, filtros: FiltroAplicado[]): void {
  const doc = new jsPDF("l", "mm", "a4");
  const geradoEm = new Date();
  const cabecalho: CabecalhoPdf = {
    modulo: MODULO,
    titulo: "Relatório de Execuções",
    chip: plural(lista.execucoes.length, "execução", "execuções"),
  };
  const redesenharFaixa = () => desenharFaixa(doc, cabecalho);

  redesenharFaixa();
  desenharTituloSecao(doc, "Filtros", TOPO_CONTEUDO);
  tabelaChaveValor(
    doc,
    filtros.length > 0 ? filtros : [["Filtros", "Nenhum (todas as execuções)"]],
    TOPO_CONTEUDO + 4,
    redesenharFaixa,
    { rotulo: 40, tabela: 150 }
  );

  let cursorY = proximaSecaoY(doc, redesenharFaixa);
  desenharTituloSecao(doc, "Resumo", cursorY);
  tabelaChaveValor(doc, resumoDaLista(lista), cursorY + 4, redesenharFaixa, { rotulo: 40, tabela: 150 });

  cursorY = proximaSecaoY(doc, redesenharFaixa);
  desenharTituloSecao(doc, "Execuções", cursorY);
  autoTable(doc, {
    startY: cursorY + 4,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    head: [CABECALHO_LISTA],
    body:
      lista.execucoes.length > 0
        ? lista.execucoes.map((execucao) => {
            const linha = linhaDaLista(execucao);
            /* Como na tela: o resumo da execução logo abaixo do objeto. */
            if (execucao.resumo) linha[4] = `${linha[4]}
${execucao.resumo}`;
            return linha.map(textoPdf);
          })
        : [["—", "—", "—", "—", "Nenhuma execução com estes filtros.", "—", "—", "—", "—"]],
    styles: { ...ESTILO_TABELA, fontSize: 8.5, valign: "top" },
    headStyles: ESTILO_CABECALHO_TABELA,
    rowPageBreak: "avoid",
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 22 },
      2: { cellWidth: 30 },
      3: { cellWidth: 20 },
      4: { cellWidth: "auto" },
      5: { cellWidth: 30 },
      6: { cellWidth: 24, fontStyle: "bold" },
      7: { cellWidth: 14, halign: "right" },
      8: { cellWidth: 18, halign: "right" },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    /* Status na cor do badge da tela, data em cinza e itens em vermelho quando houve falha. */
    didParseCell: (dados) => {
      if (dados.section !== "body") return;
      const execucao = lista.execucoes[dados.row.index];
      if (!execucao) return;
      if (dados.column.index === 0) dados.cell.styles.textColor = COR_TEXTO_SUAVE;
      if (dados.column.index === 6) {
        dados.cell.styles.textColor = CORES_VARIANTE_PDF[STATUS_EXECUCAO[execucao.status].variante].cor;
      }
      if (dados.column.index === 7 && (execucao.totalFalhas ?? 0) > 0) {
        dados.cell.styles.textColor = CORES_VARIANTE_PDF.danger.cor;
      }
    },
    didDrawPage: redesenharFaixa,
  });

  desenharRodapes(doc, MODULO, geradoEm);
  doc.save("plugins-3dx-execucoes.pdf");
}

export function exportarExecucoesExcel(lista: ListaParaExportar, filtros: FiltroAplicado[]): void {
  const planilha = XLSX.utils.aoa_to_sheet([
    [...CABECALHO_LISTA, "Modo", "Falhas", "Iniciado", "Finalizado", "Nó", "Tentativas", "Resumo", "Erro"],
    ...lista.execucoes.map((execucao) => [
      ...linhaDaLista(execucao).slice(0, 6),
      STATUS_EXECUCAO[execucao.status].label,
      execucao.totalItens ?? "",
      formatarDuracao(execucao.duracaoMs),
      MODO[execucao.modo].label,
      execucao.totalFalhas ?? "",
      formatarDataHora(execucao.iniciadoEm),
      formatarDataHora(execucao.finalizadoEm),
      rotuloNo(execucao.no),
      execucao.tentativas,
      execucao.resumo ?? "",
      execucao.erro ?? "",
    ]),
  ]);
  planilha["!cols"] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 24 },
    { wch: 11 },
    { wch: 50 },
    { wch: 30 },
    { wch: 13 },
    { wch: 7 },
    { wch: 10 },
    { wch: 11 },
    { wch: 7 },
    { wch: 18 },
    { wch: 18 },
    { wch: 30 },
    { wch: 10 },
    { wch: 70 },
    { wch: 70 },
  ];

  const resumo = XLSX.utils.aoa_to_sheet([
    ["Filtro", "Valor"],
    ...(filtros.length > 0 ? filtros : [["Filtros", "Nenhum (todas as execuções)"]]),
    [],
    ["Indicador", "Quantidade"],
    ...resumoDaLista(lista),
  ]);
  resumo["!cols"] = [{ wch: 22 }, { wch: 60 }];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilha, "Execuções");
  XLSX.utils.book_append_sheet(pasta, resumo, "Filtros e resumo");
  XLSX.writeFile(pasta, "plugins-3dx-execucoes.xlsx");
}

/* --------------------------------------------------------------- uma execução */

function dadosDaExecucao(execucao: Execucao3dx): [string, string][] {
  const linhas: [string, string][] = [
    ["Objeto", rotuloObjeto(execucao.objetoNome, execucao.objetoRevisao, execucao.objetoTitulo)],
    ["Plugin", nomeCurtoPlugin(execucao.pluginChave)],
    ["Gatilho", GATILHO[execucao.gatilho]],
    ["Ambiente", AMBIENTE[execucao.ambiente].label],
    ["Status", STATUS_EXECUCAO[execucao.status].label],
    ["Modo", `${MODO[execucao.modo].label} — ${MODO[execucao.modo].descricao}`],
    ["Quem", quem(execucao)],
    [
      "Objetos",
      `${execucao.totalItens ?? 0} · ${execucao.totalOk ?? 0} ok · ${plural(execucao.totalFalhas ?? 0, "falha", "falhas")}`,
    ],
    ["Entrou na fila", formatarDataHora(execucao.enfileiradoEm)],
    ["Processado", `${formatarDataHora(execucao.iniciadoEm)} até ${formatarDataHora(execucao.finalizadoEm)}`],
    [
      "Duração · nó",
      `${formatarDuracao(execucao.duracaoMs)} · ${rotuloNo(execucao.no)}${
        execucao.tentativas > 1 ? ` · ${execucao.tentativas} tentativas` : ""
      }`,
    ],
  ];
  if (execucao.resumo) linhas.push(["Resumo", execucao.resumo]);
  if (execucao.erro) linhas.push(["Erro", execucao.erro]);
  return linhas;
}

function detalheAlvo(item: ItemExecucao3dx): string {
  return [item.alvoEstado, item.alvoOwner && `responsável: ${item.alvoOwner}`].filter(Boolean).join(" · ");
}

/* Objeto com estado/responsável embaixo; a mensagem do plugin vai numa coluna própria (linhas mais baixas). */
function linhaItem(item: ItemExecucao3dx): string[] {
  const alvo = rotuloObjeto(item.alvoNome, item.alvoRevisao, item.alvoTitulo);
  const detalhe = detalheAlvo(item);
  return [
    ACAO_ITEM[item.acao] ?? item.acao,
    detalhe ? `${alvo}\n${detalhe}` : alvo,
    item.valorAntes ?? "—",
    item.valorDepois ?? "—",
    item.mensagem ?? "",
    item.sucesso ? "OK" : "Falha",
  ];
}

function nomeArquivoExecucao(detalhe: DetalheExecucao3dx, extensao: string): string {
  const e = detalhe.execucao;
  const objeto = nomeArquivoSeguro([e.objetoNome, e.objetoRevisao].filter(Boolean).join(" ")) || "execucao";
  const data = e.enfileiradoEm.slice(0, 10);
  return `plugins-3dx-${objeto}-${data}.${extensao}`;
}

export function exportarExecucaoPdf(detalhe: DetalheExecucao3dx): void {
  const e = detalhe.execucao;
  /* Paisagem: a coluna Objeto precisa de largura (uma liberação pode ter centenas de objetos). */
  const doc = new jsPDF("l", "mm", "a4");
  const geradoEm = new Date();
  const cabecalho: CabecalhoPdf = {
    modulo: MODULO,
    titulo: `Execução: ${nomeCurtoPlugin(e.pluginChave)}`,
    chip: textoPdf([e.objetoNome, e.objetoRevisao].filter(Boolean).join(" ") || AMBIENTE[e.ambiente].label).slice(0, 24),
    selo: seloStatus(e.status),
  };
  const redesenharFaixa = () => desenharFaixa(doc, cabecalho);

  redesenharFaixa();
  desenharTituloSecao(doc, "Dados da execução", TOPO_CONTEUDO);
  tabelaChaveValor(doc, dadosDaExecucao(e), TOPO_CONTEUDO + 4, redesenharFaixa, { rotulo: 40 });

  if (detalhe.relacionadas.length > 0) {
    const cursorY = proximaSecaoY(doc, redesenharFaixa);
    desenharTituloSecao(doc, "Do mesmo comando no 3DEXPERIENCE", cursorY);
    autoTable(doc, {
      startY: cursorY + 4,
      margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
      head: [["Plugin", "Objeto", "Status"]],
      body: detalhe.relacionadas.map((r) => [
        textoPdf(nomeCurtoPlugin(r.pluginChave)),
        textoPdf(rotuloObjeto(r.objetoNome, r.objetoRevisao, r.objetoTitulo)),
        STATUS_EXECUCAO[r.status].label,
      ]),
      styles: { ...ESTILO_TABELA, valign: "top" },
      headStyles: ESTILO_CABECALHO_TABELA,
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: "auto" }, 2: { cellWidth: 32 } },
      alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
      didDrawPage: redesenharFaixa,
    });
  }

  let cursorY = proximaSecaoY(doc, redesenharFaixa);
  desenharTituloSecao(doc, `Objetos (${detalhe.itens.length})`, cursorY);
  autoTable(doc, {
    startY: cursorY + 4,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    head: [["Ação", "Objeto", "Antes", "Depois", "Observação", "Resultado"]],
    body:
      detalhe.itens.length > 0
        ? detalhe.itens.map((item) => linhaItem(item).map(textoPdf))
        : [["—", "Nenhum objeto alterado nesta execução.", "—", "—", "", "—"]],
    styles: { ...ESTILO_TABELA, fontSize: 8.5, valign: "top" },
    headStyles: ESTILO_CABECALHO_TABELA,
    rowPageBreak: "avoid",
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 100 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: "auto" },
      5: { cellWidth: 22, halign: "center", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    didParseCell: (dados) => {
      if (dados.section !== "body") return;
      const item = detalhe.itens[dados.row.index];
      if (!item) return;
      if (dados.column.index === 5) {
        dados.cell.styles.textColor = CORES_VARIANTE_PDF[item.sucesso ? "success" : "danger"].cor;
      }
      if (dados.column.index === 2) dados.cell.styles.textColor = COR_TEXTO_SUAVE;
      if (dados.column.index === 4) {
        dados.cell.styles.textColor = item.sucesso ? COR_TEXTO_SUAVE : CORES_VARIANTE_PDF.danger.cor;
      }
    },
    didDrawPage: redesenharFaixa,
  });

  if (detalhe.eventos.length > 0) {
    cursorY = proximaSecaoY(doc, redesenharFaixa);
    desenharTituloSecao(doc, "Log técnico", cursorY);
    autoTable(doc, {
      startY: cursorY + 4,
      margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
      head: [["Data", "Nível", "Mensagem"]],
      body: detalhe.eventos.map((evento) => [
        formatarDataHora(evento.criadoEm),
        NIVEL_EVENTO[evento.nivel].label,
        textoPdf(evento.mensagem),
      ]),
      styles: { ...ESTILO_TABELA, fontSize: 8.5, valign: "top" },
      headStyles: ESTILO_CABECALHO_TABELA,
      columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 18 }, 2: { cellWidth: "auto" } },
      alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
      didParseCell: (dados) => {
        if (dados.section !== "body") return;
        const evento = detalhe.eventos[dados.row.index];
        if (!evento) return;
        if (dados.column.index === 0) dados.cell.styles.textColor = COR_TEXTO_SUAVE;
        if (dados.column.index === 1) {
          dados.cell.styles.textColor = CORES_VARIANTE_PDF[NIVEL_EVENTO[evento.nivel].variante].cor;
        }
      },
      didDrawPage: redesenharFaixa,
    });
  }

  desenharRodapes(doc, MODULO, geradoEm);
  doc.save(nomeArquivoExecucao(detalhe, "pdf"));
}

export function exportarExecucaoExcel(detalhe: DetalheExecucao3dx): void {
  const dados = XLSX.utils.aoa_to_sheet([["Campo", "Valor"], ...dadosDaExecucao(detalhe.execucao)]);
  dados["!cols"] = [{ wch: 18 }, { wch: 100 }];

  const objetos = XLSX.utils.aoa_to_sheet([
    ["Ação", "Objeto", "Revisão", "Título", "Tipo", "Estado", "Responsável", "Antes", "Depois", "Resultado", "Mensagem"],
    ...detalhe.itens.map((item) => [
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
    ]),
  ]);
  objetos["!cols"] = [
    { wch: 30 },
    { wch: 22 },
    { wch: 9 },
    { wch: 40 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 40 },
    { wch: 40 },
    { wch: 10 },
    { wch: 60 },
  ];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, dados, "Execução");
  XLSX.utils.book_append_sheet(pasta, objetos, "Objetos");

  if (detalhe.relacionadas.length > 0) {
    const relacionadas = XLSX.utils.aoa_to_sheet([
      ["Plugin", "Objeto", "Status", "Entrou na fila"],
      ...detalhe.relacionadas.map((r) => [
        nomeCurtoPlugin(r.pluginChave),
        rotuloObjeto(r.objetoNome, r.objetoRevisao, r.objetoTitulo),
        STATUS_EXECUCAO[r.status].label,
        formatarDataHora(r.enfileiradoEm),
      ]),
    ]);
    relacionadas["!cols"] = [{ wch: 26 }, { wch: 60 }, { wch: 14 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(pasta, relacionadas, "Mesmo comando");
  }

  const log = XLSX.utils.aoa_to_sheet([
    ["Data", "Nível", "Mensagem"],
    ...detalhe.eventos.map((evento) => [
      formatarDataHora(evento.criadoEm),
      NIVEL_EVENTO[evento.nivel].label,
      evento.mensagem,
    ]),
  ]);
  log["!cols"] = [{ wch: 18 }, { wch: 8 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(pasta, log, "Log técnico");

  XLSX.writeFile(pasta, nomeArquivoExecucao(detalhe, "xlsx"));
}
