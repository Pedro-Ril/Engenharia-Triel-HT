/*
 * "Este código tem arquivo?" -- a regra do validacoes.py, aplicação 1:
 *
 *   (?<![A-Z0-9])CODIGO(?:_\d+)?(?![A-Z0-9])     (sem diferenciar caixa)
 *
 * ou seja, o código aparece no nome do arquivo como palavra inteira,
 * podendo vir seguido de "_N". Casa "290215.pdf", "290215_2.pdf",
 * "290215(Valor predeterminado).step", "008037 - CH DOBRADA..."; não
 * casa "1290215.pdf" nem "290215A.pdf".
 *
 * O Python rodava a regex para cada código contra cada arquivo. Na
 * pasta de PDF são ~264 mil arquivos, então aqui o nome de cada
 * arquivo é quebrado uma vez em "palavras" (sequências de A-Z/0-9) e a
 * busca vira consulta num conjunto. É a mesma regra: para um código só
 * de letras e números, casar a regex é exatamente ser uma dessas
 * palavras inteiras (o "_N" opcional já começa num separador). Código
 * com outro caractere ("01-107-001") cai na regex original.
 *
 * Diferença deliberada em relação ao Python: o zero à esquerda do NOME
 * DO ARQUIVO não conta, quando código e palavra são só números. Na
 * pasta de PDF, 413 códigos só existem no formato antigo com zeros
 * ("0015670_00000.PDF" é o PDF do 15670); pela regra estrita eles
 * apareceriam como faltando sem estar. O código digitado vale como
 * está. Conferido contra a função original do Python em 147 códigos
 * difíceis sobre os 264 mil PDFs reais: 144 iguais, e as 3 diferenças
 * são justamente esse caso. Para voltar à regra estrita, basta
 * TOLERAR_ZERO_A_ESQUERDA = false.
 *
 * Sem "server-only" de propósito: é lógica pura, testada isolada.
 */

export const TOLERAR_ZERO_A_ESQUERDA = true;

const SO_DIGITOS = /^\d+$/;
const SO_ALFANUMERICO = /^[A-Z0-9]+$/;
const PALAVRA = /[A-Z0-9]+/g;

function semZeroAEsquerda(valor: string): string {
  return valor.replace(/^0+(?=\d)/, "");
}

export interface IndiceNomes {
  palavras: Set<string>;
  /* As palavras só numéricas, sem os zeros à esquerda. */
  palavrasSemZero: Set<string>;
  /* Nomes completos (sem extensão, em maiúsculas), para a regex. */
  nomes: string[];
}

export function criarIndiceNomes(): IndiceNomes {
  return { palavras: new Set(), palavrasSemZero: new Set(), nomes: [] };
}

export function adicionarNomeAoIndice(indice: IndiceNomes, nomeSemExtensao: string): void {
  const nome = nomeSemExtensao.toUpperCase();
  indice.nomes.push(nome);

  for (const palavra of nome.match(PALAVRA) ?? []) {
    indice.palavras.add(palavra);

    if (SO_DIGITOS.test(palavra)) {
      indice.palavrasSemZero.add(semZeroAEsquerda(palavra));
    }
  }
}

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function codigoTemArquivo(indice: IndiceNomes, codigoBruto: string): boolean {
  const codigo = codigoBruto.trim().toUpperCase();
  if (!codigo) return false;

  if (SO_ALFANUMERICO.test(codigo)) {
    if (indice.palavras.has(codigo)) return true;

    /*
     * Só o zero do ARQUIVO é ignorado; o código digitado vale como
     * está. Tirar dos dois lados fazia "04125" casar com "JP-4125.pdf",
     * documento de outra série -- o caso real é só o inverso: "15670"
     * achar o antigo "0015670_00000.PDF".
     */
    return (
      TOLERAR_ZERO_A_ESQUERDA &&
      SO_DIGITOS.test(codigo) &&
      indice.palavrasSemZero.has(codigo)
    );
  }

  /* Código com hífen, ponto, espaço...: a regex do Python, igual. */
  const padrao = new RegExp(`(?<![A-Z0-9])${escaparRegex(codigo)}(?:_\\d+)?(?![A-Z0-9])`);

  return indice.nomes.some((nome) => padrao.test(nome));
}

/*
 * Lista colada pelo usuário: um por linha, separados por vírgula ou
 * ponto e vírgula, ou misturado -- mesmo split do Python. Sem
 * repetidos, na ordem em que apareceram.
 */
export function separarCodigos(texto: string): string[] {
  const vistos = new Set<string>();
  const codigos: string[] = [];

  for (const parte of texto.split(/[,\n;\r\t]+/)) {
    const codigo = parte.trim();
    const chave = codigo.toUpperCase();

    if (!codigo || vistos.has(chave)) continue;

    vistos.add(chave);
    codigos.push(codigo);
  }

  return codigos;
}
