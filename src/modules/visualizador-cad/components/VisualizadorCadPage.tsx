"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Axis3d,
  Box,
  Ruler,
  Camera,
  Grid3x3,
  Loader2,
  Maximize2,
  RotateCw,
  Scan,
  Square,
  Upload,
  X,
} from "lucide-react";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

import {
  dicaDeGestos,
  MODO_GESTOS_PADRAO,
  type ModoGestos,
} from "../constants/gestos";
import { carregarArquivo } from "../utils/carregar-modelo";
import { CenaCad, type InfoModelo, type VistaPadrao } from "../utils/cena";
import { EXTENSOES_ACEITAS, formatoDoArquivo, rotulosPorMotor } from "../utils/formatos";
import { VisualizadorDxf } from "./VisualizadorDxf";
import styles from "./VisualizadorCad.module.css";

const VISTAS: { valor: VistaPadrao; rotulo: string }[] = [
  { valor: "iso", rotulo: "Iso" },
  { valor: "frente", rotulo: "Frente" },
  { valor: "tras", rotulo: "Trás" },
  { valor: "topo", rotulo: "Topo" },
  { valor: "base", rotulo: "Base" },
  { valor: "direita", rotulo: "Direita" },
  { valor: "esquerda", rotulo: "Esquerda" },
];

function formatarMedida(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatarTamanhoArquivo(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface VisualizadorCadPageProps {
  /* Preferência do usuário, lida no servidor (ver page.tsx). */
  modoGestos?: ModoGestos;
}

export function VisualizadorCadPage({
  modoGestos = MODO_GESTOS_PADRAO,
}: VisualizadorCadPageProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<CenaCad | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arquivoDxf, setArquivoDxf] = useState<File | null>(null);
  const [info, setInfo] = useState<InfoModelo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const [arestas, setArestas] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  /* Grade, indicador de eixos e cotas vêm ligados: é o estado em que a
     peça diz mais sobre si mesma logo que abre. */
  const [grade, setGrade] = useState(true);
  const [eixos, setEixos] = useState(true);
  const [cotas, setCotas] = useState(true);
  const [girando, setGirando] = useState(false);

  /* A cena nasce junto com a área de desenho e morre com ela. */
  useEffect(() => {
    if (!areaRef.current || arquivoDxf) return;

    const cena = new CenaCad(areaRef.current);
    cena.definirModoGestos(modoGestos);
    cenaRef.current = cena;

    return () => {
      cena.destruir();
      cenaRef.current = null;
    };
  }, [arquivoDxf, modoGestos]);

  const abrirArquivo = useCallback(async (novoArquivo: File) => {
    const formato = formatoDoArquivo(novoArquivo.name);

    if (!formato) {
      setErro(
        `"${novoArquivo.name}" não é um formato que eu abra. Aceito ${EXTENSOES_ACEITAS.replace(/\./g, "").toUpperCase().replace(/,/g, ", ")}.`
      );
      return;
    }

    setErro(null);
    setInfo(null);

    /* DXF é 2D: troca o visualizador inteiro, não a cena. */
    if (formato.motor === "2d") {
      setArquivo(novoArquivo);
      setArquivoDxf(novoArquivo);
      return;
    }

    setArquivoDxf(null);
    setArquivo(novoArquivo);
    setCarregando(true);
    setEtapa(
      formato.motor === "cad"
        ? "Preparando o leitor de CAD..."
        : "Lendo o arquivo..."
    );

    try {
      const modelo = await carregarArquivo(novoArquivo);

      setEtapa("Montando a peça...");

      /* Dá um quadro ao navegador para pintar o texto antes de travar na GPU. */
      await new Promise((resolver) => setTimeout(resolver, 0));

      const cena = cenaRef.current;
      if (!cena) return;

      const resultado =
        modelo.tipo === "occt"
          ? cena.carregarMalhasOcct(modelo.malhas)
          : cena.carregarObjeto(modelo.objeto);

      cena.definirArestas(arestas);
      cena.definirWireframe(wireframe);
      cena.definirGrade(grade);
      cena.definirGizmo(eixos);
      cena.definirCotas(cotas);

      setInfo(resultado);
    } catch (erroCarga) {
      setErro(
        erroCarga instanceof Error
          ? erroCarga.message
          : "Não foi possível abrir este arquivo."
      );
      setArquivo(null);
    } finally {
      setCarregando(false);
      setEtapa("");
    }
  }, [arestas, wireframe, grade, eixos, cotas]);

  /* Soltar o arquivo em qualquer lugar da página. */
  useEffect(() => {
    function aoArrastar(evento: DragEvent) {
      evento.preventDefault();
      setArrastando(true);
    }

    function aoSair(evento: DragEvent) {
      if (evento.relatedTarget) return;
      setArrastando(false);
    }

    function aoSoltar(evento: DragEvent) {
      evento.preventDefault();
      setArrastando(false);

      const soltos = evento.dataTransfer?.files;
      if (soltos?.length) void abrirArquivo(soltos[0]);
    }

    window.addEventListener("dragover", aoArrastar);
    window.addEventListener("dragleave", aoSair);
    window.addEventListener("drop", aoSoltar);

    return () => {
      window.removeEventListener("dragover", aoArrastar);
      window.removeEventListener("dragleave", aoSair);
      window.removeEventListener("drop", aoSoltar);
    };
  }, [abrirArquivo]);

  function alternar(
    valor: boolean,
    definir: (v: boolean) => void,
    aplicar: (cena: CenaCad, v: boolean) => void
  ) {
    const novo = !valor;
    definir(novo);
    if (cenaRef.current) aplicar(cenaRef.current, novo);
  }

  function fechar() {
    cenaRef.current?.limpar();
    setArquivo(null);
    setArquivoDxf(null);
    setInfo(null);
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function telaCheia() {
    const alvo = areaRef.current?.parentElement;
    if (!alvo) return;

    if (document.fullscreenElement) void document.exitFullscreen();
    else void alvo.requestFullscreen();
  }

  function baixarImagem() {
    const cena = cenaRef.current;
    if (!cena || !arquivo) return;

    const link = document.createElement("a");
    link.href = cena.capturarImagem();
    link.download = `${arquivo.name.replace(/\.[^.]+$/, "")}.png`;
    link.click();
  }

  const temModelo = !!arquivo && !carregando && !erro;

  return (
    <PageContainer>
      <PageHeader
        title="Visualizador CAD"
        description="Arraste o arquivo da peça para a tela. Abre desenho 2D e modelo 3D para girar, aproximar e ver as dimensões — sem precisar de outro programa."
      />

      <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Visualizador CAD" }]} />

      <div className={styles.palco}>
        {/* Barra de ferramentas: só faz sentido com peça aberta. */}
        {temModelo && !arquivoDxf && (
          <div className={styles.barra}>
            <div className={styles.grupo}>
              <span className={styles.nomeArquivo} title={arquivo.name}>
                {arquivo.name}
              </span>
              <span className={styles.tamanho}>{formatarTamanhoArquivo(arquivo.size)}</span>
            </div>

            <div className={styles.grupo}>
              {VISTAS.map((vista) => (
                <button
                  key={vista.valor}
                  type="button"
                  className={styles.botaoVista}
                  onClick={() => cenaRef.current?.verDe(vista.valor)}
                >
                  {vista.rotulo}
                </button>
              ))}
            </div>

            <div className={styles.grupo}>
              <button
                type="button"
                className={styles.botao}
                onClick={() => cenaRef.current?.enquadrar()}
                title="Enquadrar a peça"
              >
                <Scan size={16} />
              </button>

              <button
                type="button"
                className={`${styles.botao} ${arestas ? styles.botaoAtivo : ""}`}
                onClick={() => alternar(arestas, setArestas, (c, v) => c.definirArestas(v))}
                title="Arestas"
              >
                <Box size={16} />
              </button>

              <button
                type="button"
                className={`${styles.botao} ${wireframe ? styles.botaoAtivo : ""}`}
                onClick={() =>
                  alternar(wireframe, setWireframe, (c, v) => c.definirWireframe(v))
                }
                title="Só o aramado"
              >
                <Square size={16} />
              </button>

              <button
                type="button"
                className={`${styles.botao} ${grade ? styles.botaoAtivo : ""}`}
                onClick={() => alternar(grade, setGrade, (c, v) => c.definirGrade(v))}
                title="Grade"
              >
                <Grid3x3 size={16} />
              </button>

              <button
                type="button"
                className={`${styles.botao} ${eixos ? styles.botaoAtivo : ""}`}
                onClick={() => alternar(eixos, setEixos, (c, v) => c.definirGizmo(v))}
                title="Indicador de eixos (canto inferior direito)"
              >
                <Axis3d size={16} />
              </button>

              <button
                type="button"
                className={`${styles.botao} ${cotas ? styles.botaoAtivo : ""}`}
                onClick={() => alternar(cotas, setCotas, (c, v) => c.definirCotas(v))}
                title="Cotas na peça"
              >
                <Ruler size={16} />
              </button>

              <button
                type="button"
                className={`${styles.botao} ${girando ? styles.botaoAtivo : ""}`}
                onClick={() =>
                  alternar(girando, setGirando, (c, v) => c.definirGiroAutomatico(v))
                }
                title="Girar sozinho"
              >
                <RotateCw size={16} />
              </button>

              <button
                type="button"
                className={styles.botao}
                onClick={baixarImagem}
                title="Salvar imagem"
              >
                <Camera size={16} />
              </button>

              <button
                type="button"
                className={styles.botao}
                onClick={telaCheia}
                title="Tela cheia"
              >
                <Maximize2 size={16} />
              </button>

              <button
                type="button"
                className={styles.botao}
                onClick={fechar}
                title="Fechar arquivo"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {arquivoDxf ? (
          /* key remonta o visualizador a cada arquivo novo -- ver o
             comentário sobre o estado inicial em VisualizadorDxf. */
          <VisualizadorDxf
            key={`${arquivoDxf.name}-${arquivoDxf.size}-${arquivoDxf.lastModified}`}
            arquivo={arquivoDxf}
            onFechar={fechar}
          />
        ) : (
          <div className={styles.areaWrapper}>
            <div ref={areaRef} className={styles.area} />

            {/* Convite inicial, por cima da cena vazia. */}
            {!arquivo && !carregando && (
              <div className={styles.convite}>
                <Upload size={40} className={styles.conviteIcone} />
                <h2 className={styles.conviteTitulo}>Arraste um arquivo para cá</h2>
                <p className={styles.conviteTexto}>
                  ou{" "}
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => inputRef.current?.click()}
                  >
                    escolha no computador
                  </button>
                </p>

                <div className={styles.formatos}>
                  <span>
                    <strong>CAD</strong> {rotulosPorMotor("cad").join(" · ")}
                  </span>
                  <span>
                    <strong>Malha</strong> {rotulosPorMotor("malha").join(" · ")}
                  </span>
                  <span>
                    <strong>2D</strong> {rotulosPorMotor("2d").join(" · ")}
                  </span>
                </div>

                <p className={styles.nota}>
                  O arquivo não sai do seu computador: ele é aberto aqui mesmo,
                  pelo navegador.
                </p>
              </div>
            )}

            {carregando && (
              <div className={styles.carregando}>
                <Loader2 size={32} className={styles.girando} />
                <span>{etapa}</span>
                <small>
                  Arquivos grandes de CAD levam alguns segundos — a conversão acontece
                  no seu computador.
                </small>
              </div>
            )}

            {erro && (
              <div className={styles.erro}>
                <p>{erro}</p>
                <button type="button" className={styles.link} onClick={fechar}>
                  Tentar outro arquivo
                </button>
              </div>
            )}

            {/* Medidas, contagem e os gestos: tudo num canto só, longe
                das cotas (que ficam sobre a peça) e do indicador de
                eixos (canto oposto). */}
            {info && temModelo && (
              <div className={styles.info}>
                <span>
                  <strong>{formatarMedida(info.largura)}</strong> ×{" "}
                  <strong>{formatarMedida(info.altura)}</strong> ×{" "}
                  <strong>{formatarMedida(info.profundidade)}</strong> mm
                </span>
                <span>
                  {info.pecas.toLocaleString("pt-BR")}{" "}
                  {info.pecas === 1 ? "sólido" : "sólidos"} ·{" "}
                  {info.triangulos.toLocaleString("pt-BR")} triângulos
                </span>

                <span className={styles.gestos}>{dicaDeGestos(modoGestos)}</span>
              </div>
            )}
          </div>
        )}

        {arrastando && (
          <div className={styles.alvoArraste}>
            <Upload size={48} />
            <span>Solte o arquivo</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={EXTENSOES_ACEITAS}
        className={styles.inputEscondido}
        onChange={(evento) => {
          const escolhido = evento.target.files?.[0];
          if (escolhido) void abrirArquivo(escolhido);
        }}
      />
    </PageContainer>
  );
}
