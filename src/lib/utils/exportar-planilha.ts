/*
 * Gera uma planilha simples no navegador e entrega ao usuário.
 *
 * É para tabela pequena montada na tela -- o resumo de ordens que
 * fecha o processo do Lantek e do TuBest, por exemplo. Exportação
 * grande continua sendo feita no servidor (ver
 * /api/integra-tubest/exportar), que lida melhor com volume e não
 * depende do que o navegador aguenta.
 *
 * O xlsx entra por import dinâmico porque é pesado: quem nunca clica
 * em exportar não paga por ele.
 */

export type ResultadoExportacao = "salvo" | "baixado";

interface OpcoesSalvar {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface HandleArquivo {
  createWritable: () => Promise<{
    write: (dados: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

type JanelaComPicker = Window & {
  showSaveFilePicker?: (opcoes: OpcoesSalvar) => Promise<HandleArquivo>;
};

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface PlanilhaParaExportar {
  nomeArquivo: string;
  nomeAba: string;
  cabecalho: string[];
  linhas: (string | number)[][];
}

/*
 * Baixa pelo caminho comum. O diálogo "escolher onde salvar" exige
 * contexto seguro e o portal ainda é servido por HTTP, então na
 * prática é isto que acontece hoje -- mesma limitação já documentada
 * em integra-tubest/utils/salvar-arquivo.ts.
 */
function baixar(conteudo: Blob, nomeArquivo: string): ResultadoExportacao {
  const url = URL.createObjectURL(conteudo);
  const link = document.createElement("a");

  link.href = url;
  link.download = nomeArquivo;
  link.click();

  /* Revoga só depois do clique ser processado. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return "baixado";
}

export async function exportarPlanilha(
  planilha: PlanilhaParaExportar
): Promise<ResultadoExportacao> {
  const XLSX = await import("xlsx");

  const aba = XLSX.utils.aoa_to_sheet([planilha.cabecalho, ...planilha.linhas]);

  /* Largura por coluna a partir do conteúdo, para não sair tudo cortado. */
  aba["!cols"] = planilha.cabecalho.map((titulo, coluna) => {
    const maiorCelula = planilha.linhas.reduce((maior, linha) => {
      const tamanho = String(linha[coluna] ?? "").length;
      return tamanho > maior ? tamanho : maior;
    }, titulo.length);

    return { wch: Math.min(Math.max(maiorCelula + 2, 10), 60) };
  });

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, aba, planilha.nomeAba);

  const bytes = XLSX.write(livro, { bookType: "xlsx", type: "array" });
  const conteudo = new Blob([bytes], { type: TIPO_XLSX });

  const janela = window as JanelaComPicker;

  if (typeof janela.showSaveFilePicker !== "function") {
    return baixar(conteudo, planilha.nomeArquivo);
  }

  try {
    const destino = await janela.showSaveFilePicker({
      suggestedName: planilha.nomeArquivo,
      types: [{ description: "Planilha do Excel", accept: { [TIPO_XLSX]: [".xlsx"] } }],
    });

    const fluxo = await destino.createWritable();
    await fluxo.write(conteudo);
    await fluxo.close();

    return "salvo";
  } catch (erro) {
    /* Fechar o diálogo sem escolher é desistir, não erro. */
    if (erro instanceof DOMException && erro.name === "AbortError") {
      throw erro;
    }

    return baixar(conteudo, planilha.nomeArquivo);
  }
}

/* Nome de arquivo com a data de hoje, no formato que o Windows aceita. */
export function nomeComData(prefixo: string): string {
  const agora = new Date();
  const data = [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, "0"),
    String(agora.getDate()).padStart(2, "0"),
  ].join("-");

  return `${prefixo}_${data}.xlsx`;
}
