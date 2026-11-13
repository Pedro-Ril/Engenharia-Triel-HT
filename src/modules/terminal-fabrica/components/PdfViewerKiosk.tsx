"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoveHorizontal,
  Printer,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
/*
 * Build "legacy" (não a raiz "pdfjs-dist") -- a raiz assume DOMMatrix
 * disponível já na avaliação do módulo, o que não existe em Node.js.
 * Esse componente é "use client", mas o Next ainda avalia o módulo no
 * lado do servidor como parte do SSR da página — sem a build legacy,
 * o próprio pdf.js avisa "Please use the legacy build in Node.js
 * environments" e a página quebra com "ReferenceError: DOMMatrix is
 * not defined" antes mesmo de qualquer client component rodar.
 */
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { registrarImpressaoTerminal } from "../services/registrarImpressao.service";
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
 *
 * A exceção é imprimir, liberado por usuário (ver
 * src/lib/terminal-fabrica/impressao.ts): quem tem a permissão ganha
 * um botão a mais, e cada clique fica registrado.
 */
/*
 * Worker servido de public/pdfjs (copiado de node_modules no predev/
 * prebuild -- ver scripts/copiar-pdfjs-worker.mjs). A versão na URL evita
 * o navegador usar um worker antigo do cache depois de atualizar o
 * pdfjs-dist (o pdf.js recusa worker de versão diferente da API).
 */
pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker.min.js?v=${pdfjsLib.version}`;

interface PdfViewerKioskProps {
  data: ArrayBuffer;
  itemCodigo?: string;
  /* Resolvido no servidor (ver src/app/terminal-fabrica/page.tsx) — sem a
     permissão o botão não existe, nem a rota de registro aceita. */
  podeImprimir?: boolean;
  onFechar: () => void;
}

/* 0.2 e não 0.5: no celular, uma folha A3 inteira na largura da tela fica perto de 30%. */
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_PASSO = 0.25;
const ZOOM_INICIAL = 1.2;

/*
 * Tela estreita (celular/tablet em pé): abre a folha ajustada à largura
 * em vez dos 120% do terminal -- senão só aparece um canto do desenho.
 * Mesmo corte do @media de PdfViewerKiosk.module.css, e o respiro em
 * volta da folha precisa bater com o padding de .paginaWrapper lá.
 */
const LARGURA_TELA_ESTREITA = 900;
const RESPIRO_FOLHA = 24;
const RESPIRO_FOLHA_ESTREITA = 8;

/*
 * Teto de pixels do canvas. Safari no iPhone recusa canvas acima de
 * ~16,7 milhões de pixels (fica em branco, sem erro); com a densidade
 * de tela (2x/3x) multiplicando a resolução, um zoom alto passaria disso.
 */
const MAXIMO_PIXELS_CANVAS = 16_000_000;

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

/*
 * O diálogo de impressão depende do `load` do iframe com o PDF, e esse
 * evento não vem em navegador sem visualizador de PDF embutido (um
 * Chromium "puro", por exemplo). Sem este limite o botão ficaria
 * girando para sempre, sem dizer nada a quem clicou.
 */
const TIMEOUT_IMPRESSAO_MS = 20000;

/*
 * Ponto da folha que deve ficar parado na tela durante o zoom: a
 * posição relativa dentro da folha (0..1) e onde, na tela, ela tem que
 * continuar. Aplicado logo depois do redimensionar (ver o
 * useLayoutEffect de zoom).
 */
interface FocoZoom {
  ratioX: number;
  ratioY: number;
  clientX: number;
  clientY: number;
}

function limitarZoom(valor: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, valor));
}

function focoNoPonto(canvas: HTMLCanvasElement | null, clientX: number, clientY: number): FocoZoom | null {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  return {
    ratioX: (clientX - rect.left) / rect.width,
    ratioY: (clientY - rect.top) / rect.height,
    clientX,
    clientY,
  };
}

function focoNoCentro(canvas: HTMLCanvasElement | null, container: HTMLElement | null): FocoZoom | null {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  return focoNoPonto(canvas, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/* Zoom que faz a folha caber na largura do container. */
function zoomParaLargura(container: HTMLElement | null, larguraFolha: number) {
  if (!container || larguraFolha <= 0) return null;
  const respiro = container.clientWidth < LARGURA_TELA_ESTREITA ? RESPIRO_FOLHA_ESTREITA : RESPIRO_FOLHA;
  return limitarZoom((container.clientWidth - respiro * 2) / larguraFolha);
}

/*
 * Resolução real do canvas: acompanha a densidade da tela (senão o
 * desenho fica borrado no celular), respeitando o teto de pixels.
 */
function escalaDeSaida(largura: number, altura: number) {
  const densidade = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.min(densidade, Math.sqrt(MAXIMO_PIXELS_CANVAS / Math.max(1, largura * altura)));
}

export function PdfViewerKiosk({
  data,
  itemCodigo,
  podeImprimir = false,
  onFechar,
}: PdfViewerKioskProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeImpressaoRef = useRef<HTMLIFrameElement>(null);
  const urlImpressaoRef = useRef<string | null>(null);
  const timeoutImpressaoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focoZoomRef = useRef<FocoZoom | null>(null);
  const zoomRef = useRef(ZOOM_INICIAL);
  const larguraFolhaRef = useRef(0);
  const arrastoRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(
    null
  );

  const [documento, setDocumento] = useState<PDFDocumentProxy | null>(null);
  const [pagina, setPagina] = useState(1);
  const [zoom, setZoom] = useState(ZOOM_INICIAL);
  /* Muda a cada gesto com foco -- faz o ajuste de rolagem rodar mesmo quando o zoom não muda (pinça só arrastando). */
  const [ajusteFoco, setAjusteFoco] = useState(0);
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
  const [preparandoImpressao, setPreparandoImpressao] = useState(false);
  const [erroImpressao, setErroImpressao] = useState<string | null>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  function aplicarZoom(novoZoom: number, foco: FocoZoom | null) {
    focoZoomRef.current = foco;
    setZoom(limitarZoom(novoZoom));
    setAjusteFoco((atual) => atual + 1);
  }

  useEffect(() => {
    let cancelado = false;

    /* pdf.js pode assumir posse do buffer (detach) — copia pra não quebrar se algo mais usar `data`. */
    const bytes = new Uint8Array(data.slice(0));

    pdfjsLib
      .getDocument({ data: bytes })
      .promise.then(async (doc) => {
        if (cancelado) return;

        /*
         * Em tela estreita já abre na largura da tela (antes do primeiro
         * desenho, pra não rasterizar uma vez em 120% à toa).
         */
        const primeira = await doc.getPage(1);
        if (cancelado) return;

        const container = containerRef.current;
        if (container && container.clientWidth < LARGURA_TELA_ESTREITA) {
          const ajustado = zoomParaLargura(container, primeira.getViewport({ scale: 1 }).width);
          if (ajustado !== null) {
            setZoom(ajustado);
            setZoomParaRenderizar(ajustado);
            setZoomRenderizado(ajustado);
          }
        }

        setDocumento(doc);
        setCarregando(false);
      })
      .catch((erroCarregamento: unknown) => {
        if (cancelado) return;
        setErro(
          erroCarregamento instanceof Error
            ? erroCarregamento.message
            : "Não foi possível abrir o PDF."
        );
        setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [data]);

  /* Espera o zoom "alvo" parar de mudar por um instante antes de mandar redesenhar de verdade — ver DEBOUNCE_ZOOM_MS acima. */
  useEffect(() => {
    const id = setTimeout(() => setZoomParaRenderizar(zoom), DEBOUNCE_ZOOM_MS);
    return () => clearTimeout(id);
  }, [zoom]);

  /*
   * Mantém sob o dedo/cursor (ou no centro, nos botões) o mesmo ponto da
   * folha depois que o canvas muda de tamanho. Roda depois do DOM já ter
   * o tamanho novo (prévia em CSS) e antes da pintura, então não pisca.
   */
  useLayoutEffect(() => {
    const foco = focoZoomRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!foco || !canvas || !container) return;

    focoZoomRef.current = null;
    const rect = canvas.getBoundingClientRect();
    container.scrollLeft += rect.left + foco.ratioX * rect.width - foco.clientX;
    container.scrollTop += rect.top + foco.ratioY * rect.height - foco.clientY;
  }, [zoom, ajusteFoco]);

  useEffect(() => {
    if (!documento) return;

    let cancelado = false;

    documento
      .getPage(pagina)
      .then(async (page) => {
        if (cancelado) return;

        larguraFolhaRef.current = page.getViewport({ scale: 1 }).width;

        const viewport = page.getViewport({ scale: zoomParaRenderizar });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const escala = escalaDeSaida(viewport.width, viewport.height);
        canvas.width = Math.floor(viewport.width * escala);
        canvas.height = Math.floor(viewport.height * escala);
        /* Tamanho na tela continua o do zoom; a escala extra é só nitidez. */
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        await page.render({
          canvas,
          viewport,
          transform: escala !== 1 ? [escala, 0, 0, escala, 0, 0] : undefined,
        }).promise;
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

  /* Clicar e arrastar pra rolar a folha (o mesmo gesto do Google Maps/Figma), sem depender só das barras de rolagem. No toque, a rolagem nativa já faz isso. */
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

      focoZoomRef.current = focoNoPonto(canvasRef.current, event.clientX, event.clientY);
      const fator = Math.exp(-event.deltaY * ZOOM_SENSIBILIDADE_SCROLL);
      setZoom((atual) => limitarZoom(atual * fator));
      setAjusteFoco((atual) => atual + 1);
    }

    container.addEventListener("wheel", aoWheel, { passive: false });
    return () => container.removeEventListener("wheel", aoWheel);
  }, []);

  /*
   * Pinça com dois dedos (celular, tablet, terminal com tela de toque):
   * zoom só no desenho, ancorado entre os dedos, e arrastar os dois
   * dedos move a folha junto. Um dedo continua rolando normalmente
   * (touch-action: pan-x pan-y no CSS, que também impede o navegador de
   * dar zoom na página inteira, barra incluída).
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let pinca: { distancia: number; zoom: number; ratioX: number; ratioY: number } | null = null;

    function medir(toques: TouchList) {
      const [a, b] = [toques[0], toques[1]];
      return {
        distancia: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
    }

    function aoTouchStart(event: TouchEvent) {
      if (event.touches.length !== 2) return;

      const { distancia, x, y } = medir(event.touches);
      const foco = focoNoPonto(canvasRef.current, x, y);
      if (!foco || distancia === 0) return;

      pinca = { distancia, zoom: zoomRef.current, ratioX: foco.ratioX, ratioY: foco.ratioY };
      event.preventDefault();
    }

    function aoTouchMove(event: TouchEvent) {
      if (!pinca || event.touches.length !== 2) return;
      event.preventDefault();

      const { distancia, x, y } = medir(event.touches);
      focoZoomRef.current = { ratioX: pinca.ratioX, ratioY: pinca.ratioY, clientX: x, clientY: y };
      setZoom(limitarZoom(pinca.zoom * (distancia / pinca.distancia)));
      setAjusteFoco((atual) => atual + 1);
    }

    function aoTouchEnd(event: TouchEvent) {
      if (event.touches.length < 2) pinca = null;
    }

    container.addEventListener("touchstart", aoTouchStart, { passive: false });
    container.addEventListener("touchmove", aoTouchMove, { passive: false });
    container.addEventListener("touchend", aoTouchEnd);
    container.addEventListener("touchcancel", aoTouchEnd);

    return () => {
      container.removeEventListener("touchstart", aoTouchStart);
      container.removeEventListener("touchmove", aoTouchMove);
      container.removeEventListener("touchend", aoTouchEnd);
      container.removeEventListener("touchcancel", aoTouchEnd);
    };
  }, []);

  /* O blob da impressão vive enquanto o visualizador estiver aberto. */
  useEffect(() => {
    return () => {
      if (urlImpressaoRef.current) {
        URL.revokeObjectURL(urlImpressaoRef.current);
        urlImpressaoRef.current = null;
      }

      if (timeoutImpressaoRef.current) {
        clearTimeout(timeoutImpressaoRef.current);
        timeoutImpressaoRef.current = null;
      }
    };
  }, []);

  const totalPaginas = documento?.numPages ?? 1;

  function zoomPeloBotao(delta: number) {
    aplicarZoom(zoom + delta, focoNoCentro(canvasRef.current, containerRef.current));
  }

  function ajustarALargura() {
    const ajustado = zoomParaLargura(containerRef.current, larguraFolhaRef.current);
    if (ajustado === null) return;

    /* Ancora o topo da folha no topo da área: depois de caber na largura, o natural é ver a folha desde o alto. */
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const respiro = container.clientWidth < LARGURA_TELA_ESTREITA ? RESPIRO_FOLHA_ESTREITA : RESPIRO_FOLHA;
    aplicarZoom(ajustado, { ratioX: 0.5, ratioY: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + respiro });
  }

  /*
   * Imprime o PDF ORIGINAL, não os canvas desenhados na tela: o
   * arquivo é vetorial, sai nítido em qualquer escala e já traz todas
   * as folhas. Rasterizar o canvas sairia na resolução do zoom atual e
   * só da página aberta.
   *
   * Reusa os bytes que já estão em memória (o `data` desta prop) —
   * nenhuma requisição nova. O iframe fica no DOM, invisível mas não
   * display:none, porque o Chrome não imprime iframe sem caixa.
   *
   * Registra no clique, não na saída do papel: o diálogo do navegador
   * é do sistema, não dá para saber se a pessoa confirmou ou cancelou.
   * O histórico, portanto, é de impressões PEDIDAS -- e o painel do
   * admin diz isso com essas palavras.
   */
  function imprimir() {
    const iframe = iframeImpressaoRef.current;
    if (!iframe || preparandoImpressao) return;

    setPreparandoImpressao(true);
    setErroImpressao(null);

    if (urlImpressaoRef.current) {
      URL.revokeObjectURL(urlImpressaoRef.current);
    }

    const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
    urlImpressaoRef.current = url;

    timeoutImpressaoRef.current = setTimeout(() => {
      timeoutImpressaoRef.current = null;
      setPreparandoImpressao(false);
      setErroImpressao("Não foi possível abrir a impressão. Tente novamente.");
    }, TIMEOUT_IMPRESSAO_MS);

    iframe.onload = () => {
      if (timeoutImpressaoRef.current) {
        clearTimeout(timeoutImpressaoRef.current);
        timeoutImpressaoRef.current = null;
      }

      setPreparandoImpressao(false);

      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (erro) {
        console.error("Erro ao abrir o diálogo de impressão:", erro);
        setErroImpressao("Não foi possível abrir a impressão. Tente novamente.");
        return;
      }

      if (itemCodigo) {
        registrarImpressaoTerminal(itemCodigo, documento?.numPages ?? 0);
      }
    };

    iframe.src = url;
  }

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
        <span className={styles.overlayTitulo}>
          <span className={styles.textoLargo}>Desenho — </span>
          {itemCodigo}
        </span>

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
              {carregando ? (
                "—"
              ) : (
                <>
                  <span className={styles.textoLargo}>Página </span>
                  {pagina}
                  <span className={styles.textoLargo}> de </span>
                  <span className={styles.textoEstreito}>/</span>
                  {totalPaginas}
                </>
              )}
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
              onClick={() => zoomPeloBotao(-ZOOM_PASSO)}
              disabled={carregando || zoom <= ZOOM_MIN}
              aria-label="Diminuir zoom"
            >
              <ZoomOut size={18} />
            </button>

            <span className={`${styles.paginaTexto} ${styles.zoomTexto}`}>{Math.round(zoom * 100)}%</span>

            <button
              type="button"
              className={styles.botao}
              onClick={() => zoomPeloBotao(ZOOM_PASSO)}
              disabled={carregando || zoom >= ZOOM_MAX}
              aria-label="Aumentar zoom"
            >
              <ZoomIn size={18} />
            </button>

            <button
              type="button"
              className={styles.botao}
              onClick={ajustarALargura}
              disabled={carregando || !!erro}
              aria-label="Ajustar à largura da tela"
              title="Ajustar à largura da tela"
            >
              <MoveHorizontal size={18} />
            </button>
          </div>

          {podeImprimir && (
            <div className={styles.grupo}>
              <button
                type="button"
                className={styles.botaoImprimir}
                onClick={imprimir}
                disabled={carregando || !!erro || preparandoImpressao}
                title="Imprimir o desenho"
                aria-label="Imprimir o desenho"
              >
                {preparandoImpressao ? (
                  <Loader2 className={styles.spin} size={18} />
                ) : (
                  <Printer size={18} />
                )}
                <span className={styles.textoLargo}>Imprimir</span>
              </button>

              {erroImpressao && (
                <span className={styles.avisoImpressao} role="status">
                  {erroImpressao}
                </span>
              )}
            </div>
          )}
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

      {podeImprimir && (
        <iframe
          ref={iframeImpressaoRef}
          className={styles.iframeImpressao}
          title="Impressão do desenho"
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
    </div>
  );
}
