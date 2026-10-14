/*
 * Tira a lista de códigos de uma planilha, no navegador mesmo -- o
 * arquivo não sobe para o servidor.
 *
 * Coluna: se a primeira linha tiver um cabeçalho com "cód"/"cod"
 * ("Código", "COD_ITEM", "Cod. Item"), é ela, sem o cabeçalho. Senão,
 * a primeira coluna inteira. O resultado vai para a caixa de códigos,
 * à vista: se entrar um cabeçalho como "Item" por engano, a pessoa vê
 * e apaga antes de conferir.
 *
 * O xlsx entra por import dinâmico: é pesado, e só quem importa paga.
 */

const CABECALHO_CODIGO = /c[óo]d/i;

export interface CodigosDaPlanilha {
  codigos: string[];
  coluna: string;
}

function nomeDaColuna(indice: number): string {
  let nome = "";
  let n = indice + 1;

  while (n > 0) {
    const resto = (n - 1) % 26;
    nome = String.fromCharCode(65 + resto) + nome;
    n = Math.floor((n - 1) / 26);
  }

  return nome;
}

export async function lerCodigosDaPlanilha(arquivo: File): Promise<CodigosDaPlanilha> {
  const XLSX = await import("xlsx");

  const livro = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
  const aba = livro.Sheets[livro.SheetNames[0]];

  if (!aba) {
    throw new Error("A planilha está vazia.");
  }

  /* raw:false traz o texto como aparece na célula ("015670" continua
     com zero se estiver formatado como texto). */
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(aba, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  if (linhas.length === 0) {
    throw new Error("A planilha está vazia.");
  }

  const primeira = linhas[0].map((celula) => String(celula ?? "").trim());
  const colunaCabecalho = primeira.findIndex((celula) => CABECALHO_CODIGO.test(celula));

  const coluna = colunaCabecalho >= 0 ? colunaCabecalho : 0;
  const dados = colunaCabecalho >= 0 ? linhas.slice(1) : linhas;

  const codigos = dados
    .map((linha) => String(linha[coluna] ?? "").trim())
    .filter(Boolean);

  return {
    codigos,
    coluna:
      colunaCabecalho >= 0
        ? `coluna "${primeira[colunaCabecalho]}" (${nomeDaColuna(coluna)})`
        : "coluna A",
  };
}
