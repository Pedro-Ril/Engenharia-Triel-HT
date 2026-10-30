import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type {
  AnexoMovimentacao,
  CampoTipoEquipamento,
  Equipamento,
  EquipamentoComEstrato,
  HistoricoAlteracaoDadosTecnicos,
  SituacaoErpEquipamento,
  StatusEquipamento,
} from "../types/estoque.types";
import { LOCAL_LABEL, ORIGEM, montarLinhas } from "./extrato-unificado";
import {
  CHAVE_SISTEMA_CODIGO_EMPRESA,
  CHAVE_SISTEMA_DATA_ENTRADA_NF,
  CHAVE_SISTEMA_DESCRICAO,
  CHAVE_SISTEMA_ERP_CODIGO_ITEM,
  CHAVE_SISTEMA_ID_CONFIGURADO,
  CHAVE_SISTEMA_MARCA,
  CHAVE_SISTEMA_MODELO,
  CHAVE_SISTEMA_NOME_CLIENTE,
  CHAVE_SISTEMA_NUMERO_NF_ENTRADA,
  CHAVE_SISTEMA_NUMERO_SERIE,
  CHAVE_SISTEMA_OBSERVACOES,
  CHAVE_SISTEMA_VALOR,
  formatarMoeda,
} from "../constants";

/* Mesma paleta de marca do portal (--primary e os tokens de status em
   src/app/globals.css, versão clara — o PDF não segue o tema do usuário). */
const COR_PRIMARIA: [number, number, number] = [183, 28, 28];
const COR_PRIMARIA_ESCURA: [number, number, number] = [127, 20, 20];
const COR_TEXTO: [number, number, number] = [33, 33, 33];
const COR_TEXTO_SUAVE: [number, number, number] = [110, 110, 110];
const COR_LINHA: [number, number, number] = [230, 230, 230];
const COR_FUNDO_ALTERNADO: [number, number, number] = [248, 249, 251];
const COR_FAIXA_CLARA: [number, number, number] = [255, 214, 214];

const STATUS_LABELS: Record<StatusEquipamento, string> = {
  em_estoque: "Em estoque",
  emprestado: "Emprestado",
  consignado: "Em consignação",
  em_reforma: "Em reforma/conserto",
  baixado: "Baixado",
};

const STATUS_CORES: Record<StatusEquipamento, { bg: [number, number, number]; text: [number, number, number] }> = {
  em_estoque: { bg: [236, 253, 243], text: [22, 101, 52] },
  emprestado: { bg: [255, 247, 237], text: [154, 52, 18] },
  consignado: { bg: [239, 246, 255], text: [29, 78, 216] },
  em_reforma: { bg: [245, 243, 255], text: [109, 40, 217] },
  baixado: { bg: [243, 244, 246], text: [75, 85, 99] },
};

const MARGEM = 14;
const ALTURA_FAIXA = 30;
const TOPO_CONTEUDO = ALTURA_FAIXA + 12;

/* Largura/altura do próprio documento: o extrato sai em paisagem, a entrada em retrato. */
function larguraPagina(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

function rodapeY(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - 12;
}

function formatarData(data?: string | null): string {
  if (!data) return "-";

  /* "AAAA-MM-DD" vem do banco sem fuso: formata direto (new Date leria como UTC e mostraria o dia anterior). */
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`;

  const date = new Date(data);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatarDataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

function formatarDataHoraIso(dataIso: string): string {
  return formatarDataHora(new Date(dataIso));
}

function formatarValorHistorico(valor: unknown): string {
  if (valor === undefined || valor === null || valor === "") return "-";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (Array.isArray(valor)) return valor.length > 0 ? valor.join(", ") : "-";
  return String(valor);
}

function formatarValorCampo(campo: CampoTipoEquipamento, valor: unknown): string {
  if (valor === undefined || valor === null || valor === "") return "-";

  if (campo.tipoDado === "booleano") return valor ? "Sim" : "Não";
  if (campo.tipoDado === "data") return formatarData(String(valor));
  if (campo.tipoDado === "multipla_escolha" && Array.isArray(valor)) return valor.join(", ") || "-";

  const texto = String(valor);
  return campo.unidade ? `${texto} ${campo.unidade}` : texto;
}

/*
 * Código e descrição sempre ficam em colunas separadas no banco — "código
 * | descrição" é só o formato de exibição, remontado aqui na leitura.
 */
function formatarCodDescricao(codigo: string | null, descricao: string | null, vazio: string): string {
  if (codigo && descricao) return `${codigo} | ${descricao}`;
  return descricao || codigo || vazio;
}

/*
 * Valor de cada um dos 12 campos fixos do sistema — mesma lógica de
 * EquipamentoDetalhePage.tsx (valorCampoSistemaExibicao), duplicada aqui
 * porque este arquivo não pode importar de um componente "use client".
 */
function valorCampoSistemaPdf(equipamento: Equipamento, campo: CampoTipoEquipamento, nomeEmpresa: string | null): string {
  /* Mesma regra de EquipamentoDetalhePage.tsx: o placeholder segue o
     flag "vem de integração" do campo, não uma lista fixa de chaves. */
  const vazio = campo.vemDeIntegracao ? "Aguardando integração" : "-";

  switch (campo.chave) {
    case CHAVE_SISTEMA_NOME_CLIENTE:
      return formatarCodDescricao(equipamento.codigoCliente, equipamento.nomeCliente, vazio);
    case CHAVE_SISTEMA_VALOR:
      return formatarMoeda(equipamento.valor);
    case CHAVE_SISTEMA_MARCA:
      return equipamento.marca ?? vazio;
    case CHAVE_SISTEMA_MODELO:
      return equipamento.modelo ?? vazio;
    case CHAVE_SISTEMA_NUMERO_SERIE:
      return equipamento.numeroSerie ?? vazio;
    case CHAVE_SISTEMA_CODIGO_EMPRESA:
      return formatarCodDescricao(equipamento.codigoEmpresa, nomeEmpresa, vazio);
    case CHAVE_SISTEMA_NUMERO_NF_ENTRADA:
      return equipamento.numeroNfEntrada ?? vazio;
    case CHAVE_SISTEMA_ERP_CODIGO_ITEM:
      return equipamento.erpCodigoItem ?? vazio;
    case CHAVE_SISTEMA_ID_CONFIGURADO:
      return equipamento.erpIdItem ?? vazio;
    case CHAVE_SISTEMA_DATA_ENTRADA_NF:
      return equipamento.erpDataEntrada ? formatarData(equipamento.erpDataEntrada) : vazio;
    case CHAVE_SISTEMA_OBSERVACOES:
      return equipamento.observacoes ?? "-";
    default:
      return "-";
  }
}

/* Efeito de letter-spacing manual — jsPDF não tem a propriedade nativa,
   mas um espaço entre cada letra reproduz o mesmo "ar" do rótulo em
   caixa alta usado nos cabeçalhos de seção do portal (ex: Card title). */
function espacar(texto: string): string {
  return texto.toUpperCase().split("").join(" ");
}

function desenharFaixaCabecalho(doc: jsPDF, equipamento: Equipamento, tituloPagina: string): void {
  const LARGURA_PAGINA = larguraPagina(doc);
  doc.setFillColor(...COR_PRIMARIA);
  doc.rect(0, 0, LARGURA_PAGINA, ALTURA_FAIXA, "F");
  doc.setFillColor(...COR_PRIMARIA_ESCURA);
  doc.rect(0, ALTURA_FAIXA - 1.2, LARGURA_PAGINA, 1.2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COR_FAIXA_CLARA);
  doc.text(espacar("Portal Triel-HT · Estoque de Equipamentos Usados"), MARGEM, 10);

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(tituloPagina, MARGEM, 21);

  const rotuloNumero = `Nº ${equipamento.numero}`;
  doc.setFontSize(13);
  const larguraChip = doc.getTextWidth(rotuloNumero) + 12;
  const xChip = LARGURA_PAGINA - MARGEM - larguraChip;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(xChip, 8, larguraChip, 10, 2, 2, "F");
  doc.setTextColor(...COR_PRIMARIA);
  doc.text(rotuloNumero, xChip + larguraChip / 2, 14.7, { align: "center" });

  const statusInfo = STATUS_CORES[equipamento.status];
  const rotuloStatus = STATUS_LABELS[equipamento.status];
  doc.setFontSize(9);
  const larguraStatus = doc.getTextWidth(rotuloStatus) + 10;
  const xStatus = LARGURA_PAGINA - MARGEM - larguraStatus;
  doc.setFillColor(...statusInfo.bg);
  doc.roundedRect(xStatus, 21, larguraStatus, 6.5, 1.5, 1.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...statusInfo.text);
  doc.text(rotuloStatus, xStatus + larguraStatus / 2, 25.4, { align: "center" });
}

function desenharTituloSecao(doc: jsPDF, titulo: string, y: number): void {
  doc.setFillColor(...COR_PRIMARIA);
  doc.rect(MARGEM, y - 3.6, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COR_PRIMARIA);
  doc.text(espacar(titulo), MARGEM + 5, y);
}

/* Título + tabela chave/valor no mesmo estilo — usado por "Dados do
   Recebimento" e "Dados de Integração", que têm exatamente a mesma cara. */
function desenharTabelaChaveValor(
  doc: jsPDF,
  equipamento: Equipamento,
  tituloPagina: string,
  tituloSecao: string,
  y: number,
  linhas: [string, string][]
): number {
  desenharTituloSecao(doc, tituloSecao, y);

  autoTable(doc, {
    startY: y + 4,
    margin: { top: ALTURA_FAIXA + 6, left: MARGEM, right: MARGEM },
    body: linhas,
    styles: {
      fontSize: 10,
      cellPadding: 3,
      textColor: COR_TEXTO,
      lineColor: COR_LINHA,
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold", textColor: COR_PRIMARIA },
      1: { cellWidth: "auto" },
    },
    alternateRowStyles: {
      fillColor: COR_FUNDO_ALTERNADO,
    },
    didDrawPage: () => desenharFaixaCabecalho(doc, equipamento, tituloPagina),
  });

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
}

function desenharRodapes(doc: jsPDF, geradoEm: Date): void {
  const totalPaginas = doc.getNumberOfPages();

  const LARGURA_PAGINA = larguraPagina(doc);
  const RODAPE_Y = rodapeY(doc);

  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);

    doc.setDrawColor(...COR_LINHA);
    doc.setLineWidth(0.2);
    doc.line(MARGEM, RODAPE_Y - 4, LARGURA_PAGINA - MARGEM, RODAPE_Y - 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_TEXTO_SUAVE);
    doc.text("Portal Triel-HT · Estoque de Equipamentos Usados", MARGEM, RODAPE_Y);
    doc.text(
      `Página ${pagina} de ${totalPaginas}  ·  Gerado em ${formatarDataHora(geradoEm)}`,
      LARGURA_PAGINA - MARGEM,
      RODAPE_Y,
      { align: "right" }
    );
  }
}

export function exportarPdfEntradaEquipamento(
  equipamento: Equipamento,
  camposDoTipo: CampoTipoEquipamento[] = [],
  nomeEmpresa: string | null = null
): void {
  const doc = new jsPDF("p", "mm", "a4");
  const geradoEm = new Date();
  const tituloPagina = "Relatório de Entrada de Equipamento";

  desenharFaixaCabecalho(doc, equipamento, tituloPagina);

  /*
   * Bloco fixo identificado por quem tem campo de sistema (todo campo de
   * sistema mora lá, por construção) — evita precisar receber
   * blocosDoTipo só pra achar o id do bloco "Recebimento". A ordem
   * (sistema + dinâmico intercalados) já vem certa de listarCamposDoTipo
   * (ORDER BY bloco, campo) — mesma lógica de EquipamentoDetalhePage.tsx.
   */
  const blocoFixoId = camposDoTipo.find((campo) => campo.ehSistema)?.blocoId;
  const valores = equipamento.camposValores ?? {};

  const camposDoBlocoFixo = camposDoTipo.filter(
    (campo) => campo.blocoId === blocoFixoId && campo.chave !== CHAVE_SISTEMA_DESCRICAO
  );
  const camposRecebimento = camposDoBlocoFixo.filter((campo) => !campo.vemDeIntegracao);
  const camposIntegracao = camposDoBlocoFixo.filter((campo) => campo.vemDeIntegracao);

  function linhaCampo(campo: CampoTipoEquipamento): [string, string] {
    return [
      campo.rotulo,
      campo.ehSistema
        ? valorCampoSistemaPdf(equipamento, campo, nomeEmpresa)
        : formatarValorCampo(campo, valores[campo.chave]),
    ];
  }

  const linhasRecebimento: [string, string][] = [
    [
      camposDoTipo.find((c) => c.chave === CHAVE_SISTEMA_DESCRICAO)?.rotulo || "Descrição",
      equipamento.descricao,
    ],
    ...camposRecebimento.map(linhaCampo),
    ["Responsável pela entrada", equipamento.criadoPorNome],
    ["Data de cadastro", formatarData(equipamento.criadoEm)],
  ];

  let cursorY = desenharTabelaChaveValor(
    doc,
    equipamento,
    tituloPagina,
    "Dados do Recebimento",
    TOPO_CONTEUDO,
    linhasRecebimento
  );

  if (camposIntegracao.length > 0) {
    if (cursorY > 250) {
      doc.addPage();
      desenharFaixaCabecalho(doc, equipamento, tituloPagina);
      cursorY = TOPO_CONTEUDO;
    }

    cursorY = desenharTabelaChaveValor(
      doc,
      equipamento,
      tituloPagina,
      "Dados de Integração",
      cursorY,
      camposIntegracao.map(linhaCampo)
    );
  }

  /* Só campos dinâmicos de OUTROS blocos aqui — os do bloco fixo (sistema
     e dinâmico) já saíram na tabela de Recebimento acima. */
  const camposDinamicos = camposDoTipo.filter((campo) => !campo.ehSistema && campo.blocoId !== blocoFixoId);

  /* camposDinamicos já vem ordenado por bloco (ordem)/campo (ordem) — a
     ordem de primeira aparição de cada blocoId aqui já é a ordem certa
     dos blocos, sem precisar buscar a lista de blocos à parte. */
  const blocosNaOrdem: { id: string; nome: string }[] = [];
  for (const campo of camposDinamicos) {
    if (!blocosNaOrdem.some((bloco) => bloco.id === campo.blocoId)) {
      blocosNaOrdem.push({ id: campo.blocoId, nome: campo.blocoNome });
    }
  }

  for (const bloco of blocosNaOrdem) {
    const camposDoBloco = camposDinamicos.filter((campo) => campo.blocoId === bloco.id);
    if (camposDoBloco.length === 0) continue;

    if (cursorY > 250) {
      doc.addPage();
      desenharFaixaCabecalho(doc, equipamento, tituloPagina);
      cursorY = TOPO_CONTEUDO;
    }

    desenharTituloSecao(doc, bloco.nome, cursorY);

    autoTable(doc, {
      startY: cursorY + 4,
      margin: { top: ALTURA_FAIXA + 6, left: MARGEM, right: MARGEM },
      body: camposDoBloco.map((campo) => [campo.rotulo, formatarValorCampo(campo, valores[campo.chave])]),
      styles: {
        fontSize: 9,
        cellPadding: 2.5,
        textColor: COR_TEXTO,
        lineColor: COR_LINHA,
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: "bold" },
        1: { cellWidth: "auto" },
      },
      alternateRowStyles: {
        fillColor: COR_FUNDO_ALTERNADO,
      },
      didDrawPage: () => desenharFaixaCabecalho(doc, equipamento, tituloPagina),
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  }

  desenharRodapes(doc, geradoEm);

  doc.save(`entrada-equipamento-${equipamento.numero}.pdf`);
}

/*
 * Extrato — histórico completo (mesma cara do relatório de entrada:
 * faixa vermelha, rodapé com paginação, tabela zebrada) — uma tabela só,
 * com cabeçalho de coluna (diferente da chave/valor do relatório de
 * entrada, aqui cada linha é uma movimentação).
 */
export function exportarPdfEstratoEquipamento(
  equipamento: EquipamentoComEstrato,
  anexosPorMovimentacao: Map<string, AnexoMovimentacao[]> = new Map(),
  historicoDados: HistoricoAlteracaoDadosTecnicos[] = [],
  situacaoErp: SituacaoErpEquipamento | null = null
): void {
  const doc = new jsPDF("l", "mm", "a4");
  const geradoEm = new Date();
  const tituloPagina = "Extrato — Histórico Completo";
  let cursorInicio = TOPO_CONTEUDO;

  desenharFaixaCabecalho(doc, equipamento, tituloPagina);

  /* Situação atual segundo o ERP (a mesma faixa do topo do card na tela). */
  if (situacaoErp?.local) {
    desenharTituloSecao(doc, "Situação no ERP", cursorInicio);
    const local = LOCAL_LABEL[situacaoErp.local]?.texto ?? situacaoErp.local;
    autoTable(doc, {
      startY: cursorInicio + 4,
      margin: { top: ALTURA_FAIXA + 6, left: MARGEM, right: MARGEM },
      head: [["Situação", "Com quem", "Custo de compra", "Última conferência"]],
      body: [
        [
          situacaoErp.desde ? `${local} desde ${formatarData(situacaoErp.desde)}` : local,
          situacaoErp.local === "EM_TERCEIRO" || situacaoErp.local === "FORA_DA_EMPRESA" ? (situacaoErp.contraparte ?? "-") : "-",
          formatarMoeda(situacaoErp.custoCompra),
          situacaoErp.sincronizadoEm ? formatarDataHoraIso(situacaoErp.sincronizadoEm) : "-",
        ],
      ],
      styles: { fontSize: 9, cellPadding: 2.5, textColor: COR_TEXTO, lineColor: COR_LINHA, lineWidth: 0.1 },
      headStyles: { fillColor: COR_FUNDO_ALTERNADO, textColor: COR_TEXTO_SUAVE, fontStyle: "bold", fontSize: 8 },
      didDrawPage: () => desenharFaixaCabecalho(doc, equipamento, tituloPagina),
    });
    cursorInicio = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  }

  desenharTituloSecao(doc, "Movimentações — Portal e ERP", cursorInicio);

  const linhas = montarLinhas(equipamento.movimentacoes, situacaoErp?.movimentos ?? [], anexosPorMovimentacao).map((linha) => [
    formatarData(linha.data),
    linha.detalheErp ? `${linha.acao}\n${linha.detalheErp}` : linha.acao,
    linha.nf ?? "-",
    linha.cfop !== null ? String(linha.cfop) : "-",
    formatarMoeda(linha.valor),
    formatarData(linha.emissao),
    linha.comQuem ?? "-",
    linha.status?.texto ?? "-",
    linha.anexos.length > 0 ? linha.anexos.map((anexo) => anexo.nomeArquivo).join(", ") : "-",
    linha.responsavel,
    ORIGEM[linha.origem].texto,
  ]);

  autoTable(doc, {
    startY: cursorInicio + 4,
    margin: { top: ALTURA_FAIXA + 6, left: MARGEM, right: MARGEM },
    head: [["Data", "Movimentação", "NF", "CFOP", "Valor", "Emissão NF", "Com quem", "Status", "Anexos", "Responsável", "Origem"]],
    body: linhas,
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      textColor: COR_TEXTO,
      lineColor: COR_LINHA,
      lineWidth: 0.1,
      valign: "middle",
    },
    headStyles: {
      fillColor: COR_PRIMARIA,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    columnStyles: {
      /* Larguras fixas somam ~228 mm dos 269 úteis: o resto fica para "Com quem", a coluna de nomes longos. */
      0: { cellWidth: 21 },
      1: { cellWidth: 38 },
      2: { cellWidth: 18 },
      3: { cellWidth: 14 },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 21 },
      6: { cellWidth: "auto" },
      7: { cellWidth: 23 },
      8: { cellWidth: 25 },
      9: { cellWidth: 26 },
      10: { cellWidth: 18 },
    },
    alternateRowStyles: {
      fillColor: COR_FUNDO_ALTERNADO,
    },
    didDrawPage: () => desenharFaixaCabecalho(doc, equipamento, tituloPagina),
  });

  if (historicoDados.length > 0) {
    const cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

    desenharTituloSecao(doc, "Histórico de Alterações de Dados Técnicos", cursorY);

    const linhasHistorico = historicoDados.flatMap((registro) =>
      registro.alteracoes.map((alteracao) => [
        formatarDataHoraIso(registro.criadoEm),
        registro.autorNome,
        alteracao.rotulo,
        formatarValorHistorico(alteracao.de),
        formatarValorHistorico(alteracao.para),
        registro.motivo ?? "-",
      ])
    );

    autoTable(doc, {
      startY: cursorY + 4,
      margin: { top: ALTURA_FAIXA + 6, left: MARGEM, right: MARGEM },
      head: [["Data", "Autor", "Campo", "De", "Para", "Motivo"]],
      body: linhasHistorico,
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5,
        textColor: COR_TEXTO,
        lineColor: COR_LINHA,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: COR_PRIMARIA,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
      },
      alternateRowStyles: {
        fillColor: COR_FUNDO_ALTERNADO,
      },
      didDrawPage: () => desenharFaixaCabecalho(doc, equipamento, tituloPagina),
    });
  }

  desenharRodapes(doc, geradoEm);

  doc.save(`extrato-equipamento-${equipamento.numero}.pdf`);
}
