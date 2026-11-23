/*
 * Conferência do padrão de visualização do "Abrir com" (3DPlay e 3D Navigate) a partir do conteúdo dos 4 arquivos
 * estáticos do 3DSpace -- a mesma regra de plugins-3dx/triel-visualizacao/aplicar_padrao_visualizacao.py (--conferir).
 * Se mudar o script, mude aqui também.
 *
 * Sem acesso a banco nem rede: recebe o texto do arquivo e devolve a situação (dá para testar isolado).
 *  - aplicado: o padrão Triel está lá;
 *  - perdido: o arquivo é o original da Dassault (um hotfix sobrescreveu) -- reaplicar o script resolve;
 *  - mudou: nem o padrão nem o trecho original foram achados -- a Dassault mudou o arquivo; analisar no dev-plm
 *    antes de reaplicar (o script se recusa a gravar nesse caso).
 */

import type { SituacaoArquivoVisualizacao3dx } from "@/modules/plugins-3dx/types/plugins3dx.types";

export type SituacaoArquivoVisualizacao = SituacaoArquivoVisualizacao3dx;

export interface ArquivoPadraoVisualizacao {
  /* caminho a partir de <contexto>/webapps/ */
  caminho: string;
  descricao: string;
}

export const ARQUIVOS_VISUALIZACAO: ArquivoPadraoVisualizacao[] = [
  { caminho: "PADUtils/assets/PADSharedSettings.json", descricao: "Qualidade alta no 3D Navigate" },
  {
    caminho: "ENOCockpitV2/assets/json/ENO3DViewerInfraOptions.json",
    descricao: "Qualidade alta e vista padrão no 3D Navigate",
  },
  { caminho: "3DPlayAppV2/assets/json/X3DPLAW_AP_DefaultExperience.json", descricao: "Vista padrão no 3DPlay" },
  {
    caminho: "3DPlayExperienceModule/3DPlayExperienceModule.js",
    descricao: "3DPlay: qualidade alta, todas as arestas, sem perspectiva e geometria completa",
  },
];

const PADRAO_VISTA: Record<string, unknown> = {
  linesState: false,
  projectionMode: 1,
  visuShadingMode: "ShadingEdges",
  visuShadingFaceMode: "Shaded",
  visuShadingEdgeMode: "WithEdges",
};

const VIEW_PANEL = ["layout_options", "frmWindow_opts", "viewerOptions", "viewPanelConfig"];

/* [original da Dassault, padrão Triel] -- iguais ao JS_TROCAS do script */
const JS_TROCAS: [string, string][] = [
  [
    'name:prefName,defaultValue:"index",type:"list"',
    'name:prefName,defaultValue:"base",type:"list"',
  ],
  [
    'e.setVisuShadingMode("Shading"),e.setVisuShadingEdgeMode("NoEdges"),e.setMaterialMode("FILE"===this.currentProvider)',
    'e.setVisuShadingMode("ShadingEdges"),e.setVisuShadingEdgeMode("WithEdges"),e.setMaterialMode("FILE"===this.currentProvider)',
  ],
  [
    'e.setVisuShadingEdgeMode("WithEdges"),e.setMaterialMode("FILE"===this.currentProvider),this.dontrecordVisuChange=!1,logger.warn(',
    'e.setVisuShadingEdgeMode("WithEdges"),e.setMaterialMode("FILE"===this.currentProvider),this.dontrecordVisuChange=!1,' +
      '"ENOPAD"===this.currentProvider&&this.configureController&&this.configureController({needCGR:!0,needMaterial:!1,needMeshInRam:!1}),logger.warn(',
  ],
  [
    'this.dontrecordVisuChange=!0,e.setVisuShadingMode("ShadingEdges")',
    'this.dontrecordVisuChange=!0,e.currentViewpoint&&e.currentViewpoint.setProjectionType(1),e.setVisuShadingMode("ShadingEdges")',
  ],
];

export interface ResultadoArquivoVisualizacao {
  situacao: SituacaoArquivoVisualizacao;
  mensagem: string | null;
}

class Mudou extends Error {}

function contar(texto: string, trecho: string): number {
  let n = 0;
  for (let i = texto.indexOf(trecho); i >= 0; i = texto.indexOf(trecho, i + trecho.length)) n++;
  return n;
}

function caminho(objeto: unknown, chaves: string[]): Record<string, unknown> {
  let atual = objeto;
  for (const chave of chaves) {
    if (typeof atual !== "object" || atual === null || !(chave in atual)) {
      throw new Mudou(`chave '${chaves.join("/")}' não encontrada`);
    }
    atual = (atual as Record<string, unknown>)[chave];
  }
  if (typeof atual !== "object" || atual === null) throw new Mudou(`'${chaves.join("/")}' não é um objeto`);
  return atual as Record<string, unknown>;
}

function vistaPadrao(valor: unknown): boolean {
  if (typeof valor !== "object" || valor === null) return false;
  const v = valor as Record<string, unknown>;
  return (
    Object.keys(v).length === Object.keys(PADRAO_VISTA).length &&
    Object.entries(PADRAO_VISTA).every(([k, esperado]) => v[k] === esperado)
  );
}

function padShared(texto: string): boolean {
  const rx = /"enopad3dviewer_CGRorTHB"\s*:\s*\{[^{}]*?"value"\s*:\s*"([A-Z]+)"/g;
  const achados = [...texto.matchAll(rx)];
  if (achados.length !== 1) throw new Mudou(`bloco enopad3dviewer_CGRorTHB encontrado ${achados.length} vez(es)`);
  return achados[0][1] === "HIGH";
}

function eno3dInfra(texto: string): boolean {
  const o: unknown = JSON.parse(texto);
  const qualidade = caminho(o, ["eno3dviewerinfra", "run_options", "enopad3dviewer_CGRorTHB"]).value === "HIGH";
  const vista = vistaPadrao(caminho(o, ["eno3dviewerinfra", ...VIEW_PANEL]).defaultSettings);
  return qualidade && vista;
}

function x3dplay(texto: string): boolean {
  const o: unknown = JSON.parse(texto);
  return ["enopad3dviewer", "eno3dviewerinfra"].every((raiz) =>
    vistaPadrao(caminho(o, [raiz, ...VIEW_PANEL]).defaultSettings)
  );
}

/*
 * JS: cada troca está aplicada (padrão 1 vez), perdida (original 1 vez) ou o arquivo mudou. As trocas são
 * encadeadas como no script (a 3ª procura um trecho que só existe depois da 2ª), então simula a aplicação em ordem.
 */
function js3dplay(texto: string): boolean {
  let todas = true;
  let simulado = texto;
  JS_TROCAS.forEach(([original, padrao], i) => {
    if (contar(simulado, padrao) === 1) return;
    todas = false;
    if (contar(simulado, original) !== 1) throw new Mudou(`trecho ${i + 1} do padrão não encontrado`);
    simulado = simulado.replace(original, padrao);
  });
  return todas;
}

const AVALIADORES: Record<string, (texto: string) => boolean> = {
  "PADUtils/assets/PADSharedSettings.json": padShared,
  "ENOCockpitV2/assets/json/ENO3DViewerInfraOptions.json": eno3dInfra,
  "3DPlayAppV2/assets/json/X3DPLAW_AP_DefaultExperience.json": x3dplay,
  "3DPlayExperienceModule/3DPlayExperienceModule.js": js3dplay,
};

export function avaliarArquivoVisualizacao(caminhoArquivo: string, texto: string | null): ResultadoArquivoVisualizacao {
  if (texto === null) return { situacao: "ausente", mensagem: "Arquivo não encontrado no nó" };
  const avaliar = AVALIADORES[caminhoArquivo];
  if (!avaliar) return { situacao: "mudou", mensagem: "Arquivo desconhecido" };
  try {
    return avaliar(texto)
      ? { situacao: "aplicado", mensagem: null }
      : { situacao: "perdido", mensagem: "Voltou ao original da Dassault: reaplicar o script" };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return { situacao: "mudou", mensagem: `A Dassault mudou o arquivo (${motivo}): analisar no dev-plm` };
  }
}

/* Pior situação entre os arquivos: um "mudou" pede análise; um "perdido"/"ausente" pede reaplicar. */
export function situacaoGeralVisualizacao(situacoes: SituacaoArquivoVisualizacao[]): "aplicado" | "perdido" | "mudou" {
  if (situacoes.some((s) => s === "mudou")) return "mudou";
  if (situacoes.some((s) => s !== "aplicado")) return "perdido";
  return "aplicado";
}
