/*
 * Na estrutura do 3DX, cada filho vem com o "kind" da ligação com o pai
 * (instancia.kind). Ligação "SynchroEBOMExt" quer dizer que o item NÃO
 * está na lista de materiais do pai: ele não faz parte da estrutura e
 * não deve aparecer no Roteiro de Fabricação -- nem ele, nem o que
 * estiver abaixo dele por essa ligação.
 *
 * Só aqui: a Consulta Última Revisão mostra a estrutura do 3DX como ela
 * é, inclusive esses itens.
 */
export const KIND_FORA_DA_LISTA_DE_MATERIAIS = "SynchroEBOMExt";

type NoComLigacao<T> = {
  physicalId?: string | null;
  instancia?: { kind?: string | null } | null;
  children?: T[];
};

export function estaForaDaListaDeMateriais(no: NoComLigacao<unknown>): boolean {
  return no.instancia?.kind === KIND_FORA_DA_LISTA_DE_MATERIAIS;
}

/* A mesma árvore, sem os filhos fora da lista de materiais (nem os netos deles). */
export function removerForaDaListaDeMateriais<T extends NoComLigacao<T>>(no: T): T {
  return {
    ...no,
    children: (no.children ?? [])
      .filter((filho) => !estaForaDaListaDeMateriais(filho))
      .map((filho) => removerForaDaListaDeMateriais(filho)),
  };
}

/*
 * Totais refeitos sobre a árvore já sem esses itens: os que a API manda
 * contam também os que saíram. Itens = itens distintos (pelo physicalId),
 * instâncias = posições na árvore abaixo da raiz.
 */
export function contarItensEInstancias<T extends NoComLigacao<T>>(
  raiz: T
): { totalItens: number; totalInstancias: number } {
  const itens = new Set<string>();
  let nos = 0;

  function visitar(no: T) {
    nos += 1;
    if (no.physicalId) itens.add(no.physicalId);
    for (const filho of no.children ?? []) visitar(filho);
  }

  visitar(raiz);

  return { totalItens: itens.size, totalInstancias: Math.max(0, nos - 1) };
}
