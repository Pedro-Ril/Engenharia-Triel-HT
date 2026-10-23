/*
 * Regras do grupo veicProd (veículos novos) transcritas do schema oficial
 * da NF-e 4.00 -- leiauteNFe_v4.00.xsd e tiposBasico_v4.00.xsd. A
 * definição é idêntica no PL_009 (2017) e no PL_010 v1.30 (2025, o da
 * reforma tributária). É contra esse schema que a SEFAZ valida a nota:
 * qualquer campo fora destas regras faz a nota ser rejeitada por falha
 * de schema.
 *
 * Mantida à mão de propósito: são 24 campos que não mudam há anos, e
 * trazer um validador de XSD inteiro para o navegador só por eles não se
 * paga. Se um pacote novo da SEFAZ mudar o veicProd, é aqui que se ajusta.
 */

/* Tipo TString do schema: começa e termina com caractere visível
   (! a ÿ), espaços só no meio, nada acima de U+00FF. */
const TSTRING = /^(?:[!-ÿ][ -ÿ]*[!-ÿ]|[!-ÿ])$/;

export interface RegraCampoSchema {
  tag: string;
  rotulo: string;
  /* Como a regra aparece para o usuário. */
  descricao: string;
  tstring?: boolean;
  tamanho?: number;
  minimo?: number;
  maximo?: number;
  padrao?: RegExp;
  valores?: string[];
}

export const NAMESPACE_NFE = "http://www.portalfiscal.inf.br/nfe";

/* Na ordem do xs:sequence -- a SEFAZ exige essa ordem. Todos obrigatórios, uma vez cada. */
export const REGRAS_VEICPROD: RegraCampoSchema[] = [
  { tag: "tpOp", rotulo: "Tipo de operação", descricao: "Um destes: 0, 1, 2, 3", valores: ["0", "1", "2", "3"] },
  { tag: "chassi", rotulo: "Chassi", descricao: "Exatamente 17 caracteres, só A-Z e 0-9", tamanho: 17, padrao: /^[A-Z0-9]+$/ },
  { tag: "cCor", rotulo: "Código da cor", descricao: "Texto de 1 a 4 caracteres", tstring: true, minimo: 1, maximo: 4 },
  { tag: "xCor", rotulo: "Cor", descricao: "Texto de 1 a 40 caracteres", tstring: true, minimo: 1, maximo: 40 },
  { tag: "pot", rotulo: "Potência (cv)", descricao: "Texto de 1 a 4 caracteres", tstring: true, minimo: 1, maximo: 4 },
  { tag: "cilin", rotulo: "Cilindradas", descricao: "Texto de 1 a 4 caracteres", tstring: true, minimo: 1, maximo: 4 },
  { tag: "pesoL", rotulo: "Peso líquido", descricao: "Texto de 1 a 9 caracteres", tstring: true, minimo: 1, maximo: 9 },
  { tag: "pesoB", rotulo: "Peso bruto", descricao: "Texto de 1 a 9 caracteres", tstring: true, minimo: 1, maximo: 9 },
  { tag: "nSerie", rotulo: "Número de série", descricao: "Texto de 1 a 9 caracteres", tstring: true, minimo: 1, maximo: 9 },
  { tag: "tpComb", rotulo: "Combustível", descricao: "Texto de 1 a 2 caracteres", tstring: true, minimo: 1, maximo: 2 },
  { tag: "nMotor", rotulo: "Número do motor", descricao: "Texto de 1 a 21 caracteres", tstring: true, minimo: 1, maximo: 21 },
  { tag: "CMT", rotulo: "Capacidade máx. de tração", descricao: "Texto de 1 a 9 caracteres", tstring: true, minimo: 1, maximo: 9 },
  { tag: "dist", rotulo: "Distância entre eixos", descricao: "Texto de 1 a 4 caracteres", tstring: true, minimo: 1, maximo: 4 },
  { tag: "anoMod", rotulo: "Ano modelo", descricao: "Exatamente 4 dígitos", padrao: /^[0-9]{4}$/ },
  { tag: "anoFab", rotulo: "Ano fabricação", descricao: "Exatamente 4 dígitos", padrao: /^[0-9]{4}$/ },
  { tag: "tpPint", rotulo: "Tipo de pintura", descricao: "Exatamente 1 caractere", tstring: true, tamanho: 1 },
  { tag: "tpVeic", rotulo: "Tipo de veículo", descricao: "1 ou 2 dígitos", padrao: /^[0-9]{1,2}$/ },
  { tag: "espVeic", rotulo: "Espécie", descricao: "Exatamente 1 dígito", padrao: /^[0-9]{1}$/ },
  { tag: "VIN", rotulo: "Condição do VIN", descricao: "R ou N", tstring: true, tamanho: 1, valores: ["R", "N"] },
  { tag: "condVeic", rotulo: "Condição do veículo", descricao: "Um destes: 1, 2, 3", valores: ["1", "2", "3"] },
  { tag: "cMod", rotulo: "Código marca/modelo", descricao: "1 a 6 dígitos", padrao: /^[0-9]{1,6}$/ },
  { tag: "cCorDENATRAN", rotulo: "Cor DENATRAN", descricao: "1 ou 2 dígitos", minimo: 1, maximo: 2, padrao: /^[0-9]{1,2}$/ },
  { tag: "lota", rotulo: "Lotação", descricao: "1 a 3 dígitos", minimo: 1, maximo: 3, padrao: /^[0-9]{1,3}$/ },
  { tag: "tpRest", rotulo: "Restrição", descricao: "Um destes: 0, 1, 2, 3, 4, 9", valores: ["0", "1", "2", "3", "4", "9"] },
];

/* Grupos que o schema põe na mesma escolha (xs:choice) do veicProd: só um por produto. */
export const GRUPOS_EXCLUSIVOS_COM_VEICPROD = ["med", "arma", "comb", "nRECOPI"];

/*
 * Confere um valor contra a regra, na ordem em que o validador de schema
 * olha. Devolve o motivo da recusa, ou null se passa. O tamanho é contado
 * em caracteres (não em unidades UTF-16), como no XSD.
 */
export function motivoRecusa(regra: RegraCampoSchema, valor: string): string | null {
  const tamanho = [...valor].length;

  if (regra.tamanho !== undefined && tamanho !== regra.tamanho) {
    return `deve ter exatamente ${regra.tamanho} caractere${regra.tamanho === 1 ? "" : "s"} (tem ${tamanho})`;
  }

  if (regra.minimo !== undefined && tamanho < regra.minimo) {
    return `deve ter no mínimo ${regra.minimo} caractere${regra.minimo === 1 ? "" : "s"} (tem ${tamanho})`;
  }

  if (regra.maximo !== undefined && tamanho > regra.maximo) {
    return `deve ter no máximo ${regra.maximo} caracteres (tem ${tamanho})`;
  }

  if (regra.valores && !regra.valores.includes(valor)) {
    return `só aceita ${regra.valores.join(", ")}`;
  }

  if (regra.padrao && !regra.padrao.test(valor)) {
    return `fora do formato aceito — regra: ${regra.descricao}`;
  }

  if (regra.tstring && !TSTRING.test(valor)) {
    return "não pode começar nem terminar com espaço, nem ter caractere de controle ou fora do padrão Latin-1";
  }

  return null;
}
