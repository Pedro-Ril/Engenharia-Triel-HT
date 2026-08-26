"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

import styles from "./PdfViewerKiosk.module.css";

/*
 * Renderiza o PDF nós mesmos (canvas, via pdf.js) em vez de
 * embutir num <iframe> — o visualizador nativo do Chrome sempre
 * vem com botões de imprimir/baixar que não têm como remover
 * individualmente (só dá pra esconder a barra inteira, perdendo
 * também zoom e navegação de página). Assim controlamos a UI por
 * completo: zoom e passagem de folha, sem imprimir/baixar. Esse
 * componente já é a barra + área do overlay inteiro (não só a
 * área de conteúdo) pra poder colocar os controles de zoom/página
 * na mesma barra do botão "Fechar".
 */
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfViewerKioskProps {
  data: ArrayBuffer;
  itemCodigo?: string;
  onFechar: () => void;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_PASSO = 0.25;
const ZOOM_INICIAL = 1.2;

/* Fator por "unidade" de deltaY do wheel — dá uma sensação contínua/suave tanto no scroll do mouse quanto no pinça do trackpad (que reporta deltaY fracionário). */
const ZOOM_SENSIBILIDADE_SCROLL = 0.0015;

/*
 * Redesenhar a folha em pdf.js (rasterizar de novo em resolução
 * maior) é caro — durante um gesto contínuo de zoom (scroll/pinça,
 * que dispara muitos eventos por segundo) isso re-renderizaria a
 * cada tiquinho de zoom, travando a interação e mostrando o
 * spinner toda hora. Em vez disso, o zoom "alvo" muda na hora (só
 * escala o canvas já desenhado via CSS — instantâneo, ainda que um
 * pouco borrado) e o redesenho de verdade em pdf.js só dispara
 * quando o usuário para de mexer por DEBOUNCE_ZOOM_MS.
 */
const DEBOUNCE_ZOOM_MS = 160;

interface FocoZoom {
  ratioX: number;
  ratioY: number;
  offsetX: number;
  offsetY: number;
  clientX: number;
  clientY: number;
}

export function PdfViewerKiosk({ data, itemCodigo, onFechar }: PdfViewerKioskProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const focoZoomRef = useRef<FocoZoom | null>(null);
  const arrastoRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(
    null
  );

  const [documento, setDocumento] = useState<PDFDocumentProxy | null>(null);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(ZOOM_INICIAL);
  const [zoomParaRenderizar, setZoomParaRenderizar] = useState(ZOOM_INICIAL);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [paginaRenderizada, setPaginaRenderizada] = useState<number | null>(null);
  const [zoomRenderizado, setZoomRenderizado] = useState(ZOOM_INICIAL);
  const [resolucaoRenderizada, setResolucaoRenderizada] = useState<{
    largura: number;
    altura: number;
  } | null>(null);
  const [arrastando, setArrastando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    /* pdf.js pode assumir posse do buffer (detach) — copia pra não quebrar se algo mais usar `data`. */
    const bytes = new Uint8Array(data.slice(0));

    pdfjsLib.getDocument({ data: bytes }).promise.then(
      (doc) => {
        if (cancelado) return;
        setDocumento(doc);
        setCarregando(false);
      },
      (erroCarregamento: unknown) => {
        if (cancelado) return;
        setErro(
          erroCarregamento instanceof Error
            ? erroCarregamento.message
            : "Não foi possível abrir o PDF."
        );
        setCarregando(false);
      }
    );

    return () => {
      cancelado = true;
    };
  }, [data]);

  /* Espera o zoom "alvo" parar de mudar por um instante antes de mandar redesenhar de verdade — ver DEBOUNCE_ZOOM_MS acima. */
  useEffect(() => {
    const id = setTimeout(() => setZoomParaRenderizar(zoom), DEBOUNCE_ZOOM_MS);
    return () => clearTimeout(id);
  }, [zoom]);

  useEffect(() => {
    if (!documento) return;

    let cancelado = false;

    documento
      .getPage(pagina)
      .then(async (page) => {
        if (cancelado) return;

        const viewport = page.getViewport({ scale: zoomParaRenderizar });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        /*
         * Zoom pelo scroll/pinça guarda em focoZoomRef o ponto do
         * PDF que estava sob o cursor antes do redimensionar — aqui
         * (já com o canvas no tamanho novo, mas antes do render
         * assíncrono terminar) reposiciona o scroll pra manter esse
         * mesmo ponto sob o cursor, em vez de saltar pro canto.
         */
        const foco = focoZoomRef.current;
        const container = containerRef.current;
        if (foco && container) {
          const containerRect = container.getBoundingClientRect();
          container.scrollLeft =
            foco.offsetX + foco.ratioX * canvas.width - (foco.clientX - containerRect.left);
          container.scrollTop =
            foco.offsetY + foco.ratioY * canvas.height - (foco.clientY - containerRect.top);
          focoZoomRef.current = null;
        }

        await page.render({ canvas, viewport }).promise;
        if (cancelado) return;

        setPaginaRenderizada(pagina);
        setZoomRenderizado(zoomParaRenderizar);
        setResolucaoRenderizada({ largura: viewport.width, altura: viewport.height });
      })
      .catch((erroRender: unknown) => {
        if (cancelado) return;
        setErro(
          erroRender instanceof Error ? erroRender.message : "Não foi possível exibir a página."
        );
      });

    return () => {
      cancelado = true;
    };
  }, [documento, pagina, zoomParaRenderizar]);

  /* Clicar e arrastar pra rolar a folha (o mesmo gesto do Google Maps/Figma), sem depender só das barras de rolagem. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function aoMouseDown(event: MouseEvent) {
      if (event.button !== 0) return;
      const alvo = event.target as HTMLElement;
      if (alvo.closest("button")) return;

      arrastoRef.current = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: container!.scrollLeft,
        scrollTop: container!.scrollTop,
      };
      setArrastando(true);
      event.preventDefault();
    }

    function aoMouseMove(event: MouseEvent) {
      const arrasto = arrastoRef.current;
      if (!arrasto) return;

      container!.scrollLeft = arrasto.scrollLeft - (event.clientX - arrasto.x);
      container!.scrollTop = arrasto.scrollTop - (event.clientY - arrasto.y);
    }

    function aoMouseUp() {
      if (!arrastoRef.current) return;
      arrastoRef.current = null;
      setArrastando(false);
    }

    container.addEventListener("mousedown", aoMouseDown);
    window.addEventListener("mousemove", aoMouseMove);
    window.addEventListener("mouseup", aoMouseUp);

    return () => {
      container.removeEventListener("mousedown", aoMouseDown);
      window.removeEventListener("mousemove", aoMouseMove);
      window.removeEventListener("mouseup", aoMouseUp);
    };
  }, []);

  /*
   * Ctrl/Cmd + scroll do mouse E o gesto de pinça do trackpad (o
   * navegador reporta os dois como "wheel" com ctrlKey=true) dão
   * zoom. Scroll normal (sem ctrl) e o arrasto de dois dedos do
   * trackpad continuam como rolagem nativa do navegador — por isso
   * só damos preventDefault quando é realmente um gesto de zoom
   * (senão bloquearíamos a rolagem normal, e o ctrl+scroll faria o
   * navegador dar zoom na página inteira em vez de só no desenho).
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function aoWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();

      const canvas = canvasRef.current;
      const containerAtual = containerRef.current;
      if (canvas && containerAtual) {
        const canvasRect = canvas.getBoundingClientRect();
        const containerRect = containerAtual.getBoundingClientRect();

        focoZoomRef.current = {
          ratioX: (event.clientX - canvasRect.left) / canvasRect.width,
          ratioY: (event.clientY - canvasRect.top) / canvasRect.height,
          offsetX: canvasRect.left - containerRect.left + containerAtual.scrollLeft,
          offsetY: canvasRect.top - containerRect.top + containerAtual.scrollTop,
          clientX: event.clientX,
          clientY: event.clientY,
        };
      }

      const fator = Math.exp(-event.deltaY * ZOOM_SENSIBILIDADE_SCROLL);
      setZoom((atual) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, atual * fator)));
    }

    container.addEventListener("wheel", aoWheel, { passive: false });
    return () => container.removeEventListener("wheel", aoWheel);
  }, []);

  const totalPaginas = documento?.numPages ?? 1;

  /* Só mostra o spinner quando está trocando de folha de verdade — o zoom já tem sua própria prévia instantânea (ver estiloCanvas), não precisa de loading. */
  const carregandoNovaPagina = documento !== null && paginaRenderizada !== pagina;

  /*
   * Enquanto o redesenho de verdade não chega (debounce), escala
   * via CSS o próprio tamanho do canvas (não um `transform`) pra
   * aproximar do zoom alvo — assim a área rolável cresce/encolhe
   * junto (um `transform` não mexe no scroll, deixaria a prévia
   * cortada nas bordas em vez de realmente maior).
   */
  const escalaPreview = zoomRenderizado > 0 ? zoom / zoomRenderizado : 1;
  const estiloCanvas = resolucaoRenderizada
    ? {
        width: `${resolucaoRenderizada.largura * escalaPreview}px`,
        height: `${resolucaoRenderizada.altura * escalaPreview}px`,
      }
    : undefined;

  return (
    <div className={styles.overlay}>
      <div className={styles.overlayBarra}>
        <span className={styles.overlayTitulo}>Desenho — {itemCodigo}</span>

        <div className={styles.controles}>
          <div className={styles.grupo}>
            <button
              type="button"
              className={styles.botao}
              onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              disabled={carregando || pagina <= 1}
              aria-label="Página anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <span className={styles.paginaTexto}>
              {carregando ? "—" : `Página ${pagina} de ${totalPaginas}`}
            </span>

            <button
              type="button"
              className={styles.botao}
              onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}
              disabled={carregando || pagina >= totalPaginas}
              aria-label="Próxima página"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className={styles.grupo}>
            <button
              type="button"
              className={styles.botao}
              onClick={() => setZoom((atual) => Math.max(ZOOM_MIN, atual - ZOOM_PASSO))}
              disabled={carregando || zoom <= ZOOM_MIN}
              aria-label="Diminuir zoom"
            >
              <ZoomOut size={18} />
            </button>

            <span className={styles.paginaTexto}>{Math.round(zoom * 100)}%</span>

            <button
              type="button"
              className={styles.botao}
              onClick={() => setZoom((atual) => Math.min(ZOOM_MAX, atual + ZOOM_PASSO))}
              disabled={carregando || zoom >= ZOOM_MAX}
              aria-label="Aumentar zoom"
            >
              <ZoomIn size={18} />
            </button>
          </div>
        </div>

        <button type="button" className={styles.overlayFecharBotao} onClick={onFechar}>
          <X size={20} />
          Fechar
        </button>
      </div>

      <div
        ref={containerRef}
        className={`${styles.overlayConteudo} ${arrastando ? styles.arrastando : ""}`}
      >
        {carregando ? (
          <div className={styles.status}>
            <Loader2 className={styles.spin} size={32} />
            <span>Abrindo PDF...</span>
          </div>
        ) : erro ? (
          <div className={styles.status}>
            <span>{erro}</span>
          </div>
        ) : (
          <div className={styles.paginaWrapper}>
            {carregandoNovaPagina && (
              <div className={styles.statusSobreposto}>
                <Loader2 className={styles.spin} size={28} />
              </div>
            )}
            <canvas ref={canvasRef} className={styles.canvas} style={estiloCanvas} />
          </div>
        )}
      </div>
    </div>
  );
}
