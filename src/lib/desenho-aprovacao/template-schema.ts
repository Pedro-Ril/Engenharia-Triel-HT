import { ValidationError } from "@/lib/auth/errors";

/*
 * Formaliza o formato de `eng_templates_aprovacao_versoes.template_json`
 * (NVARCHAR(MAX), só validado no banco por ISJSON — a validação de forma
 * de verdade é feita aqui). `campo`/`campoMedida` referenciam a `chave` de
 * `eng_templates_aprovacao_campos_dinamicos` (catálogo global) por
 * convenção, não por FK — o banco não tem como impor isso num JSON solto.
 */

export type OrientacaoPagina = "horizontal" | "vertical";

export interface PaginaConfig {
  formato: string;
  orientacao: OrientacaoPagina;
  larguraMm: number;
  alturaMm: number;
  unidade: "mm";
  margemSeguraMm: number;
  corFundo: string;
}

export interface EditorConfig {
  gradeVisivel: boolean;
  tamanhoGradeMm: number;
  alinharNaGrade: boolean;
  reguasVisiveis: boolean;
  guiasVisiveis: boolean;
  zoomInicial: number;
}

/*
 * Geometria data-bound: uma dimensão (largura/altura) pode ser um número
 * fixo em mm (comportamento de sempre) ou derivada de um campo do
 * catálogo global, com uma fórmula linear configurável:
 * mm = valorDoCampo × fatorMm + deslocamentoMm.
 */
export type ValorGeometria =
  | number
  | {
      tipo: "campo";
      campo: string;
      fatorMm: number;
      deslocamentoMm: number;
    };

export type BordaAncoragem = "esquerda" | "direita" | "topo" | "base" | "centro";

/*
 * Posição data-bound: um eixo (x/y) pode ser um número fixo em mm
 * (absoluto, na página) ou ancorado numa borda de outro elemento já
 * resolvido — é o que faz um elemento se reacomodar sozinho quando o
 * vizinho cresce (ancoragem em cadeia).
 */
export type ValorPosicao =
  | number
  | {
      tipo: "ancorado";
      elementoId: string;
      borda: BordaAncoragem;
      deslocamentoMm: number;
    };

export function isValorDinamico(
  valor: ValorGeometria | ValorPosicao
): valor is Exclude<ValorGeometria | ValorPosicao, number> {
  return typeof valor === "object" && valor !== null;
}

interface ElementoBase {
  id: string;
  nome?: string;
  ordem: number;
  visivel: boolean;
  bloqueado: boolean;
  opacidade: number;
  rotacaoGraus: number;
}

export interface PreenchimentoElemento {
  cor: string;
  opacidade?: number;
}

export interface BordaElemento {
  cor: string;
  espessuraMm: number;
  estilo?: "solido" | "tracejado" | "pontilhado";
}

export interface ElementoRetangulo extends ElementoBase {
  tipo: "retangulo";
  xMm: ValorPosicao;
  yMm: ValorPosicao;
  larguraMm: ValorGeometria;
  alturaMm: ValorGeometria;
  raioBordaMm: number;
  preenchimento: PreenchimentoElemento | null;
  borda: BordaElemento | null;
}

export type OrigemCota =
  | { modo: "limites_elemento"; elementoId: string }
  | { modo: "manual"; inicioMm: ValorGeometria; fimMm: ValorGeometria };

export interface EstiloFonteCota {
  familiaFonte: string;
  tamanhoFonteMm: number;
  cor: string;
}

export interface ElementoCota extends ElementoBase {
  tipo: "cota";
  orientacao: OrientacaoPagina;
  origem: OrigemCota;
  campoMedida?: string;
  obrigatorio?: boolean;
  deslocamentoMm: number;
  extensaoMm: number;
  tamanhoSetaMm: number;
  espessuraMm: number;
  corLinha: string;
  corTexto: string;
  fonte: EstiloFonteCota;
  unidade: string;
  casasDecimais: number;
  prefixo?: string;
  sufixo?: string;
  textoAcimaDaLinha: boolean;
}

export interface EstiloTexto {
  familiaFonte: string;
  tamanhoFonteMm: number;
  pesoFonte: "normal" | "bold";
  cor: string;
  alinhamentoHorizontal: "esquerda" | "centro" | "direita";
  alinhamentoVertical: "topo" | "meio" | "base";
  alturaLinha?: number;
  espacamentoLetrasMm?: number;
  italico?: boolean;
  sublinhado?: boolean;
}

export interface ElementoTextoDinamico extends ElementoBase {
  tipo: "texto_dinamico";
  xMm: ValorPosicao;
  yMm: ValorPosicao;
  campo: string;
  obrigatorio?: boolean;
  valorPadrao?: string;
  prefixo?: string;
  sufixo?: string;
  formato?: string;
  unidade?: string;
  ocultarQuandoVazio: boolean;
  estiloTexto: EstiloTexto;
}

/*
 * Elemento novo (não existia no schema encontrado): referencia uma arte
 * importada (SVG) guardada em `eng_templates_aprovacao_assets`, em vez de
 * embutir o conteúdo como string aqui.
 */
export interface ElementoImagemSvg extends ElementoBase {
  tipo: "imagem_svg";
  xMm: ValorPosicao;
  yMm: ValorPosicao;
  larguraMm: ValorGeometria;
  alturaMm: ValorGeometria;
  assetId: string;
  ajuste: "conter" | "preencher";
}

export type TemplateElemento =
  | ElementoRetangulo
  | ElementoCota
  | ElementoTextoDinamico
  | ElementoImagemSvg;

export interface TemplateJson {
  schemaVersion: 1;
  pagina: PaginaConfig;
  editor?: EditorConfig;
  metadata?: Record<string, unknown>;
  elementos: TemplateElemento[];
}

/* =========================================================
   VALIDAÇÃO DE FORMA (chamada antes de gravar em template_json)
   ========================================================= */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertValorGeometria(value: unknown, caminho: string): void {
  if (typeof value === "number") return;

  if (
    isRecord(value) &&
    value.tipo === "campo" &&
    typeof value.campo === "string" &&
    value.campo.length > 0 &&
    typeof value.fatorMm === "number" &&
    typeof value.deslocamentoMm === "number"
  ) {
    return;
  }

  throw new ValidationError(
    `${caminho} deve ser um número em mm ou { tipo: "campo", campo, fatorMm, deslocamentoMm }.`
  );
}

function assertValorPosicao(value: unknown, caminho: string): void {
  if (typeof value === "number") return;

  if (
    isRecord(value) &&
    value.tipo === "ancorado" &&
    typeof value.elementoId === "string" &&
    value.elementoId.length > 0 &&
    typeof value.borda === "string" &&
    ["esquerda", "direita", "topo", "base", "centro"].includes(value.borda) &&
    typeof value.deslocamentoMm === "number"
  ) {
    return;
  }

  throw new ValidationError(
    `${caminho} deve ser um número em mm ou { tipo: "ancorado", elementoId, borda, deslocamentoMm }.`
  );
}

function assertElementoBase(value: Record<string, unknown>, caminho: string): void {
  if (typeof value.id !== "string" || !value.id) {
    throw new ValidationError(`${caminho}.id é obrigatório.`);
  }

  if (typeof value.ordem !== "number") {
    throw new ValidationError(`${caminho}.ordem deve ser numérico.`);
  }

  if (typeof value.visivel !== "boolean" || typeof value.bloqueado !== "boolean") {
    throw new ValidationError(`${caminho}.visivel e ${caminho}.bloqueado devem ser booleanos.`);
  }

  if (typeof value.opacidade !== "number" || value.opacidade < 0 || value.opacidade > 1) {
    throw new ValidationError(`${caminho}.opacidade deve estar entre 0 e 1.`);
  }

  if (typeof value.rotacaoGraus !== "number") {
    throw new ValidationError(`${caminho}.rotacaoGraus deve ser numérico.`);
  }
}

function assertElemento(value: unknown, caminho: string): asserts value is TemplateElemento {
  if (!isRecord(value)) {
    throw new ValidationError(`${caminho} deve ser um objeto.`);
  }

  assertElementoBase(value, caminho);

  switch (value.tipo) {
    case "retangulo": {
      assertValorPosicao(value.xMm, `${caminho}.xMm`);
      assertValorPosicao(value.yMm, `${caminho}.yMm`);
      assertValorGeometria(value.larguraMm, `${caminho}.larguraMm`);
      assertValorGeometria(value.alturaMm, `${caminho}.alturaMm`);
      return;
    }

    case "cota": {
      if (value.orientacao !== "horizontal" && value.orientacao !== "vertical") {
        throw new ValidationError(`${caminho}.orientacao deve ser "horizontal" ou "vertical".`);
      }

      const origem = value.origem;

      if (!isRecord(origem)) {
        throw new ValidationError(`${caminho}.origem é obrigatório.`);
      }

      if (origem.modo === "limites_elemento") {
        if (typeof origem.elementoId !== "string" || !origem.elementoId) {
          throw new ValidationError(`${caminho}.origem.elementoId é obrigatório.`);
        }
      } else if (origem.modo === "manual") {
        assertValorGeometria(origem.inicioMm, `${caminho}.origem.inicioMm`);
        assertValorGeometria(origem.fimMm, `${caminho}.origem.fimMm`);
      } else {
        throw new ValidationError(
          `${caminho}.origem.modo deve ser "limites_elemento" ou "manual".`
        );
      }

      return;
    }

    case "texto_dinamico": {
      assertValorPosicao(value.xMm, `${caminho}.xMm`);
      assertValorPosicao(value.yMm, `${caminho}.yMm`);

      if (typeof value.campo !== "string" || !value.campo) {
        throw new ValidationError(`${caminho}.campo é obrigatório.`);
      }

      if (!isRecord(value.estiloTexto)) {
        throw new ValidationError(`${caminho}.estiloTexto é obrigatório.`);
      }

      return;
    }

    case "imagem_svg": {
      assertValorPosicao(value.xMm, `${caminho}.xMm`);
      assertValorPosicao(value.yMm, `${caminho}.yMm`);
      assertValorGeometria(value.larguraMm, `${caminho}.larguraMm`);
      assertValorGeometria(value.alturaMm, `${caminho}.alturaMm`);

      if (typeof value.assetId !== "string" || !value.assetId) {
        throw new ValidationError(`${caminho}.assetId é obrigatório.`);
      }

      if (value.ajuste !== "conter" && value.ajuste !== "preencher") {
        throw new ValidationError(`${caminho}.ajuste deve ser "conter" ou "preencher".`);
      }

      return;
    }

    default:
      throw new ValidationError(
        `${caminho}.tipo deve ser "retangulo", "cota", "texto_dinamico" ou "imagem_svg".`
      );
  }
}

/*
 * Valida a forma de um `template_json` antes de gravar (o CHECK ISJSON do
 * banco só garante que é JSON sintaticamente válido, não que tem a forma
 * certa). Lança ValidationError com uma mensagem específica do primeiro
 * problema encontrado — não acumula uma lista de erros de propósito, pra
 * manter simples.
 */
export function validarTemplateJson(value: unknown): TemplateJson {
  if (!isRecord(value)) {
    throw new ValidationError("O template deve ser um objeto JSON.");
  }

  if (value.schemaVersion !== 1) {
    throw new ValidationError('O campo "schemaVersion" deve ser 1.');
  }

  const pagina = value.pagina;

  if (!isRecord(pagina)) {
    throw new ValidationError('O campo "pagina" é obrigatório.');
  }

  if (typeof pagina.larguraMm !== "number" || pagina.larguraMm <= 0) {
    throw new ValidationError("pagina.larguraMm deve ser um número maior que zero.");
  }

  if (typeof pagina.alturaMm !== "number" || pagina.alturaMm <= 0) {
    throw new ValidationError("pagina.alturaMm deve ser um número maior que zero.");
  }

  if (pagina.orientacao !== "horizontal" && pagina.orientacao !== "vertical") {
    throw new ValidationError('pagina.orientacao deve ser "horizontal" ou "vertical".');
  }

  if (!Array.isArray(value.elementos)) {
    throw new ValidationError('O campo "elementos" deve ser uma lista.');
  }

  const idsVistos = new Set<string>();

  value.elementos.forEach((elemento, indice) => {
    assertElemento(elemento, `elementos[${indice}]`);

    if (idsVistos.has(elemento.id)) {
      throw new ValidationError(`elementos[${indice}].id "${elemento.id}" está duplicado.`);
    }

    idsVistos.add(elemento.id);
  });

  return value as unknown as TemplateJson;
}
