import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import {
  COR_FUNDO_ALTERNADO,
  COR_PRIMARIA,
  COR_TEXTO_SUAVE,
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
  textoPdf,
} from "@/lib/pdf/padrao-portal";
import type { CabecalhoPdf, SeloPdf } from "@/lib/pdf/padrao-portal";

import { buscarChamado } from "../services/chamados.service";
import type { Chamado, ChamadoMensagem, PrioridadeChamado, StatusChamado } from "../types/chamados.types";

/*
 * Exportação de UM chamado (PDF e Excel), no navegador. Sai exatamente o
 * que a pessoa já pode ver: o chamado vem de GET /api/chamados/[numero]
 * (ou do próprio detalhe), que só manda notas internas para atendente.
 */

const MODULO = "Chamados";

export const STATUS_TEXTO: Record<StatusChamado, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_confirmacao: "Aguardando confirmação",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

export const PRIORIDADE_TEXTO: Record<PrioridadeChamado, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

/* Mesmas cores dos tokens --info/--warning/--success/--neutral (versão clara). */
export const SELO_STATUS: Record<StatusChamado, SeloPdf> = {
  aberto: { texto: "Aberto", fundo: [239, 246, 255], cor: [29, 78, 216] },
  em_andamento: { texto: "Em andamento", fundo: [255, 247, 237], cor: [154, 52, 18] },
  aguardando_confirmacao: { texto: "Aguardando confirmação", fundo: [255, 251, 235], cor: [180, 83, 9] },
  resolvido: { texto: "Resolvido", fundo: [236, 253, 243], cor: [22, 101, 52] },
  fechado: { texto: "Fechado", fundo: [243, 244, 246], cor: [75, 85, 99] },
};

const AUTOR_TEXTO: Record<ChamadoMensagem["autorTipo"], string> = {
  solicitante: "Solicitante",
  atendente: "Atendente",
  sistema: "Sistema",
};

export function formatarDataHora(valorIso: string | null | undefined): string {
  if (!valorIso) return "-";
  const data = new Date(valorIso);
  if (Number.isNaN(data.getTime())) return "-";
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }).replace(",", "");
}

/* "AAAA-MM-DD" sem fuso: formata direto (new Date leria como UTC e mostraria o dia anterior). */
export function formatarDataSimples(valor: string | null | undefined): string {
  if (!valor) return "-";
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : "-";
}

/*
 * Mensagem em HTML (editor de texto) -> texto corrido para PDF/Excel:
 * parágrafos e quebras viram linha, listas ganham marcador/número,
 * tabelas viram linhas "a | b | c" e imagens coladas viram "[imagem]".
 */
export function htmlParaTexto(html: string): string {
  const documento = new DOMParser().parseFromString(html, "text/html");
  const partes: string[] = [];

  /*
   * `dentroDeItem`: o editor põe um <p> dentro de cada <li> -- ali o
   * parágrafo não pode quebrar linha, senão o número/marcador fica sozinho
   * numa linha e o texto na de baixo.
   */
  function percorrer(no: Node, prefixoLista = "", dentroDeItem = false): void {
    if (no.nodeType === Node.TEXT_NODE) {
      partes.push((no.textContent ?? "").replace(/\s+/g, " "));
      return;
    }

    if (no.nodeType !== Node.ELEMENT_NODE) return;

    const elemento = no as Element;
    const tag = elemento.tagName.toLowerCase();

    if (tag === "br") {
      partes.push("\n");
      return;
    }

    if (tag === "img") {
      partes.push("[imagem]");
      return;
    }

    if (tag === "ul" || tag === "ol") {
      let indice = 1;
      for (const filho of Array.from(elemento.children)) {
        if (filho.tagName.toLowerCase() !== "li") continue;
        partes.push(`\n${prefixoLista}${tag === "ol" ? `${indice}.` : "•"} `);
        for (const neto of Array.from(filho.childNodes)) percorrer(neto, `${prefixoLista}   `, true);
        indice += 1;
      }
      partes.push("\n");
      return;
    }

    if (tag === "tr") {
      const celulas = Array.from(elemento.children).map((celula) =>
        (celula.textContent ?? "").replace(/\s+/g, " ").trim()
      );
      partes.push(`\n${celulas.join(" | ")}`);
      return;
    }

    if (tag === "a") {
      const texto = (elemento.textContent ?? "").trim();
      const href = elemento.getAttribute("href") ?? "";
      partes.push(href && href !== texto ? `${texto} (${href})` : texto);
      return;
    }

    const bloco =
      !dentroDeItem && ["p", "div", "h1", "h2", "h3", "h4", "blockquote", "pre", "table"].includes(tag);
    if (bloco) partes.push("\n");
    for (const filho of Array.from(elemento.childNodes)) percorrer(filho, prefixoLista, dentroDeItem);
    if (bloco) partes.push("\n");
  }

  for (const filho of Array.from(documento.body.childNodes)) percorrer(filho);

  /* Recuo só faz sentido em item de lista aninhada; nas demais linhas é sobra de espaço do HTML. */
  return partes
    .join("")
    .split("\n")
    .map((linha) => (/^\s+(•|\d+\.)\s/.test(linha) ? linha.trimEnd() : linha.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textoDaMensagem(mensagem: ChamadoMensagem): string {
  return mensagem.formato === "html" ? htmlParaTexto(mensagem.texto) : mensagem.texto.trim();
}

/* Pares rótulo/valor com os dados do chamado -- mesmos no PDF e no Excel. */
function dadosDoChamado(chamado: Chamado): [string, string][] {
  const linhas: [string, string][] = [
    ["Título", chamado.titulo],
    ["Status", STATUS_TEXTO[chamado.status]],
    ["Prioridade", PRIORIDADE_TEXTO[chamado.prioridade]],
    ["Setor", chamado.setorNome],
    ["Categoria", chamado.categoriaNome ?? "-"],
    [
      "Solicitante",
      chamado.criadoPorNome
        ? `${chamado.solicitanteNome} (registrado por ${chamado.criadoPorNome})`
        : chamado.solicitanteNome,
    ],
    ["Contato", chamado.solicitanteContato ?? "-"],
    ["Departamento", chamado.solicitanteDepartamento ?? "-"],
    ["Empresa", chamado.empresaNome ?? chamado.empresa ?? "-"],
  ];

  if (chamado.unidade) linhas.push(["Unidade", chamado.unidade]);

  linhas.push(
    ["Atendente", chamado.atendenteNome ?? "Sem atendente definido"],
    ["Aberto em", formatarDataHora(chamado.criadoEm)],
    ["Última atualização", formatarDataHora(chamado.atualizadoEm)],
    ["Previsão de conclusão", formatarDataSimples(chamado.dataPrevistaConclusao)],
    ["Resolvido em", formatarDataHora(chamado.resolvidoEm)],
    ["Fechado em", formatarDataHora(chamado.fechadoEm)]
  );

  return linhas;
}

function autorDaMensagem(mensagem: ChamadoMensagem): string {
  const papel = AUTOR_TEXTO[mensagem.autorTipo];
  return mensagem.interno ? `${papel} · nota interna` : papel;
}

function anexosDaMensagem(mensagem: ChamadoMensagem): string {
  return mensagem.anexos.map((anexo) => anexo.nomeArquivo).join(", ");
}

export function exportarChamadoPdf(chamado: Chamado): void {
  const doc = new jsPDF("p", "mm", "a4");
  const geradoEm = new Date();
  const cabecalho: CabecalhoPdf = {
    modulo: MODULO,
    titulo: "Relatório do Chamado",
    chip: `Nº ${chamado.numero}`,
    selo: SELO_STATUS[chamado.status],
  };
  const redesenharFaixa = () => desenharFaixa(doc, cabecalho);

  redesenharFaixa();
  desenharTituloSecao(doc, "Dados do chamado", TOPO_CONTEUDO);

  autoTable(doc, {
    startY: TOPO_CONTEUDO + 4,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    body: dadosDoChamado(chamado).map(([rotulo, valor]) => [rotulo, textoPdf(valor)]),
    styles: { ...ESTILO_TABELA, fontSize: 9.5 },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: "bold", textColor: COR_PRIMARIA },
      1: { cellWidth: "auto" },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    didDrawPage: redesenharFaixa,
  });

  let cursorY = fimUltimaTabela(doc) + 12;
  if (cursorY > limiteConteudoY(doc) - 30) {
    doc.addPage();
    redesenharFaixa();
    cursorY = TOPO_CONTEUDO;
  }

  desenharTituloSecao(doc, `Conversa (${chamado.mensagens.length})`, cursorY);

  const mensagens = chamado.mensagens;

  autoTable(doc, {
    startY: cursorY + 4,
    margin: { top: MARGEM_TOPO_TABELA, left: MARGEM, right: MARGEM },
    head: [["Data", "Autor", "Mensagem"]],
    body: mensagens.map((mensagem) => {
      const anexos = anexosDaMensagem(mensagem);
      return [
        formatarDataHora(mensagem.criadoEm),
        textoPdf(
          mensagem.autorTipo === "sistema"
            ? autorDaMensagem(mensagem)
            : `${mensagem.autorNome}\n${autorDaMensagem(mensagem)}`
        ),
        textoPdf(`${textoDaMensagem(mensagem) || "-"}${anexos ? `\n\nAnexos: ${anexos}` : ""}`),
      ];
    }),
    styles: { ...ESTILO_TABELA, valign: "top" },
    headStyles: ESTILO_CABECALHO_TABELA,
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 38 },
      2: { cellWidth: "auto" },
    },
    alternateRowStyles: { fillColor: COR_FUNDO_ALTERNADO },
    /* Nota interna em amarelo claro (token --warning-bg), igual à tela. */
    didParseCell: (dados) => {
      if (dados.section === "body" && mensagens[dados.row.index]?.interno) {
        dados.cell.styles.fillColor = [255, 251, 235];
      }
      if (dados.section === "body" && dados.column.index === 1) {
        dados.cell.styles.textColor = COR_TEXTO_SUAVE;
      }
    },
    didDrawPage: redesenharFaixa,
  });

  desenharRodapes(doc, MODULO, geradoEm);
  doc.save(`chamado-${chamado.numero}.pdf`);
}

export function exportarChamadoExcel(chamado: Chamado): void {
  const planilhaChamado = XLSX.utils.aoa_to_sheet([["Campo", "Valor"], ...dadosDoChamado(chamado)]);
  planilhaChamado["!cols"] = [{ wch: 24 }, { wch: 80 }];

  const planilhaMensagens = XLSX.utils.aoa_to_sheet([
    ["Data", "Autor", "Papel", "Nota interna", "Mensagem", "Anexos"],
    ...chamado.mensagens.map((mensagem) => [
      formatarDataHora(mensagem.criadoEm),
      mensagem.autorNome,
      AUTOR_TEXTO[mensagem.autorTipo],
      mensagem.interno ? "Sim" : "Não",
      textoDaMensagem(mensagem),
      anexosDaMensagem(mensagem),
    ]),
  ]);
  planilhaMensagens["!cols"] = [{ wch: 17 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 90 }, { wch: 40 }];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilhaChamado, "Chamado");
  XLSX.utils.book_append_sheet(pasta, planilhaMensagens, "Mensagens");
  XLSX.writeFile(pasta, `chamado-${chamado.numero}.xlsx`);
}

/* Para as listas (fila, meus chamados): busca o chamado completo com as regras de acesso de sempre. */
export async function carregarChamadoParaExportar(numero: number): Promise<Chamado> {
  const resultado = await buscarChamado(numero);

  if (!resultado.ok || !resultado.data) {
    throw new Error(resultado.message ?? "Não foi possível carregar o chamado.");
  }

  return resultado.data;
}
