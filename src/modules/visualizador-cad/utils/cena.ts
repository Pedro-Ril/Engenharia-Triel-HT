import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";

import { MODO_GESTOS_PADRAO, type ModoGestos } from "../constants/gestos";

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
const COR_COTA = 0xffd98a;

/* Medida com unidade, do jeito que se lê num desenho. */
function formatarMm(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm`;
}

export class CenaCad {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly grupoModelo = new THREE.Group();
  private readonly grupoArestas = new THREE.Group();
  private readonly grade: THREE.GridHelper;
  private readonly grupoCotas = new THREE.Group();
  private readonly viewHelper: ViewHelper;
  private readonly relogio = new THREE.Clock();
  private readonly observador: ResizeObserver;
  private gizmoVisivel = true;
  private modoGestos: ModoGestos = MODO_GESTOS_PADRAO;
  /* Gesto de "roll" (Alt + roda) em andamento. */
  private rolando: { x: number } | null = null;
  private ultimoCliqueRoda = 0;

  private raioModelo = 1;
  /* Com as cotas ligadas o conjunto é maior que a peça -- enquadrar
     pelo raio da peça deixaria as cotas fora da tela. */
  private raioComCotas = 1;
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

    /*
     * autoClear desligado porque o indicador de eixos desenha num
     * segundo render, no canto do mesmo canvas. Com autoClear ligado,
     * esse segundo render limpa a tela inteira antes -- a peça some e
     * sobra só o gizmo. Quem limpa agora é o loop, uma vez por quadro.
     */
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.aplicarModoGestos();

    this.configurarGestosSolidWorks();

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

    this.scene.add(this.grupoCotas);

    /*
     * Indicador de orientação no canto inferior direito, com as letras
     * X/Y/Z -- é onde todo CAD coloca. Vem pronto no three, inclusive
     * clicável: clicar num eixo vira a câmera para aquela vista.
     */
    this.viewHelper = new ViewHelper(this.camera, this.renderer.domElement);

    this.renderer.domElement.addEventListener("pointerup", (evento) => {
      if (!this.gizmoVisivel) return;
      this.viewHelper.handleClick(evento);
    });

    this.observador = new ResizeObserver(() => this.ajustarTamanho());
    this.observador.observe(container);
    this.ajustarTamanho();

    const desenhar = () => {
      this.animacao = requestAnimationFrame(desenhar);

      const intervalo = this.relogio.getDelta();
      if (this.viewHelper.animating) this.viewHelper.update(intervalo);

      this.controls.update();

      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);

      /* O gizmo desenha por cima, num canto do mesmo canvas. */
      if (this.gizmoVisivel) this.viewHelper.render(this.renderer);
    };
    desenhar();
  }

  private ajustarTamanho() {
    const largura = this.container.clientWidth || 1;
    const altura = this.container.clientHeight || 1;

    /*
     * O terceiro argumento (updateStyle) fica no padrão, true: sem
     * ele o canvas recebe o tamanho do BUFFER como tamanho CSS, que
     * em tela com escala acima de 100% (DPR 1,25 ou 1,5, comum no
     * Windows) sai maior que o container. A cena aparecia ampliada e
     * deslocada, a peça escorregava para fora da área visível e o
     * indicador de eixos, que se posiciona por offsetWidth, caía
     * depois da borda direita -- dava "tela preta".
     */
    this.renderer.setSize(largura, altura);
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
    this.limparGrupo(this.grupoCotas);
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

    this.montarCotas(caixa, tamanho);

    /* Agora que as cotas existem, mede o conjunto todo. */
    const caixaComCotas = new THREE.Box3()
      .setFromObject(this.grupoModelo)
      .union(new THREE.Box3().setFromObject(this.grupoCotas));
    this.raioComCotas = Math.max(
      caixaComCotas.getSize(new THREE.Vector3()).length() / 2,
      this.raioModelo
    );

    this.camera.near = this.raioModelo / 100;
    this.camera.far = this.raioComCotas * 100;
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

  /*
   * Cotas do envelope da peça, desenhadas ao lado dela: largura (X),
   * altura (Y) e profundidade (Z). São as mesmas medidas do rodapé,
   * só que presas ao desenho -- quem olha entende de cara qual número
   * é qual direção, sem precisar deduzir.
   *
   * É a cota do envelope, não de cada face: serve para "cabe na
   * máquina?", não para conferir desenho.
   */
  private montarCotas(caixa: THREE.Box3, tamanho: THREE.Vector3) {
    this.limparGrupo(this.grupoCotas);

    /* Afastamento das cotas: longe o bastante para o rótulo não
       encostar na peça nem em outra cota. */
    const folga = this.raioModelo * 0.22;
    const material = new THREE.LineBasicMaterial({ color: COR_COTA });

    const desenharCota = (
      inicio: THREE.Vector3,
      fim: THREE.Vector3,
      valor: number,
      eixo: "X" | "Y" | "Z"
    ) => {
      if (valor <= 0) return;

      const linha = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([inicio, fim]),
        material
      );
      this.grupoCotas.add(linha);

      /* Tracinhos nas pontas, como numa cota de desenho técnico. */
      const direcao = new THREE.Vector3().subVectors(fim, inicio).normalize();
      const perpendicular = new THREE.Vector3(direcao.y, direcao.z, direcao.x)
        .cross(direcao)
        .normalize()
        .multiplyScalar(folga * 0.25);

      for (const ponta of [inicio, fim]) {
        this.grupoCotas.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              ponta.clone().add(perpendicular),
              ponta.clone().sub(perpendicular),
            ]),
            material
          )
        );
      }

      const meio = new THREE.Vector3().addVectors(inicio, fim).multiplyScalar(0.5);
      this.grupoCotas.add(this.criarRotulo(`${eixo}  ${formatarMm(valor)}`, meio));
    };

    const { min, max } = caixa;

    /* Largura, embaixo e à frente. */
    desenharCota(
      new THREE.Vector3(min.x, min.y - folga, max.z + folga),
      new THREE.Vector3(max.x, min.y - folga, max.z + folga),
      tamanho.x,
      "X"
    );

    /* Altura, na lateral direita da frente. */
    desenharCota(
      new THREE.Vector3(max.x + folga, min.y, max.z + folga),
      new THREE.Vector3(max.x + folga, max.y, max.z + folga),
      tamanho.y,
      "Y"
    );

    /* Profundidade, embaixo e à direita. */
    desenharCota(
      new THREE.Vector3(max.x + folga, min.y - folga, min.z),
      new THREE.Vector3(max.x + folga, min.y - folga, max.z),
      tamanho.z,
      "Z"
    );
  }

  /*
   * Rótulo como sprite: sempre de frente para a câmera, gire-se a peça
   * como for. O texto vai numa textura de canvas -- é o jeito de ter
   * texto no three sem carregar fonte nem um segundo renderer de HTML.
   */
  private criarRotulo(texto: string, posicao: THREE.Vector3): THREE.Sprite {
    const escala = 4;
    const canvas = document.createElement("canvas");
    const contexto = canvas.getContext("2d")!;

    contexto.font = `bold ${16 * escala}px system-ui, sans-serif`;
    const largura = contexto.measureText(texto).width;

    canvas.width = largura + 20 * escala;
    canvas.height = 26 * escala;

    /* Medir zerou o contexto; configura de novo depois de dimensionar. */
    const ctx = canvas.getContext("2d")!;
    ctx.font = `bold ${16 * escala}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(16, 21, 31, 0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffd98a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, canvas.width / 2, canvas.height / 2);

    const textura = new THREE.CanvasTexture(canvas);
    textura.minFilter = THREE.LinearFilter;

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: textura, depthTest: false })
    );

    /* Tamanho proporcional à peça, para servir tanto a um parafuso
       quanto a um chassi inteiro. */
    const alturaMundo = this.raioModelo * 0.09;
    sprite.scale.set((alturaMundo * canvas.width) / canvas.height, alturaMundo, 1);
    sprite.position.copy(posicao);
    sprite.renderOrder = 999;

    return sprite;
  }

  /* Volta a peça inteira para dentro da tela, mantendo o ângulo atual. */
  enquadrar() {
    const direcao = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();

    if (direcao.lengthSq() === 0) direcao.set(1, 1, 1).normalize();

    this.controls.target.copy(this.centroModelo);
    this.camera.position
      .copy(this.centroModelo)
      .addScaledVector(direcao, this.distanciaDeEnquadramento());
    this.controls.update();
  }

  /* O quanto a câmera precisa recuar para caber o que está à mostra. */
  private distanciaDeEnquadramento(): number {
    const raio = this.grupoCotas.visible ? this.raioComCotas : this.raioModelo;
    return (raio / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.15;
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
    const distancia = this.distanciaDeEnquadramento();

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

  /*
   * Os gestos do SolidWorks que o OrbitControls não tem de fábrica.
   * Todos os listeners ficam presos o tempo todo e conferem o modo por
   * dentro -- é mais simples do que montar e desmontar a cada troca, e
   * no modo padrão eles saem na primeira linha.
   *
   * O que o SolidWorks faz, e aqui também:
   *   roda pressionada          gira
   *   Ctrl + roda pressionada   desloca
   *   Shift + roda pressionada  aproxima
   *   Alt + roda pressionada    gira no plano da tela (roll)
   *   duplo clique na roda      enquadra
   *   girar a roda              aproxima/afasta, na direção DELE:
   *                             girar para frente AFASTA
   *   botão esquerdo/direito    não mexem a câmera (lá são seleção e
   *                             menu de contexto)
   */
  private configurarGestosSolidWorks() {
    const tela = this.renderer.domElement;

    /*
     * Em fase de captura: o OrbitControls lê `mouseButtons` quando o
     * botão desce, então a escolha precisa estar feita antes dele.
     */
    tela.addEventListener(
      "pointerdown",
      (evento) => {
        if (this.modoGestos !== "solidworks" || evento.button !== 1) return;

        /* Sem isto o navegador entra no rolamento automático. */
        evento.preventDefault();

        const agora = performance.now();
        const ehDuploClique = agora - this.ultimoCliqueRoda < 400;
        this.ultimoCliqueRoda = agora;

        if (ehDuploClique) {
          this.enquadrar();
          return;
        }

        if (evento.altKey) {
          /* O roll é nosso: o OrbitControls sai de cena enquanto dura. */
          this.rolando = { x: evento.clientX };
          this.controls.enabled = false;
          return;
        }

        this.controls.mouseButtons.MIDDLE = evento.ctrlKey
          ? THREE.MOUSE.PAN
          : evento.shiftKey
            ? THREE.MOUSE.DOLLY
            : THREE.MOUSE.ROTATE;
      },
      true
    );

    window.addEventListener("pointermove", (evento) => {
      if (!this.rolando) return;

      const deslocamento = evento.clientX - this.rolando.x;
      this.rolando.x = evento.clientX;

      /* Gira o "para cima" da câmera em torno da linha de visão. */
      const linhaDeVisao = new THREE.Vector3()
        .subVectors(this.camera.position, this.controls.target)
        .normalize();

      this.camera.up.applyAxisAngle(linhaDeVisao, deslocamento * 0.01);
      this.camera.lookAt(this.controls.target);
    });

    window.addEventListener("pointerup", () => {
      if (!this.rolando) return;
      this.rolando = null;
      this.controls.enabled = true;
    });

    /*
     * Zoom da roda por conta própria (enableZoom fica desligado no modo
     * SolidWorks): é o único jeito de inverter a direção, que o
     * OrbitControls não oferece.
     */
    tela.addEventListener(
      "wheel",
      (evento) => {
        if (this.modoGestos !== "solidworks") return;

        evento.preventDefault();

        /* deltaY < 0 é girar para frente, que no SolidWorks AFASTA. */
        this.aproximar(evento.deltaY < 0 ? 1.1 : 1 / 1.1);
      },
      { passive: false }
    );
  }

  /* Aproxima ou afasta a câmera do alvo, com limite nos dois extremos. */
  private aproximar(fator: number) {
    const deslocamento = this.camera.position
      .clone()
      .sub(this.controls.target)
      .multiplyScalar(fator);

    const distancia = deslocamento.length();
    if (distancia < this.raioModelo * 0.05 || distancia > this.raioModelo * 60) return;

    this.camera.position.copy(this.controls.target).add(deslocamento);
  }

  /*
   * Padrão: esquerdo gira, meio aproxima, direito desloca (OrbitControls
   * de fábrica). SolidWorks: o esquerdo não mexe a câmera -- lá ele é
   * seleção, e mover a peça sem querer ao clicar é justamente o que
   * incomoda quem vem de lá.
   */
  private aplicarModoGestos() {
    if (this.modoGestos === "solidworks") {
      this.controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.ROTATE,
        /* No SolidWorks o direito abre menu; aqui ele só não mexe a
           câmera -- quem desloca é Ctrl + roda. */
        RIGHT: null,
      };
      /* O zoom da roda passa a ser nosso, para poder inverter. */
      this.controls.enableZoom = false;
      return;
    }

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.enableZoom = true;
  }

  definirModoGestos(modo: ModoGestos) {
    this.modoGestos = modo;
    this.aplicarModoGestos();
  }

  definirGizmo(visivel: boolean) {
    this.gizmoVisivel = visivel;
  }

  definirCotas(visivel: boolean) {
    this.grupoCotas.visible = visivel;
  }

  /* Gira sozinho, para deixar a peça em exibição. */
  definirGiroAutomatico(ligado: boolean) {
    this.controls.autoRotate = ligado;
    this.controls.autoRotateSpeed = 1.5;
  }

  capturarImagem(): string {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  destruir() {
    cancelAnimationFrame(this.animacao);
    this.observador.disconnect();
    this.controls.dispose();
    this.viewHelper.dispose();
    this.limpar();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
