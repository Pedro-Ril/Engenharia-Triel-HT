/*
 * "Escolher onde salvar" de verdade: no Edge/Chrome, a File System
 * Access API abre o diálogo nativo do Windows, e a pessoa escolhe pasta
 * e nome -- inclusive numa unidade de rede. Em navegador sem suporte,
 * cai no download comum.
 *
 * O destino é escolhido ANTES de gerar o arquivo, de propósito:
 * showSaveFilePicker só funciona enquanto o clique ainda conta como
 * "ativação transitória" (poucos segundos no Chrome). Gerar a planilha
 * primeiro -- uma ida ao servidor que cresce com o tamanho do lote --
 * consumia essa janela e o diálogo era recusado.
 *
 * A API não está nos tipos padrão do DOM, daí a declaração abaixo.
 */

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

export type ResultadoGravacao = "salvo" | "baixado";

export interface DestinoArquivo {
  gravar: (conteudo: Blob) => Promise<ResultadoGravacao>;
}

/*
 * Devolve null quando a pessoa fecha o diálogo sem escolher -- desistir
 * não é erro. Precisa ser a primeira coisa depois do clique.
 */
export async function escolherDestino(nomeSugerido: string): Promise<DestinoArquivo | null> {
  const janela = window as JanelaComPicker;

  if (typeof janela.showSaveFilePicker === "function") {
    try {
      const handle = await janela.showSaveFilePicker({
        suggestedName: nomeSugerido,
        types: [
          {
            description: "Planilha do Excel",
            accept: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            },
          },
        ],
      });

      return {
        gravar: async (conteudo: Blob) => {
          const writable = await handle.createWritable();
          await writable.write(conteudo);
          await writable.close();
          return "salvo";
        },
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
      throw error;
    }
  }

  return {
    gravar: async (conteudo: Blob) => {
      const url = URL.createObjectURL(conteudo);
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeSugerido;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return "baixado";
    },
  };
}
