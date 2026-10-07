/*
 * Os formatos que o visualizador abre, agrupados por quem sabe lê-los.
 *
 * Três motores diferentes, por necessidade:
 *  - "cad": STEP/IGES/BREP são geometria exata (B-rep), não malha. Para
 *    desenhar na tela é preciso triangular, e quem faz isso é o
 *    OpenCascade compilado para WebAssembly (occt-import-js). É o único
 *    pedaço que exige download pesado, por isso só carrega quando um
 *    arquivo desses aparece.
 *  - "malha": já vêm triangulados; os loaders que acompanham o three.js
 *    dão conta, sem nada a instalar.
 *  - "2d": DXF é desenho, não modelo. Vai para o dxf-viewer, o mesmo
 *    que o módulo do Lantek já usa.
 */

export type MotorVisualizacao = "cad" | "malha" | "2d";

export interface FormatoSuportado {
  extensao: string;
  motor: MotorVisualizacao;
  rotulo: string;
}

export const FORMATOS: FormatoSuportado[] = [
  /* Geometria exata de CAD -- precisam do OpenCascade. */
  { extensao: ".step", motor: "cad", rotulo: "STEP" },
  { extensao: ".stp", motor: "cad", rotulo: "STEP" },
  { extensao: ".iges", motor: "cad", rotulo: "IGES" },
  { extensao: ".igs", motor: "cad", rotulo: "IGES" },
  { extensao: ".brep", motor: "cad", rotulo: "BREP" },

  /* Malhas prontas -- loaders do próprio three.js. */
  { extensao: ".stl", motor: "malha", rotulo: "STL" },
  { extensao: ".obj", motor: "malha", rotulo: "OBJ" },
  { extensao: ".ply", motor: "malha", rotulo: "PLY" },
  { extensao: ".3mf", motor: "malha", rotulo: "3MF" },
  { extensao: ".gltf", motor: "malha", rotulo: "glTF" },
  { extensao: ".glb", motor: "malha", rotulo: "glTF" },

  /* Desenho 2D. */
  { extensao: ".dxf", motor: "2d", rotulo: "DXF" },
];

export function extensaoDoArquivo(nomeArquivo: string): string {
  const ponto = nomeArquivo.lastIndexOf(".");
  return ponto < 0 ? "" : nomeArquivo.slice(ponto).toLowerCase();
}

export function formatoDoArquivo(nomeArquivo: string): FormatoSuportado | null {
  const extensao = extensaoDoArquivo(nomeArquivo);
  return FORMATOS.find((formato) => formato.extensao === extensao) ?? null;
}

/* Para o atributo accept do input e para a mensagem de erro. */
export const EXTENSOES_ACEITAS = FORMATOS.map((formato) => formato.extensao).join(",");

export function rotulosPorMotor(motor: MotorVisualizacao): string[] {
  return [...new Set(FORMATOS.filter((f) => f.motor === motor).map((f) => f.rotulo))];
}
