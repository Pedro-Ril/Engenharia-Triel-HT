import type * as THREE from "three";

import { lerArquivoCad, obterOcct, type MalhaOcct } from "./carregar-occt";
import { extensaoDoArquivo, formatoDoArquivo } from "./formatos";

/*
 * Transforma o arquivo que a pessoa soltou na tela em algo que a cena
 * sabe desenhar. Cada família de formato tem um caminho:
 *
 *  - CAD exato (STEP/IGES/BREP): OpenCascade triangula e devolve malhas.
 *  - Malha pronta (STL/OBJ/...): o loader do three devolve um Object3D.
 *
 * Os loaders do three entram por import dinâmico: são vários, e não faz
 * sentido baixar o de glTF para quem só abre STL.
 */

export type ModeloCarregado =
  | { tipo: "occt"; malhas: MalhaOcct[] }
  | { tipo: "objeto"; objeto: THREE.Object3D };

function lerComoArrayBuffer(arquivo: File): Promise<ArrayBuffer> {
  return arquivo.arrayBuffer();
}

async function carregarMalha(arquivo: File, extensao: string): Promise<ModeloCarregado> {
  const buffer = await lerComoArrayBuffer(arquivo);

  if (extensao === ".stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const { Mesh, MeshPhongMaterial } = await import("three");
    const geometria = new STLLoader().parse(buffer);
    return { tipo: "objeto", objeto: new Mesh(geometria, new MeshPhongMaterial()) };
  }

  if (extensao === ".obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    const texto = new TextDecoder().decode(buffer);
    return { tipo: "objeto", objeto: new OBJLoader().parse(texto) };
  }

  if (extensao === ".ply") {
    const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
    const { Mesh, MeshPhongMaterial } = await import("three");
    const geometria = new PLYLoader().parse(buffer);
    return { tipo: "objeto", objeto: new Mesh(geometria, new MeshPhongMaterial()) };
  }

  if (extensao === ".3mf") {
    const { ThreeMFLoader } = await import("three/examples/jsm/loaders/3MFLoader.js");
    return { tipo: "objeto", objeto: new ThreeMFLoader().parse(buffer) };
  }

  if (extensao === ".gltf" || extensao === ".glb") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();

    const gltf = await new Promise<{ scene: THREE.Group }>((resolver, rejeitar) => {
      loader.parse(buffer, "", (resultado) => resolver(resultado), (erro) => rejeitar(erro));
    });

    return { tipo: "objeto", objeto: gltf.scene };
  }

  throw new Error(`Formato ${extensao} ainda não é lido aqui.`);
}

export async function carregarArquivo(arquivo: File): Promise<ModeloCarregado> {
  const formato = formatoDoArquivo(arquivo.name);

  if (!formato) {
    throw new Error("Formato de arquivo não reconhecido.");
  }

  if (formato.motor === "2d") {
    throw new Error("DXF é desenho 2D e abre no visualizador próprio.");
  }

  const extensao = extensaoDoArquivo(arquivo.name);

  if (formato.motor === "malha") {
    return carregarMalha(arquivo, extensao);
  }

  /* CAD exato: só aqui o WebAssembly pesado é baixado. */
  const occt = await obterOcct();
  const buffer = await lerComoArrayBuffer(arquivo);
  const resultado = lerArquivoCad(occt, extensao, new Uint8Array(buffer));

  if (!resultado.success || !resultado.meshes?.length) {
    throw new Error(
      "O arquivo foi lido, mas não gerou geometria. Pode estar vazio ou corrompido."
    );
  }

  return { tipo: "occt", malhas: resultado.meshes };
}
