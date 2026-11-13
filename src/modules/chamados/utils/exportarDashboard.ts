import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import {
  COR_FUNDO_ALTERNADO,
  COR_LINHA,
  COR_PRIMARIA,
  COR_TEXTO,
  COR_TEXTO_SUAVE,
  ESTILO_CABECALHO_TABELA,
  ESTILO_TABELA,
  MARGEM,
  MARGEM_TOPO_TABELA,
  TOPO_CONTEUDO,
  desenharFaixa,
  desenharRodapes,
  desenharTituloSecao,
  espacar,
  larguraPagina,
  limiteConteudoY,
  textoPdf,
} from "@/lib/pdf/padrao-portal";
import type { CabecalhoPdf, CorRgb } from "@/lib/pdf/padrao-portal";

import type {
  ChamadoRelatorio,
  EstatisticasChamados,
  PrioridadeChamado,
  RelatorioChamados,
  StatusChamado,
} from "../types/chamados.types";
import { PRIORIDADE_TEXTO, STATUS_TEXTO, formatarDataHora, formatarDataSimples } from "./exportarChamado";

/*
 * Exportação do dashboard de chamados.
 * PDF (paisagem): página 1 gerencial -- indicadores e gráficos desenhados
 * no próprio PDF (nítidos em qualquer zoom/impressão) --, e da página 2
 * em diante o relatório propriamente dito, a lista de chamados com os
 * mesmos filtros. Excel: abas Resumo, Indicadores e Chamados.
 */

const MODULO = "Chamados";

export interface FiltroAplicado {
  rotulo: string;
  valor: string;
}

/* Mesmas cores dos gráficos da tela (DashboardChamadosPage). */
const COR_STATUS: Record<StatusChamado, CorRgb> = {
  aberto: [29, 78, 216],
  em_andamento: [154, 52, 18],
  aguardando_confirmacao: [180, 83, 9],
  resolvido: [22, 101, 52],
  fechado: [75, 85, 99],
};

const COR_PRIORIDADE: Record<PrioridadeChamado, CorRgb> = {
  baixa: [75, 85, 99],
  media: [29, 78, 216],
  alta: [154, 52, 18],
  urgente: [183, 28, 28],
};

const ORDEM_STATUS: StatusChamado[] = ["aberto", "em_andamento", "aguardando_confirmacao", "resolvido", "fechado"];
const ORDEM_PRIORIDADE: PrioridadeChamado[] = ["urgente", "alta", "media", "baixa"];

interface ItemGrafico {
  rotulo: string;
  total: number;
  cor: CorRgb;
}

export function formatarHoras(horas: number | null): string {
  if (horas === null) return "-";
  if (horas < 24) return `${horas.toFixed(1).replace(".", ",")} h`;
  return `${(horas / 24).toFixed(1).replace(".", ",")} d`;
}

function horasAteResolver(chamado: ChamadoRelatorio): number | null {
  if (!chamado.resolvidoEm) return null;
  const inicio = new Date(chamado.criadoEm).getTime();
  const fim = new Date(chamado.resolvidoEm).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim) || fim < inicio) return null;
  return (fim - inicio) / 3_600_000;
}

function descreverPeriodo(filtros: FiltroAplicado[]): string {
  const inicial = filtros.find((filtro) => filtro.rotulo === "Data inicial")?.valor;
  const final = filtros.find((filtro) => filtro.rotulo === "Data final")?.valor;
  if (inicial && final) return `${inicial} a ${final}`;
  if (inicial) return `Desde ${inicial}`;
  if (final) return `Até ${final}`;
  return "Todo o período";
}

function descreverFiltros(filtros: FiltroAplicado[]): string {
  const outros = filtros.filter((filtro) => filtro.rotulo !== "Data inicial" && filtro.rotulo !== "Data final");
  return outros.length === 0
    ? "Filtros: nenhum — todos os chamados dos setores que você atende."
    : `Filtros: ${outros.map((filtro) => `${filtro.rotulo} ${filtro.valor}`).join("  ·  ")}`;
}

/* ---------- desenho da página 1 ---------- */

function desenharIndicador(doc: jsPDF, x: number, y: number, largura: number, rotulo: string, valor: string, cor: CorRgb) {
  doc.setFillColor(...COR_FUNDO_ALTERNADO);
  doc.setDrawColor(...COR_LINHA);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, largura, 21, 2, 2, "FD");
  doc.setFillColor(...cor);
  doc.rect(x, y + 3, 1.2, 15, "F");

  /* Rótulo em até duas linhas ("Aguardando confirmação", "Tempo médio de resolução"). */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.3);
  doc.setTextColor(...COR_TEXTO_SUAVE);
  const linhas = (doc.splitTextToSize(rotulo.toUpperCase(), largura - 7) as string[]).slice(0, 2);
  doc.text(linhas, x + 4.5, y + 5.6, { lineHeightFactor: 1.15 });

  doc.setFontSize(15);
  doc.setTextColor(...COR_TEXTO);
  doc.text(valor, x + 4.5, y + 17.5);
}

function desenharPainel(doc: jsPDF, x: number, y: number, largura: number, altura: number, titulo: string) {
  doc.setDrawColor(...COR_LINHA);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, largura, altura, 2, 2, "S");

  doc.setFillColor(...COR_PRIMARIA);
  doc.rect(x + 4, y + 4.4, 2.2, 2.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COR_PRIMARIA);
  doc.text(espacar(titulo), x + 8, y + 6.6);
}

function semDados(doc: jsPDF, x: number, y: number, largura: number, altura: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COR_TEXTO_SUAVE);
  doc.text("Sem chamados neste recorte.", x + largura / 2, y + altura / 2, { align: "center" });
}

/* Barras horizontais com rótulo à esquerda e total à direita. */
function desenharBarrasHorizontais(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  altura: number,
  itens: ItemGrafico[]
) {
  const areaX = x + 4;
  const areaY = y + 11;
  const areaLargura = largura - 8;
  const areaAltura = altura - 14;

  if (itens.length === 0 || itens.every((item) => item.total === 0)) {
    semDados(doc, x, y, largura, altura);
    return;
  }

  const larguraRotulo = 30;
  const larguraValor = 10;
  const larguraBarraMax = areaLargura - larguraRotulo - larguraValor - 2;
  const maximo = Math.max(...itens.map((item) => item.total), 1);
  const passo = areaAltura / itens.length;
  const alturaBarra = Math.min(5.5, passo * 0.62);

  itens.forEach((item, indice) => {
    const centroY = areaY + passo * indice + passo / 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COR_TEXTO);
    const rotulo = doc.splitTextToSize(textoPdf(item.rotulo), larguraRotulo - 1)[0] ?? "";
    doc.text(rotulo, areaX, centroY + 1.2);

    const larguraBarra = Math.max((item.total / maximo) * larguraBarraMax, item.total > 0 ? 0.8 : 0);
    doc.setFillColor(...COR_FUNDO_ALTERNADO);
    doc.rect(areaX + larguraRotulo, centroY - alturaBarra / 2, larguraBarraMax, alturaBarra, "F");
    if (larguraBarra > 0) {
      doc.setFillColor(...item.cor);
      doc.rect(areaX + larguraRotulo, centroY - alturaBarra / 2, larguraBarra, alturaBarra, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.text(String(item.total), areaX + areaLargura, centroY + 1.2, { align: "right" });
  });
}

/* Barras verticais por dia (chamados abertos), com alguns rótulos de data no eixo. */
function desenharBarrasPorDia(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  altura: number,
  porDia: { dia: string; total: number }[]
) {
  if (porDia.length === 0) {
    semDados(doc, x, y, largura, altura);
    return;
  }

  const areaX = x + 10;
  const areaY = y + 12;
  const areaLargura = largura - 14;
  const areaAltura = altura - 22;
  const baseY = areaY + areaAltura;
  const maximo = Math.max(...porDia.map((item) => item.total), 1);

  doc.setDrawColor(...COR_LINHA);
  doc.setLineWidth(0.2);
  doc.line(areaX, baseY, areaX + areaLargura, baseY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...COR_TEXTO_SUAVE);
  doc.text(String(maximo), areaX - 1.5, areaY + 2, { align: "right" });
  doc.text("0", areaX - 1.5, baseY, { align: "right" });

  const passo = areaLargura / porDia.length;
  const larguraBarra = Math.max(Math.min(passo * 0.7, 6), 0.4);
  const intervaloRotulo = Math.max(1, Math.ceil(porDia.length / 6));
  /* Distância mínima entre rótulos de data ("dd/mm" a 6,5pt tem ~7 mm). */
  const DISTANCIA_MINIMA_ROTULO = 10;
  const ultimoIndice = porDia.length - 1;
  const xCentro = (indice: number) => areaX + passo * indice + passo / 2;

  /* Último dia sempre rotulado; os do intervalo regular só se não encostarem nele. */
  const indicesRotulados = porDia
    .map((_, indice) => indice)
    .filter(
      (indice) =>
        indice === ultimoIndice ||
        (indice % intervaloRotulo === 0 && xCentro(ultimoIndice) - xCentro(indice) >= DISTANCIA_MINIMA_ROTULO)
    );

  porDia.forEach((item, indice) => {
    const alturaBarra = (item.total / maximo) * areaAltura;
    const xBarra = areaX + passo * indice + (passo - larguraBarra) / 2;

    if (alturaBarra > 0) {
      doc.setFillColor(...COR_PRIMARIA);
      doc.rect(xBarra, baseY - alturaBarra, larguraBarra, alturaBarra, "F");
    }

    if (indicesRotulados.includes(indice)) {
      doc.setTextColor(...COR_TEXTO_SUAVE);
      doc.text(formatarDataSimples(item.dia).slice(0, 5), xCentro(indice), baseY + 4, { align: "center" });
    }
  });
}

function topo<T extends { total: number }>(itens: T[], quantidade: number): T[] {
  return [...itens].sort((a, b) => b.total - a.total).slice(0, quantidade);
}

function desenharPaginaGerencial(
  doc: jsPDF,
  dados: EstatisticasChamados,
  filtros: FiltroAplicado[],
  cabecalho: CabecalhoPdf
) {
  desenharFaixa(doc, cabecalho);

  const largura = larguraPagina(doc) - MARGEM * 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COR_TEXTO_SUAVE);
  doc.text(doc.splitTextToSize(textoPdf(descreverFiltros(filtros)), largura)[0] ?? "", MARGEM, 37);

  const totalFechados = dados.totais.fechado;
  const indicadores: [string, string, CorRgb][] = [
    ["Total", String(dados.totais.total), COR_PRIMARIA],
    ["Abertos", String(dados.totais.aberto), COR_STATUS.aberto],
    ["Em andamento", String(dados.totais.emAndamento), COR_STATUS.em_andamento],
    ["Aguardando confirmação", String(dados.totais.aguardandoConfirmacao), COR_STATUS.aguardando_confirmacao],
    ["Resolvidos", String(dados.totais.resolvido), COR_STATUS.resolvido],
    ["Fechados", String(totalFechados), COR_STATUS.fechado],
    ["Tempo médio de resolução", formatarHoras(dados.tempoMedioResolucaoHoras), COR_PRIMARIA],
  ];

  const espaco = 4;
  const larguraIndicador = (largura - espaco * (indicadores.length - 1)) / indicadores.length;
  indicadores.forEach(([rotulo, valor, cor], indice) =>
    desenharIndicador(doc, MARGEM + indice * (larguraIndicador + espaco), 41, larguraIndicador, rotulo, valor, cor)
  );

  /* Grade 3 x 2 de gráficos entre os indicadores e o rodapé. */
  const topoGrade = 67;
  const fimGrade = limiteConteudoY(doc);
  const colunas = 3;
  const larguraPainel = (largura - espaco * (colunas - 1)) / colunas;
  const alturaPainel = (fimGrade - topoGrade - espaco) / 2;
  const posicao = (indice: number) => ({
    x: MARGEM + (indice % colunas) * (larguraPainel + espaco),
    y: topoGrade + Math.floor(indice / colunas) * (alturaPainel + espaco),
  });

  const totaisStatus: Record<StatusChamado, number> = {
    aberto: dados.totais.aberto,
    em_andamento: dados.totais.emAndamento,
    aguardando_confirmacao: dados.totais.aguardandoConfirmacao,
    resolvido: dados.totais.resolvido,
    fechado: dados.totais.fechado,
  };

  const paineis: { titulo: string; desenhar: (x: number, y: number) => void }[] = [
    {
      titulo: "Por status",
      desenhar: (x, y) =>
        desenharBarrasHorizontais(
          doc, x, y, larguraPainel, alturaPainel,
          ORDEM_STATUS.map((status) => ({ rotulo: STATUS_TEXTO[status], total: totaisStatus[status], cor: COR_STATUS[status] }))
        ),
    },
    {
      titulo: "Por prioridade",
      desenhar: (x, y) =>
        desenharBarrasHorizontais(
          doc, x, y, larguraPainel, alturaPainel,
          ORDEM_PRIORIDADE.map((prioridade) => ({
            rotulo: PRIORIDADE_TEXTO[prioridade],
            total: dados.porPrioridade.find((item) => item.prioridade === prioridade)?.total ?? 0,
            cor: COR_PRIORIDADE[prioridade],
          }))
        ),
    },
    {
      titulo: "Abertos por dia",
      desenhar: (x, y) => desenharBarrasPorDia(doc, x, y, larguraPainel, alturaPainel, dados.porDia),
    },
    {
      titulo: "Por setor",
      desenhar: (x, y) =>
        desenharBarrasHorizontais(
          doc, x, y, larguraPainel, alturaPainel,
          topo(dados.porSetor, 6).map((item) => ({ rotulo: item.setorNome, total: item.total, cor: COR_PRIMARIA }))
        ),
    },
    {
      titulo: "Por categoria (top 6)",
      desenhar: (x, y) =>
        desenharBarrasHorizontais(
          doc, x, y, larguraPainel, alturaPainel,
          topo(dados.porCategoria, 6).map((item) => ({ rotulo: item.categoria, total: item.total, cor: [251, 140, 0] }))
        ),
    },
    {
      titulo: "Por atendente (top 6)",
      desenhar: (x, y) =>
        desenharBarrasHorizontais(
          doc, x, y, larguraPainel, alturaPainel,
          topo(dados.porAtendente, 6).map((item) => ({ rotulo: item.atendenteNome, total: item.total, cor: [57, 73, 171] }))
        ),
    },
  ];

  paineis.forEach((painel, indice) => {
    const { x, y } = posicao(indice);
    desenharPainel(doc, x, y, larguraPainel, alturaPainel, painel.titulo);
    painel.desenhar(x, y);
  });
}

/* ---------- PDF ---------- */

export function exportarDashboardPdf(
  dados: EstatisticasChamados,
  relatorio: RelatorioChamados,
  filtros: FiltroAplicado[]
): void {
  const doc = new jsPDF("l", "mm", "a4");
  const geradoEm = new Date();
  const periodo = descreverPeriodo(filtros);

  desenharPaginaGerencial(doc, dados, filtros, {
    modulo: MODULO,
    titulo: "Relatório de Chamados · Visão Gerencial",
    chip: periodo,
  });

  /* Página 2 em diante: a lista. */
  doc.addPage();
  const cabecalhoLista: CabecalhoPdf = { modulo: MODULO, titulo: "Relatório de Chamados · Lista", chip: periodo };
  const redesenharFaixa = () => desenharFaixa(doc, cabecalhoLista);
  redesenharFaixa();

  desenharTituloSecao(doc, `Chamados (${relatorio.total})`, TOPO_CONTEUDO);

  let inicioTabela = TOPO_CONTEUDO + 4;
  if (relatorio.total > relatorio.itens.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...COR_TEXTO_SUAVE);
    doc.text(
      `Mostrando os ${relatorio.itens.length} mais recentes de ${relatorio.total}. Refine os filtros para ver os demais.`,
      MARGEM,
      TOPO_CONTEUDO + 6
    );
    inicioTabela += 5;
  }

  if (relatorio.itens.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...COR_TEXTO_SUAVE);
    doc.text("Nenhum chamado com esses filtros.", MARGEM, TOPO_CONTEUDO + 12);
  } else {
    const itens = relatorio.itens;

    autoTable(doc, {
      startY: inicioTabela,
      margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
      head: [[
        "Nº",
        "Título",
        "Setor / Categoria",
        "Solicitante / Depto.",
        "Empresa / Unidade",
        "Atendente",
        "Status",
        "Prioridade",
        "Aberto em",
        "Resolvido em",
        "Tempo",
      ]],
      body: itens.map((chamado) => [
        String(chamado.numero),
        textoPdf(chamado.titulo),
        textoPdf(`${chamado.setorNome}\n${chamado.categoriaNome ?? "-"}`),
        textoPdf(`${chamado.solicitanteNome}\n${chamado.solicitanteDepartamento ?? "-"}`),
        textoPdf(`${chamado.empresa ?? "-"}${chamado.unidade ? `\n${chamado.unidade}` : ""}`),
        textoPdf(chamado.atendenteNome ?? "-"),
        STATUS_TEXTO[chamado.status] ?? chamado.status,
        PRIORIDADE_TEXTO[chamado.prioridade] ?? chamado.prioridade,
        formatarDataHora(chamado.criadoEm),
        formatarDataHora(chamado.resolvidoEm),
        formatarHoras(horasAteResolver(chamado)),
      ]),
      styles: { ...ESTILO_TABELA, fontSize: 7.5, cellPadding: { top: 2, bottom: 2, left: 1.8, right: 1.8 }, valign: "middle" },
      headStyles: { ...ESTILO_CABECALHO_TABELA, fontSize: 7.5 },
      columnStyles: {
        /* Fixas somam 226 mm dos 269 úteis: o resto fica para o título. Categoria tem nomes longos. */
        0: { cellWidth: 12, fontStyle: "bold" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 44 },
        3: { cellWidth: 30 },
        4: { cellWidth: 22 },
        5: { cellWidth: 24 },
        6: { cellWidth: 21 },
        7: { cellWidth: 18 },
        8: { cellWidth: 20 },
        9: { cellWidth: 21 },
        10: { cellWidth: 14, halign: "right" },
      },
      alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
      didParseCell: (celula) => {
        if (celula.section !== "body") return;
        const chamado = itens[celula.row.index];
        if (!chamado) return;
        if (celula.column.index === 6) {
          celula.cell.styles.textColor = COR_STATUS[chamado.status] ?? COR_TEXTO;
          celula.cell.styles.fontStyle = "bold";
        }
        if (celula.column.index === 7) {
          celula.cell.styles.textColor = COR_PRIORIDADE[chamado.prioridade] ?? COR_TEXTO;
        }
      },
      didDrawPage: redesenharFaixa,
    });
  }

  desenharRodapes(doc, MODULO, geradoEm);
  doc.save(`relatorio-chamados-${dataArquivo(geradoEm)}.pdf`);
}

/* ---------- Excel ---------- */

function dataArquivo(data: Date): string {
  const pad = (valor: number) => String(valor).padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
}

export function exportarDashboardExcel(
  dados: EstatisticasChamados,
  relatorio: RelatorioChamados,
  filtros: FiltroAplicado[]
): void {
  const geradoEm = new Date();

  const resumo: (string | number)[][] = [
    ["Relatório de chamados"],
    ["Gerado em", formatarDataHora(geradoEm.toISOString())],
    ["Período", descreverPeriodo(filtros)],
    ...filtros
      .filter((filtro) => filtro.rotulo !== "Data inicial" && filtro.rotulo !== "Data final")
      .map((filtro) => [filtro.rotulo, filtro.valor]),
    [],
    ["Indicador", "Valor"],
    ["Total", dados.totais.total],
    ["Abertos", dados.totais.aberto],
    ["Em andamento", dados.totais.emAndamento],
    ["Aguardando confirmação", dados.totais.aguardandoConfirmacao],
    ["Resolvidos", dados.totais.resolvido],
    ["Fechados", dados.totais.fechado],
    ["Tempo médio de resolução", formatarHoras(dados.tempoMedioResolucaoHoras)],
  ];
  const planilhaResumo = XLSX.utils.aoa_to_sheet(resumo);
  planilhaResumo["!cols"] = [{ wch: 28 }, { wch: 40 }];

  /* Uma tabela pequena embaixo da outra, com uma linha em branco entre elas. */
  const blocos: [string, string, { rotulo: string; total: number }[]][] = [
    ["Por status", "Status", ORDEM_STATUS.map((status) => ({
      rotulo: STATUS_TEXTO[status],
      total: {
        aberto: dados.totais.aberto,
        em_andamento: dados.totais.emAndamento,
        aguardando_confirmacao: dados.totais.aguardandoConfirmacao,
        resolvido: dados.totais.resolvido,
        fechado: dados.totais.fechado,
      }[status],
    }))],
    ["Por prioridade", "Prioridade", ORDEM_PRIORIDADE.map((prioridade) => ({
      rotulo: PRIORIDADE_TEXTO[prioridade],
      total: dados.porPrioridade.find((item) => item.prioridade === prioridade)?.total ?? 0,
    }))],
    ["Por setor", "Setor", dados.porSetor.map((item) => ({ rotulo: item.setorNome, total: item.total }))],
    ["Por categoria", "Categoria", dados.porCategoria.map((item) => ({ rotulo: item.categoria, total: item.total }))],
    ["Por atendente", "Atendente", dados.porAtendente.map((item) => ({ rotulo: item.atendenteNome, total: item.total }))],
    ["Por empresa", "Empresa", dados.porEmpresa.map((item) => ({ rotulo: item.empresa, total: item.total }))],
    ["Por unidade", "Unidade", dados.porUnidade.map((item) => ({ rotulo: item.unidade, total: item.total }))],
    ["Por departamento", "Departamento", dados.porDepartamento.map((item) => ({ rotulo: item.departamento, total: item.total }))],
    ["Abertos por dia", "Dia", dados.porDia.map((item) => ({ rotulo: formatarDataSimples(item.dia), total: item.total }))],
  ];
  const indicadores: (string | number)[][] = [];
  for (const [titulo, coluna, itens] of blocos) {
    indicadores.push([titulo], [coluna, "Chamados"], ...itens.map((item) => [item.rotulo, item.total]), []);
  }
  const planilhaIndicadores = XLSX.utils.aoa_to_sheet(indicadores);
  planilhaIndicadores["!cols"] = [{ wch: 36 }, { wch: 12 }];

  const planilhaChamados = XLSX.utils.aoa_to_sheet([
    [
      "Nº",
      "Título",
      "Setor",
      "Categoria",
      "Solicitante",
      "Departamento",
      "Empresa",
      "Unidade",
      "Atendente",
      "Status",
      "Prioridade",
      "Aberto em",
      "Resolvido em",
      "Fechado em",
      "Previsão de conclusão",
      "Tempo até resolver (h)",
    ],
    ...relatorio.itens.map((chamado) => {
      const horas = horasAteResolver(chamado);
      return [
        chamado.numero,
        chamado.titulo,
        chamado.setorNome,
        chamado.categoriaNome ?? "",
        chamado.solicitanteNome,
        chamado.solicitanteDepartamento ?? "",
        chamado.empresa ?? "",
        chamado.unidade ?? "",
        chamado.atendenteNome ?? "",
        STATUS_TEXTO[chamado.status] ?? chamado.status,
        PRIORIDADE_TEXTO[chamado.prioridade] ?? chamado.prioridade,
        formatarDataHora(chamado.criadoEm),
        chamado.resolvidoEm ? formatarDataHora(chamado.resolvidoEm) : "",
        chamado.fechadoEm ? formatarDataHora(chamado.fechadoEm) : "",
        chamado.dataPrevistaConclusao ? formatarDataSimples(chamado.dataPrevistaConclusao) : "",
        horas === null ? "" : Math.round(horas * 10) / 10,
      ];
    }),
  ]);
  planilhaChamados["!cols"] = [
    { wch: 7 }, { wch: 50 }, { wch: 16 }, { wch: 24 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 18 },
    { wch: 24 }, { wch: 22 }, { wch: 11 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
  ];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilhaResumo, "Resumo");
  XLSX.utils.book_append_sheet(pasta, planilhaIndicadores, "Indicadores");
  XLSX.utils.book_append_sheet(pasta, planilhaChamados, "Chamados");
  XLSX.writeFile(pasta, `relatorio-chamados-${dataArquivo(geradoEm)}.xlsx`);
}
