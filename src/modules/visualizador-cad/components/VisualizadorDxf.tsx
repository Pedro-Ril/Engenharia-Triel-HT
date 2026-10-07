"use client";

import { useEffect, useRef, useState } from "react";
import { DxfViewer } from "dxf-viewer";
import { Color } from "three";
import { Loader2, Scan, X } from "lucide-react";

import styles from "./VisualizadorCad.module.css";

/*
 * DXF é desenho 2D, não modelo: nada de órbita nem de vistas. Vai para o
 * dxf-viewer, a mesma biblioteca que o módulo do Lantek já usa para
 * conferir desenho -- aqui lendo um arquivo local em vez de um caminho
 * de rede.
 */

interface VisualizadorDxfProps {
  arquivo: File;
  onFechar: () => void;
}

export function VisualizadorDxf({ arquivo, onFechar }: VisualizadorDxfProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<DxfViewer | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    /*
     * O Destroy() da lib não tira o <canvas> do DOM -- sem isto, trocar
     * de arquivo (ou o StrictMode em dev) deixa um canvas morto por
     * cima do novo. Mesma armadilha já documentada no Lantek.
     */
    container.replaceChildren();

    const viewer = new DxfViewer(container, {
      autoResize: true,
      /* Branco, como o visualizador do Lantek: desenho técnico é traço
         escuro sobre fundo claro, e o DXF traz as cores pensadas assim. */
      clearColor: new Color("#ffffff"),
      colorCorrection: true,
    });

    /* O dxf-viewer carrega por URL; um blob local serve como qualquer outra. */
    const url = URL.createObjectURL(arquivo);
    let cancelado = false;

    /*
     * Nada de voltar o estado para "carregando" aqui: quem troca de
     * arquivo remonta este componente (key no pai), então o estado
     * inicial já nasce certo. Evita o setState em corpo de efeito que
     * o React Compiler reprova.
     */
    viewer
      .Load({ url })
      .then(() => {
        if (cancelado) return;
        viewerRef.current = viewer;
        setCarregando(false);
      })
      .catch((erroCarga: unknown) => {
        if (cancelado) return;
        setErro(
          erroCarga instanceof Error
            ? erroCarga.message
            : "Não foi possível abrir este DXF."
        );
        setCarregando(false);
      });

    return () => {
      cancelado = true;
      URL.revokeObjectURL(url);
      viewerRef.current = null;
      viewer.Destroy();
      container.replaceChildren();
    };
  }, [arquivo]);

  /* GetBounds + FitView: a lib devolve o envelope do desenho e
     reposiciona a câmera ortográfica nele. */
  function enquadrar() {
    const viewer = viewerRef.current;
    const limites = viewer?.GetBounds();
    if (!viewer || !limites) return;

    /* O padding tem default na lib, mas os tipos o declaram obrigatório. */
    viewer.FitView(limites.minX, limites.maxX, limites.minY, limites.maxY, 0.1);
  }

  return (
    <div className={styles.areaWrapper}>
      <div className={styles.barra}>
        <div className={styles.grupo}>
          <span className={styles.nomeArquivo} title={arquivo.name}>
            {arquivo.name}
          </span>
          <span className={styles.tamanho}>desenho 2D</span>
        </div>

        <div className={styles.grupo}>
          <button
            type="button"
            className={styles.botao}
            onClick={enquadrar}
            title="Enquadrar o desenho"
          >
            <Scan size={16} />
          </button>

          <button type="button" className={styles.botao} onClick={onFechar} title="Fechar arquivo">
            <X size={16} />
          </button>
        </div>
      </div>

      <div ref={containerRef} className={styles.area} />

      {carregando && (
        <div className={styles.carregando}>
          <Loader2 size={32} className={styles.girando} />
          <span>Abrindo o desenho...</span>
        </div>
      )}

      {erro && (
        <div className={styles.erro}>
          <p>{erro}</p>
          <button type="button" className={styles.link} onClick={onFechar}>
            Tentar outro arquivo
          </button>
        </div>
      )}

      {!carregando && !erro && (
        <div className={`${styles.gestos} ${styles.gestosClaro}`}>
          Arrastar desloca · Scroll aproxima
        </div>
      )}
    </div>
  );
}
