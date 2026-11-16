/*
 * Em qual app o botão 3D abre. No Terminal de Fábrica é escolhido por
 * aparelho da TV Corporativa (Administração → Terminal de Fábrica →
 * Visualização); no Roteiro de Fabricação e no terminal fora da TV vale
 * o padrão. Puro (sem banco): a página do terminal usa no navegador e a
 * rota da grade usa no servidor. Testado em visualizacao-3d.test.ts.
 */

export type Visualizacao3D = "3d-navigate" | "3dplay" | "product-explorer";

export const VISUALIZACAO_3D_PADRAO: Visualizacao3D = "3d-navigate";

/* Parâmetro que a TV acrescenta na URL da página do terminal. */
export const PARAMETRO_VISUALIZACAO_3D = "visualizacao3d";

export const OPCOES_VISUALIZACAO_3D: { valor: Visualizacao3D; label: string; descricao: string }[] = [
  { valor: "3d-navigate", label: "3D Navigate", descricao: "Abre o modelo no 3D Navigate (padrão)." },
  { valor: "3dplay", label: "3D Play", descricao: "Abre o modelo no 3DPlay." },
  {
    valor: "product-explorer",
    label: "Product Explorer",
    descricao: "Abre no Product Explorer, com a árvore do produto ao lado do 3D Navigate.",
  },
];

export function ehVisualizacao3D(valor: unknown): valor is Visualizacao3D {
  return OPCOES_VISUALIZACAO_3D.some((opcao) => opcao.valor === valor);
}

/* Lê o parâmetro da URL; qualquer outra coisa (ou nada) é o padrão. */
export function lerVisualizacao3D(valor: string | null | undefined): Visualizacao3D {
  return ehVisualizacao3D(valor) ? valor : VISUALIZACAO_3D_PADRAO;
}

/*
 * URL de página web da grade com a escolha do aparelho: só nas que
 * apontam para o Terminal de Fábrica; as outras páginas não mudam.
 * URL que não dá para interpretar volta como veio.
 */
export function aplicarVisualizacaoNaUrl(url: string, visualizacao: Visualizacao3D): string {
  try {
    const endereco = new URL(url);
    if (!endereco.pathname.replace(/\/+$/, "").endsWith("/terminal-fabrica")) return url;
    endereco.searchParams.set(PARAMETRO_VISUALIZACAO_3D, visualizacao);
    return endereco.toString();
  } catch {
    return url;
  }
}
