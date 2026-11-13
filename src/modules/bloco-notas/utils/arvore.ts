import type { NoArvore, PaginaResumo } from "../types/blocoNotas.types";

/* Monta a árvore a partir da lista plana (pai_id). Filha de pai que não veio na lista vira raiz. */
export function montarArvore(paginas: PaginaResumo[]): NoArvore[] {
  const nos = new Map<string, NoArvore>(paginas.map((pagina) => [pagina.id, { ...pagina, filhos: [] }]));
  const raizes: NoArvore[] = [];

  for (const no of nos.values()) {
    const pai = no.paiId ? nos.get(no.paiId) : undefined;
    if (pai) pai.filhos.push(no);
    else raizes.push(no);
  }

  const ordenar = (lista: NoArvore[]) => {
    lista.sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, "pt-BR"));
    lista.forEach((no) => ordenar(no.filhos));
  };
  ordenar(raizes);

  return raizes;
}

/* Caminho da raiz até a página (sem incluir ela). Para a trilha acima do título. */
export function ancestrais(paginas: PaginaResumo[], id: string): PaginaResumo[] {
  const porId = new Map(paginas.map((pagina) => [pagina.id, pagina]));
  const caminho: PaginaResumo[] = [];
  const vistos = new Set<string>();
  let atual = porId.get(id);

  while (atual?.paiId && !vistos.has(atual.paiId)) {
    vistos.add(atual.paiId);
    const pai = porId.get(atual.paiId);
    if (!pai) break;
    caminho.unshift(pai);
    atual = pai;
  }

  return caminho;
}

/* Ids da página e de todas as descendentes (não pode mover uma página para dentro delas). */
export function idsDaSubarvore(paginas: PaginaResumo[], id: string): Set<string> {
  const filhosPorPai = new Map<string, string[]>();
  for (const pagina of paginas) {
    if (!pagina.paiId) continue;
    filhosPorPai.set(pagina.paiId, [...(filhosPorPai.get(pagina.paiId) ?? []), pagina.id]);
  }

  const resultado = new Set<string>([id]);
  const fila = [id];
  while (fila.length > 0) {
    const atual = fila.shift() as string;
    for (const filho of filhosPorPai.get(atual) ?? []) {
      if (!resultado.has(filho)) {
        resultado.add(filho);
        fila.push(filho);
      }
    }
  }
  return resultado;
}

/* Lista "achatada" com a profundidade de cada página -- para o seletor de destino de "Mover para". */
export function achatarArvore(arvore: NoArvore[], profundidade = 0): { no: NoArvore; profundidade: number }[] {
  return arvore.flatMap((no) => [{ no, profundidade }, ...achatarArvore(no.filhos, profundidade + 1)]);
}

export function tituloOuPadrao(titulo: string): string {
  return titulo.trim() || "Sem título";
}
