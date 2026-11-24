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
import type { CabecalhoPdf, CorRgb, SeloPdf } from "@/lib/pdf/padrao-portal";

import { listarEventos } from "../services/workstationsNvidia.service";
import type {
  DivergenciaPerfil,
  EventoNvidia,
  MaquinaNvidia,
  StatusMaquinaNvidia,
} from "../types/workstationsNvidia.types";
import { descreverValorConfiguracao, formatarDataHora, STATUS_MAQUINA, TIPO_EVENTO } from "./exibicao";

/*
 * Exportação das workstations (PDF e Excel), no navegador, no padrão visual dos PDFs do portal
 * (src/lib/pdf/padrao-portal.ts -- o mesmo de Chamados e Equipamentos Usados):
 *  - uma máquina: dados, divergências do perfil e histórico recente (o mesmo que o detalhe mostra);
 *  - todas: a lista da tela, com o resumo no topo (PDF em paisagem).
 */

const MODULO = "Workstations NVIDIA";
/* Mesma quantidade que o detalhe da máquina mostra. */
const EVENTOS_NO_RELATORIO = 30;

function seloStatus(status: StatusMaquinaNvidia): SeloPdf {
  const info = STATUS_MAQUINA[status];
  return { texto: info.label, ...CORES_VARIANTE_PDF[info.variante] };
}

function corStatus(status: StatusMaquinaNvidia): CorRgb {
  return CORES_VARIANTE_PDF[STATUS_MAQUINA[status].variante].cor;
}

/* "AAAA-MM-DD" sem fuso: formata direto (new Date leria como UTC e mostraria o dia anterior). */
function formatarDataSimples(valor: string | null): string {
  if (!valor) return "—";
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : valor;
}

function perfilAplicado(maquina: MaquinaNvidia, hashOficial: string | null): string {
  if (!maquina.perfilHash) return "—";
  const curto = `${maquina.perfilHash.slice(0, 12)}...`;
  if (!hashOficial) return curto;
  return hashOficial.toUpperCase() === maquina.perfilHash.toUpperCase()
    ? `${curto} (oficial atual)`
    : `${curto} (diferente do oficial)`;
}

function ultimaReaplicacao(maquina: MaquinaNvidia): string {
  if (!maquina.ultimaReaplicacaoEm) return "Nunca precisou reaplicar";
  return `${formatarDataHora(maquina.ultimaReaplicacaoEm)} (${maquina.ultimaReaplicacaoSucesso ? "sucesso" : "falhou"})`;
}

/* Pares rótulo/valor da máquina -- os mesmos no PDF e no Excel. */
function dadosDaMaquina(maquina: MaquinaNvidia, hashOficial: string | null): [string, string][] {
  const status = STATUS_MAQUINA[maquina.status];
  const linhas: [string, string][] = [
    ["Computador", maquina.computador],
    ["Descrição", maquina.descricao ?? "—"],
    ["Situação", `${status.label} — ${status.descricao}`],
    ["Monitorada", maquina.ativo ? "Sim" : "Não (fora da coleta)"],
    ["GPU", maquina.gpu ?? "—"],
    ["Driver NVIDIA", maquina.driverNvidia ?? "—"],
    ["Driver (Windows)", maquina.driverWindows ?? "—"],
    ["Data do driver", formatarDataSimples(maquina.dataDriver)],
    [
      "Verificado pelo script",
      maquina.verificadoEm
        ? `${formatarDataHora(maquina.verificadoEm)}${maquina.executadoComo ? ` (como ${maquina.executadoComo})` : ""}`
        : "—",
    ],
    ["Última reaplicação", ultimaReaplicacao(maquina)],
    ["Perfil aplicado", perfilAplicado(maquina, hashOficial)],
    ["Leitura pelo portal", maquina.coletaEm ? formatarDataHora(maquina.coletaEm) : "Nunca"],
  ];

  if (maquina.coletaOk === false) {
    linhas.push(["Último contato", formatarDataHora(maquina.contatoEm)]);
    if (maquina.coletaErro) linhas.push(["Erro na leitura", maquina.coletaErro]);
  }
  if (maquina.erroScript) linhas.push(["Mensagem do script", maquina.erroScript]);
  linhas.push(["Cadastrada em", formatarDataHora(maquina.criadoEm)]);

  return linhas;
}

function linhaDivergencia(divergencia: DivergenciaPerfil): string[] {
  return [
    divergencia.perfil,
    divergencia.configuracao || divergencia.configuracaoId,
    descreverValorConfiguracao(divergencia.configuracaoId, divergencia.esperado),
    descreverValorConfiguracao(divergencia.configuracaoId, divergencia.encontrado),
  ];
}

function rotuloEvento(evento: EventoNvidia): string {
  return TIPO_EVENTO[evento.tipo]?.label ?? evento.tipo;
}

/* Histórico recente da máquina para o relatório (mesma rota do detalhe). Falha = relatório sem histórico. */
export async function carregarEventosParaExportar(maquinaId: string): Promise<EventoNvidia[]> {
  const resposta = await listarEventos({ maquinaId, pagina: 1 });
  return resposta.ok && resposta.data ? resposta.data.eventos.slice(0, EVENTOS_NO_RELATORIO) : [];
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

function tabelaDivergenciasPdf(
  doc: jsPDF,
  titulo: string,
  divergencias: DivergenciaPerfil[],
  redesenharFaixa: () => void
): void {
  const cursorY = proximaSecaoY(doc, redesenharFaixa);
  desenharTituloSecao(doc, titulo, cursorY);
  autoTable(doc, {
    startY: cursorY + 4,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    head: [["Perfil", "Configuração", "Esperado", "Encontrado"]],
    body: divergencias.map((d) => linhaDivergencia(d).map(textoPdf)),
    styles: { ...ESTILO_TABELA, valign: "top" },
    headStyles: ESTILO_CABECALHO_TABELA,
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    didDrawPage: redesenharFaixa,
  });
}

export function exportarMaquinaPdf(maquina: MaquinaNvidia, hashOficial: string | null, eventos: EventoNvidia[]): void {
  const doc = new jsPDF("p", "mm", "a4");
  const geradoEm = new Date();
  const cabecalho: CabecalhoPdf = {
    modulo: MODULO,
    titulo: "Relatório da Workstation",
    chip: textoPdf(maquina.computador),
    selo: seloStatus(maquina.status),
  };
  const redesenharFaixa = () => desenharFaixa(doc, cabecalho);

  redesenharFaixa();
  desenharTituloSecao(doc, "Dados da máquina", TOPO_CONTEUDO);

  autoTable(doc, {
    startY: TOPO_CONTEUDO + 4,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    body: dadosDaMaquina(maquina, hashOficial).map(([rotulo, valor]) => [rotulo, textoPdf(valor)]),
    styles: { ...ESTILO_TABELA, fontSize: 9.5 },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: "bold", textColor: COR_PRIMARIA },
      1: { cellWidth: "auto" },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    didDrawPage: redesenharFaixa,
  });

  const encontradas = maquina.divergencias?.encontradas ?? [];
  const aposReaplicar = maquina.divergencias?.aposReaplicar ?? [];
  if (encontradas.length > 0) {
    tabelaDivergenciasPdf(
      doc,
      maquina.acao === "reaplicado" ? "Divergências corrigidas" : "Divergências encontradas",
      encontradas,
      redesenharFaixa
    );
  }
  if (aposReaplicar.length > 0) {
    tabelaDivergenciasPdf(doc, "Continuou divergente", aposReaplicar, redesenharFaixa);
  }

  const cursorY = proximaSecaoY(doc, redesenharFaixa);
  desenharTituloSecao(doc, `Histórico recente (${eventos.length})`, cursorY);
  autoTable(doc, {
    startY: cursorY + 4,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    head: [["Data", "Evento", "Descrição"]],
    body:
      eventos.length > 0
        ? eventos.map((evento) => [
            formatarDataHora(evento.ocorridoEm),
            textoPdf(rotuloEvento(evento)),
            textoPdf(evento.descricao),
          ])
        : [["—", "—", "Nenhum evento registrado ainda."]],
    styles: { ...ESTILO_TABELA, valign: "top" },
    headStyles: ESTILO_CABECALHO_TABELA,
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 36 }, 2: { cellWidth: "auto" } },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    didParseCell: (dados) => {
      if (dados.section === "body" && dados.column.index === 0) dados.cell.styles.textColor = COR_TEXTO_SUAVE;
    },
    didDrawPage: redesenharFaixa,
  });

  desenharRodapes(doc, MODULO, geradoEm);
  doc.save(`workstation-${nomeArquivoSeguro(maquina.computador)}.pdf`);
}

export function exportarMaquinaExcel(maquina: MaquinaNvidia, hashOficial: string | null, eventos: EventoNvidia[]): void {
  const planilhaDados = XLSX.utils.aoa_to_sheet([["Campo", "Valor"], ...dadosDaMaquina(maquina, hashOficial)]);
  planilhaDados["!cols"] = [{ wch: 24 }, { wch: 90 }];

  const divergencias = [
    ...(maquina.divergencias?.encontradas ?? []).map((d) => [
      maquina.acao === "reaplicado" ? "Corrigida" : "Encontrada",
      ...linhaDivergencia(d),
    ]),
    ...(maquina.divergencias?.aposReaplicar ?? []).map((d) => ["Continuou divergente", ...linhaDivergencia(d)]),
  ];
  const planilhaDivergencias = XLSX.utils.aoa_to_sheet([
    ["Situação", "Perfil", "Configuração", "Esperado", "Encontrado"],
    ...divergencias,
  ]);
  planilhaDivergencias["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 40 }, { wch: 30 }, { wch: 30 }];

  const planilhaEventos = XLSX.utils.aoa_to_sheet([
    ["Data", "Evento", "Descrição"],
    ...eventos.map((evento) => [formatarDataHora(evento.ocorridoEm), rotuloEvento(evento), evento.descricao]),
  ]);
  planilhaEventos["!cols"] = [{ wch: 17 }, { wch: 24 }, { wch: 100 }];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilhaDados, "Máquina");
  XLSX.utils.book_append_sheet(pasta, planilhaDivergencias, "Divergências");
  XLSX.utils.book_append_sheet(pasta, planilhaEventos, "Histórico");
  XLSX.writeFile(pasta, `workstation-${nomeArquivoSeguro(maquina.computador)}.xlsx`);
}

/* Colunas da lista geral -- mesmas da tela, com datas absolutas (o relativo "há 2h" envelhece no papel). */
function linhaDaLista(maquina: MaquinaNvidia): string[] {
  return [
    STATUS_MAQUINA[maquina.status].label,
    maquina.computador,
    maquina.descricao ?? "",
    maquina.gpu ?? "—",
    maquina.driverNvidia ?? "—",
    formatarDataHora(maquina.verificadoEm),
    maquina.ultimaReaplicacaoEm
      ? `${formatarDataHora(maquina.ultimaReaplicacaoEm)}${maquina.ultimaReaplicacaoSucesso === false ? " (falhou)" : ""}`
      : "—",
    maquina.coletaEm ? formatarDataHora(maquina.coletaEm) : "Nunca",
    maquina.ativo ? "Sim" : "Não",
  ];
}

const CABECALHO_LISTA = [
  "Situação",
  "Máquina",
  "Descrição",
  "GPU",
  "Driver",
  "Verificado pelo script",
  "Última reaplicação",
  "Leitura pelo portal",
  "Ativa",
];

function resumoDaLista(maquinas: MaquinaNvidia[]): [string, string][] {
  const ativas = maquinas.filter((m) => m.ativo);
  const contar = (status: StatusMaquinaNvidia[]) => ativas.filter((m) => status.includes(m.status)).length;
  return [
    ["Máquinas cadastradas", String(maquinas.length)],
    ["Monitoradas", String(ativas.length)],
    ["Conformes", String(contar(["conforme"]))],
    [
      "Precisam de atenção",
      String(contar(["falha", "erro", "divergente", "estado_antigo", "perfil_desatualizado", "adiado"])),
    ],
    ["Sem contato", String(contar(["sem_contato"]))],
  ];
}

export function exportarMaquinasPdf(maquinas: MaquinaNvidia[]): void {
  const doc = new jsPDF("l", "mm", "a4");
  const geradoEm = new Date();
  const cabecalho: CabecalhoPdf = {
    modulo: MODULO,
    titulo: "Relatório das Workstations",
    chip: `${maquinas.length} máquina${maquinas.length === 1 ? "" : "s"}`,
  };
  const redesenharFaixa = () => desenharFaixa(doc, cabecalho);

  redesenharFaixa();
  desenharTituloSecao(doc, "Resumo", TOPO_CONTEUDO);
  autoTable(doc, {
    startY: TOPO_CONTEUDO + 4,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    tableWidth: 110,
    body: resumoDaLista(maquinas),
    styles: { ...ESTILO_TABELA, fontSize: 9.5 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold", textColor: COR_PRIMARIA },
      1: { cellWidth: 50 },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    didDrawPage: redesenharFaixa,
  });

  const cursorY = proximaSecaoY(doc, redesenharFaixa);
  desenharTituloSecao(doc, "Workstations", cursorY);
  autoTable(doc, {
    startY: cursorY + 4,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    head: [CABECALHO_LISTA],
    body: maquinas.map((maquina) => linhaDaLista(maquina).map(textoPdf)),
    styles: { ...ESTILO_TABELA, fontSize: 8.5, valign: "top" },
    headStyles: ESTILO_CABECALHO_TABELA,
    columnStyles: {
      0: { cellWidth: 30, fontStyle: "bold" },
      1: { cellWidth: 28, fontStyle: "bold" },
      8: { cellWidth: 16, halign: "center" },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    /* Situação na cor do status (mesma da tela); máquina fora do monitoramento em cinza. */
    didParseCell: (dados) => {
      if (dados.section !== "body") return;
      const maquina = maquinas[dados.row.index];
      if (!maquina) return;
      if (dados.column.index === 0) dados.cell.styles.textColor = corStatus(maquina.status);
      else if (!maquina.ativo) dados.cell.styles.textColor = COR_TEXTO_SUAVE;
    },
    didDrawPage: redesenharFaixa,
  });

  desenharRodapes(doc, MODULO, geradoEm);
  doc.save("workstations-nvidia.pdf");
}

export function exportarMaquinasExcel(maquinas: MaquinaNvidia[], hashOficial: string | null): void {
  const planilha = XLSX.utils.aoa_to_sheet([
    [...CABECALHO_LISTA, "Detalhe da situação", "Driver (Windows)", "Data do driver", "Perfil aplicado", "Mensagem do script"],
    ...maquinas.map((maquina) => [
      ...linhaDaLista(maquina),
      STATUS_MAQUINA[maquina.status].descricao,
      maquina.driverWindows ?? "",
      formatarDataSimples(maquina.dataDriver),
      perfilAplicado(maquina, hashOficial),
      maquina.erroScript ?? "",
    ]),
  ]);
  planilha["!cols"] = [
    { wch: 20 },
    { wch: 16 },
    { wch: 30 },
    { wch: 30 },
    { wch: 12 },
    { wch: 18 },
    { wch: 24 },
    { wch: 18 },
    { wch: 12 },
    { wch: 60 },
    { wch: 18 },
    { wch: 14 },
    { wch: 34 },
    { wch: 60 },
  ];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilha, "Workstations");
  XLSX.utils.book_append_sheet(
    pasta,
    XLSX.utils.aoa_to_sheet([["Indicador", "Quantidade"], ...resumoDaLista(maquinas)]),
    "Resumo"
  );
  XLSX.writeFile(pasta, "workstations-nvidia.xlsx");
}
