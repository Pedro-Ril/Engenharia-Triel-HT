import {
  isValorDinamico,
  type BordaAncoragem,
  type ElementoCota,
  type TemplateElemento,
  type ValorGeometria,
  type ValorPosicao,
} from "@/lib/desenho-aprovacao/template-schema";

/*
 * Motor de resolução de layout paramétrico — TypeScript puro/isomórfico
 * (sem "server-only", sem `fs`), pra rodar tanto no servidor (geração real)
 * quanto no navegador (prévia instantânea do editor de templates, Fase 8,
 * sem round-trip de rede a cada digitação/arraste).
 *
 * Resolve `ValorGeometria`/`ValorPosicao` (número fixo ou dependente de
 * campo/elemento âncora) em coordenadas absolutas de página, em mm, pra
 * cada elemento — respeitando dependências entre elementos (um elemento
 * ancorado só pode ser resolvido depois do elemento em que se ancora).
 */

export interface BoundsResolvidos {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function resolveGeometria(
  valor: ValorGeometria,
  valoresCampos: Record<string, unknown>
): number {
  if (typeof valor === "number") return valor;

  const bruto = valoresCampos[valor.campo];
  const numero = typeof bruto === "number" ? bruto : Number(bruto);

  if (!Number.isFinite(numero)) {
    throw new Error(
      `O campo "${valor.campo}" não tem um valor numérico válido para resolver a geometria.`
    );
  }

  return numero * valor.fatorMm + valor.deslocamentoMm;
}

function resolveBordaCoordenada(
  bounds: BoundsResolvidos,
  borda: BordaAncoragem,
  eixo: "x" | "y"
): number {
  if (eixo === "x") {
    if (borda === "esquerda") return bounds.left;
    if (borda === "direita") return bounds.right;
    if (borda === "centro") return (bounds.left + bounds.right) / 2;

    throw new Error(`A borda "${borda}" não é válida para ancoragem no eixo horizontal.`);
  }

  if (borda === "topo") return bounds.top;
  if (borda === "base") return bounds.bottom;
  if (borda === "centro") return (bounds.top + bounds.bottom) / 2;

  throw new Error(`A borda "${borda}" não é válida para ancoragem no eixo vertical.`);
}

function resolvePosicao(
  valor: ValorPosicao,
  eixo: "x" | "y",
  resolvidos: Map<string, BoundsResolvidos>,
  elementoId: string
): number {
  if (typeof valor === "number") return valor;

  const bounds = resolvidos.get(valor.elementoId);

  if (!bounds) {
    throw new Error(
      `O elemento "${elementoId}" está ancorado em "${valor.elementoId}", que ainda não foi resolvido.`
    );
  }

  return resolveBordaCoordenada(bounds, valor.borda, eixo) + valor.deslocamentoMm;
}

function obterDependencias(elemento: TemplateElemento): string[] {
  if (elemento.tipo === "cota") {
    return elemento.origem.modo === "limites_elemento" ? [elemento.origem.elementoId] : [];
  }

  const dependencias: string[] = [];

  if (isValorDinamico(elemento.xMm)) dependencias.push(elemento.xMm.elementoId);
  if (isValorDinamico(elemento.yMm)) dependencias.push(elemento.yMm.elementoId);

  return dependencias;
}

/*
 * Ordena os elementos por dependência (DFS + 3 estados) — um elemento
 * ancorado ou uma cota com origem em limites_elemento só entra na ordem
 * depois do elemento do qual depende. Lança um erro claro identificando o
 * ciclo em vez de travar num loop infinito.
 */
function ordenarTopologicamente(elementos: TemplateElemento[]): TemplateElemento[] {
  const porId = new Map(elementos.map((elemento) => [elemento.id, elemento]));
  const dependenciasPorId = new Map(
    elementos.map((elemento) => [elemento.id, obterDependencias(elemento)])
  );

  const estado = new Map<string, "visitando" | "concluido">();
  const ordem: TemplateElemento[] = [];

  function visitar(id: string, caminho: string[]): void {
    if (estado.get(id) === "concluido") return;

    if (estado.get(id) === "visitando") {
      throw new Error(
        `Ciclo de ancoragem detectado entre elementos: ${[...caminho, id].join(" -> ")}.`
      );
    }

    const elemento = porId.get(id);

    if (!elemento) {
      throw new Error(`Elemento "${id}" referenciado como âncora não existe no template.`);
    }

    estado.set(id, "visitando");

    for (const dependenciaId of dependenciasPorId.get(id) ?? []) {
      if (!porId.has(dependenciaId)) {
        throw new Error(
          `O elemento "${id}" está ancorado num elemento inexistente "${dependenciaId}".`
        );
      }

      visitar(dependenciaId, [...caminho, id]);
    }

    estado.set(id, "concluido");
    ordem.push(elemento);
  }

  for (const elemento of elementos) {
    visitar(elemento.id, []);
  }

  return ordem;
}

function resolverCota(
  elemento: ElementoCota,
  valoresCampos: Record<string, unknown>,
  resolvidos: Map<string, BoundsResolvidos>
): BoundsResolvidos {
  let inicio: number;
  let fim: number;
  let referenciado: BoundsResolvidos | null = null;

  if (elemento.origem.modo === "limites_elemento") {
    const bounds = resolvidos.get(elemento.origem.elementoId);

    if (!bounds) {
      throw new Error(
        `A cota "${elemento.id}" referencia o elemento "${elemento.origem.elementoId}", que ainda não foi resolvido.`
      );
    }

    referenciado = bounds;

    if (elemento.orientacao === "horizontal") {
      inicio = bounds.left;
      fim = bounds.right;
    } else {
      inicio = bounds.top;
      fim = bounds.bottom;
    }
  } else {
    inicio = resolveGeometria(elemento.origem.inicioMm, valoresCampos);
    fim = resolveGeometria(elemento.origem.fimMm, valoresCampos);
  }

  /*
   * A "caixa" de uma cota é sobretudo informativa aqui (pra permitir, em
   * teoria, um elemento se ancorar nela) — a linha de cota de verdade,
   * com seta/texto, é desenhada pelo renderizador (Fase 7) a partir do
   * início/fim resolvidos, não a partir deste bounds. Convenção adotada:
   * a linha fica no lado "depois" do elemento referenciado (abaixo se
   * horizontal, à direita se vertical) deslocada por `deslocamentoMm`.
   */
  if (elemento.orientacao === "horizontal") {
    const linhaY = (referenciado?.bottom ?? 0) + elemento.deslocamentoMm;

    return {
      left: Math.min(inicio, fim),
      right: Math.max(inicio, fim),
      top: linhaY,
      bottom: linhaY,
      width: Math.abs(fim - inicio),
      height: 0,
    };
  }

  const linhaX = (referenciado?.right ?? 0) + elemento.deslocamentoMm;

  return {
    top: Math.min(inicio, fim),
    bottom: Math.max(inicio, fim),
    left: linhaX,
    right: linhaX,
    width: 0,
    height: Math.abs(fim - inicio),
  };
}

function resolverElemento(
  elemento: TemplateElemento,
  valoresCampos: Record<string, unknown>,
  resolvidos: Map<string, BoundsResolvidos>
): BoundsResolvidos {
  switch (elemento.tipo) {
    case "retangulo":
    case "imagem_svg": {
      const width = resolveGeometria(elemento.larguraMm, valoresCampos);
      const height = resolveGeometria(elemento.alturaMm, valoresCampos);
      const left = resolvePosicao(elemento.xMm, "x", resolvidos, elemento.id);
      const top = resolvePosicao(elemento.yMm, "y", resolvidos, elemento.id);

      return { left, top, right: left + width, bottom: top + height, width, height };
    }

    case "texto_dinamico": {
      const left = resolvePosicao(elemento.xMm, "x", resolvidos, elemento.id);
      const top = resolvePosicao(elemento.yMm, "y", resolvidos, elemento.id);

      /*
       * Texto não tem largura/altura fixas no schema — o tamanho real só
       * é conhecido depois de medir o texto renderizado, fora do escopo
       * deste resolvedor. Tratado como um ponto (0×0) pra fins de
       * ancoragem; não é um bom alvo de ancoragem por outro elemento.
       */
      return { left, top, right: left, bottom: top, width: 0, height: 0 };
    }

    case "cota":
      return resolverCota(elemento, valoresCampos, resolvidos);
  }
}

export function resolverLayout(
  elementos: TemplateElemento[],
  valoresCampos: Record<string, unknown>
): Map<string, BoundsResolvidos> {
  const ordenados = ordenarTopologicamente(elementos);
  const resolvidos = new Map<string, BoundsResolvidos>();

  for (const elemento of ordenados) {
    resolvidos.set(elemento.id, resolverElemento(elemento, valoresCampos, resolvidos));
  }

  return resolvidos;
}
