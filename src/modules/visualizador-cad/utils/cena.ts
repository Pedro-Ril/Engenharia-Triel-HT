import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { MalhaOcct } from "./carregar-occt";

/*
 * A cena three.js do visualizador, isolada do React.
 *
 * Fica fora do componente de propósito: three.js guarda estado próprio
 * (GPU, animação, listeners) que não combina com re-render. O React
 * manda comandos ("enquadrar", "vista de topo") e lê informação; quem
 * cuida do ciclo de vida é esta classe.
 */

export interface InfoModelo {
  pecas: number;
  triangulos: number;
  /* Dimensões do envelope, na unidade do arquivo (mm para STEP). */
  largura: number;
  altura: number;
  profundidade: number;
}

export type VistaPadrao = "iso" | "frente" | "tras" | "topo" | "base" | "direita" | "esquerda";

/* Cores fixas: o visualizador é uma superfície escura própria, como o
   overlay do terminal -- não acompanha o tema claro/escuro do portal. */
const COR_FUNDO = 0x10151f;
const COR_PECA = 0xb0b8c4;
const COR_ARESTA = 0x2b3340;

export class CenaCad {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly grupoModelo = new THREE.Group();
  private readonly grupoArestas = new THREE.Group();
  private readonly grade: THREE.GridHelper;
  private readonly eixos: THREE.AxesHelper;
  private readonly observador: ResizeObserver;

  private raioModelo = 1;
  private centroModelo = new THREE.Vector3();
  private animacao = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COR_FUNDO);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.camera.position.set(1, 1, 1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    /*
     * Os gestos: arrastar gira, scroll aproxima, botão do meio (ou
     * ctrl/shift + arrastar) desloca. É o esquema que todo mundo já
     * conhece de CAD, então não inventamos nada aqui.
     */
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    /* Luz presa à câmera: a peça nunca fica num ângulo sem iluminação. */
    const luzCamera = new THREE.DirectionalLight(0xffffff, 2.2);
    this.camera.add(luzCamera);
    this.scene.add(this.camera);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const luzOposta = new THREE.DirectionalLight(0xffffff, 0.6);
    luzOposta.position.set(-1, -0.6, -1);
    this.scene.add(luzOposta);

    this.scene.add(this.grupoModelo);
    this.scene.add(this.grupoArestas);

    this.grade = new THREE.GridHelper(1, 20, 0x3a4458, 0x232a38);
    this.grade.visible = false;
    this.scene.add(this.grade);

    this.eixos = new THREE.AxesHelper(1);
    this.eixos.visible = false;
    this.scene.add(this.eixos);

    this.observador = new ResizeObserver(() => this.ajustarTamanho());
    this.observador.observe(container);
    this.ajustarTamanho();

    const desenhar = () => {
      this.animacao = requestAnimationFrame(desenhar);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    desenhar();
  }

  private ajustarTamanho() {
    const largura = this.container.clientWidth || 1;
    const altura = this.container.clientHeight || 1;

    this.renderer.setSize(largura, altura, false);
    this.camera.aspect = largura / altura;
    this.camera.updateProjectionMatrix();
  }

  private limparGrupo(grupo: THREE.Group) {
    for (const filho of [...grupo.children]) {
      grupo.remove(filho);

      filho.traverse((objeto) => {
        const malha = objeto as THREE.Mesh | THREE.LineSegments;
        malha.geometry?.dispose();

        const material = (malha as THREE.Mesh).material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
    }
  }

  limpar() {
    this.limparGrupo(this.grupoModelo);
    this.limparGrupo(this.grupoArestas);
  }

  /* Monta as malhas que o OpenCascade devolveu (STEP/IGES/BREP). */
  carregarMalhasOcct(malhas: MalhaOcct[]): InfoModelo {
    this.limpar();

    for (const malha of malhas) {
      const geometria = new THREE.BufferGeometry();

      geometria.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(malha.attributes.position.array, 3)
      );

      if (malha.attributes.normal) {
        geometria.setAttribute(
          "normal",
          new THREE.Float32BufferAttribute(malha.attributes.normal.array, 3)
        );
      } else {
        geometria.computeVertexNormals();
      }

      geometria.setIndex(malha.index.array);

      const cor = malha.color
        ? new THREE.Color(malha.color[0], malha.color[1], malha.color[2])
        : new THREE.Color(COR_PECA);

      const material = new THREE.MeshPhongMaterial({
        color: cor,
        side: THREE.DoubleSide,
        flatShading: false,
      });

      const objeto = new THREE.Mesh(geometria, material);
      objeto.name = malha.name ?? "";
      this.grupoModelo.add(objeto);
    }

    return this.finalizarCarga();
  }

  /* Monta o que veio de um loader do three (STL, OBJ, glTF...). */
  carregarObjeto(objeto: THREE.Object3D): InfoModelo {
    this.limpar();

    objeto.traverse((filho) => {
      const malha = filho as THREE.Mesh;
      if (!malha.isMesh) return;

      /* Muitos STL/OBJ vêm sem material ou sem normais utilizáveis. */
      if (!malha.geometry.getAttribute("normal")) malha.geometry.computeVertexNormals();

      malha.material = new THREE.MeshPhongMaterial({
        color: COR_PECA,
        side: THREE.DoubleSide,
      });
    });

    this.grupoModelo.add(objeto);

    return this.finalizarCarga();
  }

  /*
   * Depois de montar: mede, cria as arestas, dimensiona grade/eixos e
   * enquadra. A medição vem antes de tudo porque o resto depende dela.
   */
  private finalizarCarga(): InfoModelo {
    const caixa = new THREE.Box3().setFromObject(this.grupoModelo);
    const tamanho = caixa.getSize(new THREE.Vector3());
    caixa.getCenter(this.centroModelo);

    this.raioModelo = Math.max(tamanho.length() / 2, 0.001);

    let triangulos = 0;
    let pecas = 0;

    this.grupoModelo.traverse((filho) => {
      const malha = filho as THREE.Mesh;
      if (!malha.isMesh) return;

      pecas += 1;

      const indice = malha.geometry.getIndex();
      const posicao = malha.geometry.getAttribute("position");
      triangulos += indice ? indice.count / 3 : (posicao?.count ?? 0) / 3;

      /*
       * Arestas realçadas: sem elas uma peça usinada vira uma mancha
       * cinza. 30 graus corta a malha de superfície curva e deixa só
       * quina de verdade.
       */
      const arestas = new THREE.EdgesGeometry(malha.geometry, 30);
      const linhas = new THREE.LineSegments(
        arestas,
        new THREE.LineBasicMaterial({ color: COR_ARESTA })
      );
      linhas.applyMatrix4(malha.matrixWorld);
      this.grupoArestas.add(linhas);
    });

    /* Grade no plano de baixo da peça, com passo proporcional. */
    const lado = Math.max(tamanho.x, tamanho.z, 0.001) * 3;
    this.grade.scale.setScalar(lado);
    this.grade.position.set(this.centroModelo.x, caixa.min.y, this.centroModelo.z);

    this.eixos.scale.setScalar(this.raioModelo * 0.6);
    this.eixos.position.copy(caixa.min);

    this.camera.near = this.raioModelo / 100;
    this.camera.far = this.raioModelo * 100;
    this.camera.updateProjectionMatrix();

    this.enquadrar();

    return {
      pecas,
      triangulos: Math.round(triangulos),
      largura: tamanho.x,
      altura: tamanho.y,
      profundidade: tamanho.z,
    };
  }

  /* Volta a peça inteira para dentro da tela, mantendo o ângulo atual. */
  enquadrar() {
    const direcao = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();

    if (direcao.lengthSq() === 0) direcao.set(1, 1, 1).normalize();

    const distancia =
      (this.raioModelo / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.15;

    this.controls.target.copy(this.centroModelo);
    this.camera.position.copy(this.centroModelo).addScaledVector(direcao, distancia);
    this.controls.update();
  }

  verDe(vista: VistaPadrao) {
    const direcoes: Record<VistaPadrao, [number, number, number]> = {
      iso: [1, 0.8, 1],
      frente: [0, 0, 1],
      tras: [0, 0, -1],
      topo: [0, 1, 0],
      base: [0, -1, 0],
      direita: [1, 0, 0],
      esquerda: [-1, 0, 0],
    };

    const [x, y, z] = direcoes[vista];
    const distancia =
      (this.raioModelo / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.15;

    this.controls.target.copy(this.centroModelo);
    this.camera.position
      .copy(this.centroModelo)
      .add(new THREE.Vector3(x, y, z).normalize().multiplyScalar(distancia));

    /* De topo ou de base, "para cima" não pode ser o próprio eixo Y. */
    this.camera.up.set(0, vista === "topo" || vista === "base" ? 0 : 1, vista === "topo" ? -1 : vista === "base" ? 1 : 0);
    this.camera.lookAt(this.centroModelo);
    this.controls.update();
  }

  definirArestas(visivel: boolean) {
    this.grupoArestas.visible = visivel;
  }

  definirMalha(visivel: boolean) {
    this.grupoModelo.visible = visivel;
  }

  definirWireframe(ligado: boolean) {
    this.grupoModelo.traverse((filho) => {
      const malha = filho as THREE.Mesh;
      if (!malha.isMesh) return;

      const material = malha.material as THREE.MeshPhongMaterial;
      material.wireframe = ligado;
    });
  }

  definirGrade(visivel: boolean) {
    this.grade.visible = visivel;
  }

  definirEixos(visivel: boolean) {
    this.eixos.visible = visivel;
  }

  /* Gira sozinho, para deixar a peça em exibição. */
  definirGiroAutomatico(ligado: boolean) {
    this.controls.autoRotate = ligado;
    this.controls.autoRotateSpeed = 1.5;
  }

  capturarImagem(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  destruir() {
    cancelAnimationFrame(this.animacao);
    this.observador.disconnect();
    this.controls.dispose();
    this.limpar();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
