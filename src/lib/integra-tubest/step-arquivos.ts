import "server-only";

import fs from "fs/promises";
import path from "path";

/*
 * Índice da pasta de STEP e a regra de "qual arquivo é a peça X".
 *
 * A pasta real (\\servidorgeral\Derivados\Triel-HT\STEP) não é tão
 * uniforme quanto parece, e a regra abaixo existe por causa disso:
 * - a extensão aparece nas duas caixas (.step e .STEP), daí a busca
 *   case-insensitive;
 * - centenas de arquivos carregam um sufixo entre parênteses vindo da
 *   exportação do SolidWorks -- "100238(Valor predeterminado).step",
 *   "(Valor predeterminado_Como usinado_)", "(1)", "(2)" -- então o
 *   código da peça é só o que vem ANTES do primeiro parêntese;
 * - por isso mesmo um código chega a ter 3 arquivos ("285209.step" e
 *   duas variantes). O arquivo exato ganha; sem ele, a variante é
 *   usada mas o item é marcado como duplicado, para a conferência
 *   olhar antes de exportar;
 * - de vez em quando a peça só tem .igs, na mesma pasta. Ele entra
 *   como reserva: havendo STEP, o STEP ganha sempre.
 */

export type FormatoArquivo = "step" | "igs";

/* Ordem de preferência: o primeiro que existir para o código ganha. */
const FORMATOS: { extensao: string; formato: FormatoArquivo }[] = [
  { extensao: ".step", formato: "step" },
  { extensao: ".igs", formato: "igs" },
];

/*
 * Cópia criada pelo Windows ao salvar um arquivo que já existia:
 * "285209(Valor predeterminado) (1).step", "... (2).step". Nunca é o
 * arquivo bom -- é sobra de quem exportou duas vezes -- então fica
 * fora do índice em vez de virar "mais de um arquivo" na conferência.
 */
const COPIA_WINDOWS = /\s\(\d+\)$/;

export interface ArquivoStepEncontrado {
  caminho: string;
  arquivo: string;
  /* Nome idêntico ao código (sem sufixo entre parênteses). */
  exato: boolean;
  formato: FormatoArquivo;
}

export type PastaOrigem = "principal" | "ciber";

export interface ResultadoValidacaoStep {
  codigo: string;
  /* Código do desenho -- é por ele que a peça da Ciber é encontrada. */
  codDesenho: string;
  /* Qual dos dois achou o arquivo, e em que pasta. */
  codigoUsado: string;
  origem: "codigo" | "desenho" | "";
  pasta: PastaOrigem | "";
  existe: boolean;
  duplicado: boolean;
  caminho: string;
  arquivo: string;
  caminhos: string[];
  /* Vazio quando não achou nada; "igs" é a exceção que vale sinalizar. */
  formato: FormatoArquivo | "";
}

/* "285209(Valor predeterminado) (1).step" -> "285209" */
export function extrairCodigoDoArquivo(nomeArquivo: string): string {
  const semExtensao = nomeArquivo.slice(0, nomeArquivo.length - path.extname(nomeArquivo).length);
  const semSufixo = semExtensao.split("(")[0];
  return semSufixo.trim();
}

function chaveIndice(valor: string): string {
  return valor.trim().toLowerCase();
}

export async function indexarPastaStep(
  pastaBase: string
): Promise<Map<string, ArquivoStepEncontrado[]>> {
  const indice = new Map<string, ArquivoStepEncontrado[]>();

  /* A pasta é plana hoje, mas percorrer subpastas sai de graça e evita
     que o módulo pare de achar arquivos no dia em que alguém criar uma. */
  async function percorrer(pasta: string) {
    let entradas;

    try {
      entradas = await fs.readdir(pasta, { withFileTypes: true });
    } catch {
      return;
    }

    const subPastas: string[] = [];

    for (const entrada of entradas) {
      const caminhoCompleto = path.join(pasta, entrada.name);

      if (entrada.isDirectory()) {
        subPastas.push(caminhoCompleto);
        continue;
      }

      if (!entrada.isFile()) continue;

      const extensao = path.extname(entrada.name).toLowerCase();
      const formato = FORMATOS.find((item) => item.extensao === extensao)?.formato;
      if (!formato) continue;

      const semExtensao = entrada.name.slice(
        0,
        entrada.name.length - path.extname(entrada.name).length
      );

      if (COPIA_WINDOWS.test(semExtensao)) continue;

      const codigo = extrairCodigoDoArquivo(entrada.name);
      if (!codigo) continue;

      const encontrado: ArquivoStepEncontrado = {
        caminho: caminhoCompleto,
        arquivo: entrada.name,
        exato: chaveIndice(semExtensao) === chaveIndice(codigo),
        formato,
      };

      const lista = indice.get(chaveIndice(codigo));
      if (lista) {
        lista.push(encontrado);
      } else {
        indice.set(chaveIndice(codigo), [encontrado]);
      }
    }

    await Promise.all(subPastas.map((sub) => percorrer(sub)));
  }

  await percorrer(pastaBase);

  return indice;
}

interface AchadoNoIndice {
  existe: boolean;
  duplicado: boolean;
  caminho: string;
  arquivo: string;
  caminhos: string[];
  formato: FormatoArquivo | "";
}

export function validarCodigoNoIndice(
  indice: Map<string, ArquivoStepEncontrado[]>,
  codigo: string
): AchadoNoIndice {
  const chave = chaveIndice(codigo);
  const encontrados = chave ? (indice.get(chave) ?? []) : [];

  /* O arquivo com o nome exato do código vem primeiro; os sufixados
     ficam atrás, em ordem, para a lista do modal ser previsível. */
  const ordenados = [...encontrados].sort((a, b) => {
    if (a.exato !== b.exato) return a.exato ? -1 : 1;
    return a.arquivo.localeCompare(b.arquivo, "pt-BR", { numeric: true });
  });

  /*
   * Duas peneiras, nesta ordem:
   *
   * 1. formato -- havendo STEP, o .igs nem entra na conversa; ele é
   *    reserva para a peça que só tem ele;
   * 2. nome exato -- existir "175640.step" resolve o caso, porque as
   *    variantes "(Valor predeterminado...)" ao lado são exportações
   *    antigas do SolidWorks.
   *
   * Só sobra ambiguidade quando, dentro do formato escolhido, NENHUM
   * arquivo tem o nome exato do código. Aí a conferência precisa
   * decidir, e o item é marcado como duplicado.
   */
  const steps = ordenados.filter((item) => item.formato === "step");
  const doFormato = steps.length > 0 ? steps : ordenados;

  const exatos = doFormato.filter((item) => item.exato);
  const candidatos = exatos.length > 0 ? exatos : doFormato;

  const principal = candidatos[0];

  return {
    existe: candidatos.length > 0,
    duplicado: candidatos.length > 1,
    caminho: principal?.caminho ?? "",
    arquivo: principal?.arquivo ?? "",
    caminhos: candidatos.map((item) => item.caminho),
    formato: principal?.formato ?? "",
  };
}

export interface FonteIndice {
  pasta: PastaOrigem;
  indice: Map<string, ArquivoStepEncontrado[]>;
}

/*
 * Ordem de tentativa para achar o arquivo de uma peça:
 *
 *   1. código do item na pasta principal   (o caso comum)
 *   2. código do desenho na pasta principal
 *   3. código do item na pasta da Ciber
 *   4. código do desenho na pasta da Ciber (o caso que motivou isto)
 *
 * Peça da Ciber tem numeração própria: o arquivo existe com o número do
 * DESENHO, na pasta da Ciber -- procurar pelo código do item ali não
 * acha nada. A primeira tentativa que encontrar algo vence; dentro de
 * cada pasta valem as regras de formato, nome exato e duplicidade.
 */
export function resolverArquivoDaPeca(
  fontes: FonteIndice[],
  codigo: string,
  codDesenho: string
): ResultadoValidacaoStep {
  const tentativas = (
    [
      { chave: codigo, origem: "codigo" },
      { chave: codDesenho, origem: "desenho" },
    ] as const
  ).filter((tentativa) => Boolean(tentativa.chave.trim()));

  for (const fonte of fontes) {
    for (const tentativa of tentativas) {
      const achado = validarCodigoNoIndice(fonte.indice, tentativa.chave);

      if (achado.existe) {
        return {
          codigo,
          codDesenho,
          codigoUsado: tentativa.chave,
          origem: tentativa.origem,
          pasta: fonte.pasta,
          ...achado,
        };
      }
    }
  }

  return {
    codigo,
    codDesenho,
    codigoUsado: "",
    origem: "",
    pasta: "",
    existe: false,
    duplicado: false,
    caminho: "",
    arquivo: "",
    caminhos: [],
    formato: "",
  };
}
