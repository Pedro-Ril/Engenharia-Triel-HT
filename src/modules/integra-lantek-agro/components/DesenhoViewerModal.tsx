"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DxfViewer } from "dxf-viewer";
import {
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Vector3,
} from "three";
import styles from "@/modules/integra-lantek-shared/components/DesenhoViewerModal.module.css";

type PontoMedicao = { x: number; y: number };

type ArcoInfo = {
  tipo: "ARC" | "CIRCLE";
  centro: PontoMedicao;
  raio: number;
  anguloInicial: number;
  anguloFinal: number;
};

type SegmentoMedicao = { a: PontoMedicao; b: PontoMedicao; arco?: ArcoInfo };

function formatarDistancia(valor: number): string {
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} mm`;
}

/** Arcos mostram o raio (padrão de cotagem para filetes/curvas); círculos
 * mostram o diâmetro (padrão de cotagem para furos). */
function formatarMedidaArco(info: ArcoInfo): string {
  const prefixo = info.tipo === "CIRCLE" ? "⌀" : "R";
  const valor = info.tipo === "CIRCLE" ? info.raio * 2 : info.raio;
  return `${prefixo} ${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} mm`;
}

/* ---------------------------------------------------------------------------
 * Extração de arestas do DXF (para "encaixar" o clique na geometria real do
 * desenho, em vez de exigir precisão de pixel do usuário).
 * ------------------------------------------------------------------------ */

const AMOSTRAS_POR_CIRCULO = 48;

function amostrarArco(
  cx: number,
  cy: number,
  raio: number,
  anguloInicial: number,
  anguloFinal: number
): PontoMedicao[] {
  let varredura = anguloFinal - anguloInicial;
  if (varredura <= 0) varredura += 2 * Math.PI;

  const amostras = Math.max(
    8,
    Math.round((AMOSTRAS_POR_CIRCULO * varredura) / (2 * Math.PI))
  );

  const pontos: PontoMedicao[] = [];
  for (let i = 0; i <= amostras; i += 1) {
    const angulo = anguloInicial + (varredura * i) / amostras;
    pontos.push({
      x: cx + raio * Math.cos(angulo),
      y: cy + raio * Math.sin(angulo),
    });
  }
  return pontos;
}

function criarMarcadorCircular(
  ponto: PontoMedicao,
  raio: number,
  material: LineBasicMaterial
): Line {
  return new Line(
    new BufferGeometry().setFromPoints(
      amostrarArco(ponto.x, ponto.y, raio, 0, 2 * Math.PI).map(
        (p) => new Vector3(p.x, p.y, 0)
      )
    ),
    material
  );
}

function pontosParaSegmentos(
  pontos: PontoMedicao[],
  fechado = false
): SegmentoMedicao[] {
  const segmentos: SegmentoMedicao[] = [];
  for (let i = 0; i < pontos.length - 1; i += 1) {
    segmentos.push({ a: pontos[i], b: pontos[i + 1] });
  }
  if (fechado && pontos.length > 2) {
    segmentos.push({ a: pontos[pontos.length - 1], b: pontos[0] });
  }
  return segmentos;
}

/** Extrai segmentos de reta (retos ou amostrados de arcos/círculos) das
 * entidades do DXF já parseado, para servir de referência de "encaixe" ao
 * medir. Cobre LINE, LWPOLYLINE/POLYLINE (segmentos retos), ARC e CIRCLE.
 * Entidades dentro de blocos (INSERT) não são resolvidas nesta primeira
 * versão — o clique livre continua funcionando normalmente nesses casos.
 *
 * IMPORTANTE: as coordenadas das entidades vêm no sistema de coordenadas
 * bruto do desenho, enquanto o clique do usuário (via evento "pointerup" do
 * viewer) já vem deslocado pela origem interna da cena (usada pela lib por
 * precisão numérica). `origem` (viewer.GetOrigin()) faz esse mesmo
 * deslocamento aqui, senão o encaixe compara pontos em sistemas diferentes
 * e "gruda" em lugares aleatórios do desenho. */
function extrairSegmentosDoDxf(
  dxf: unknown,
  origem: PontoMedicao
): SegmentoMedicao[] {
  const entidades = (dxf as { entities?: unknown[] } | null)?.entities;
  if (!Array.isArray(entidades)) return [];

  const deslocar = (p: PontoMedicao): PontoMedicao => ({
    x: p.x - origem.x,
    y: p.y - origem.y,
  });

  const segmentos: SegmentoMedicao[] = [];

  for (const item of entidades) {
    const entidade = item as Record<string, unknown>;

    switch (entidade.type) {
      case "LINE": {
        const vertices = entidade.vertices as PontoMedicao[] | undefined;
        if (vertices?.length === 2) {
          segmentos.push({ a: deslocar(vertices[0]), b: deslocar(vertices[1]) });
        }
        break;
      }

      case "LWPOLYLINE":
      case "POLYLINE": {
        const vertices = entidade.vertices as PontoMedicao[] | undefined;
        if (vertices && vertices.length > 1) {
          segmentos.push(
            ...pontosParaSegmentos(
              vertices.map(deslocar),
              Boolean(entidade.shape)
            )
          );
        }
        break;
      }

      case "CIRCLE": {
        const centro = entidade.center as PontoMedicao | undefined;
        const raio = entidade.radius as number | undefined;
        if (centro && raio) {
          const c = deslocar(centro);
          const arco: ArcoInfo = {
            tipo: "CIRCLE",
            centro: c,
            raio,
            anguloInicial: 0,
            anguloFinal: 2 * Math.PI,
          };
          segmentos.push(
            ...pontosParaSegmentos(amostrarArco(c.x, c.y, raio, 0, 2 * Math.PI)).map(
              (s) => ({ ...s, arco })
            )
          );
        }
        break;
      }

      case "ARC": {
        const centro = entidade.center as PontoMedicao | undefined;
        const raio = entidade.radius as number | undefined;
        const anguloInicial = entidade.startAngle as number | undefined;
        const anguloFinal = entidade.endAngle as number | undefined;
        if (
          centro &&
          raio !== undefined &&
          anguloInicial !== undefined &&
          anguloFinal !== undefined
        ) {
          const c = deslocar(centro);
          const arco: ArcoInfo = {
            tipo: "ARC",
            centro: c,
            raio,
            anguloInicial,
            anguloFinal,
          };
          segmentos.push(
            ...pontosParaSegmentos(
              amostrarArco(c.x, c.y, raio, anguloInicial, anguloFinal)
            ).map((s) => ({ ...s, arco }))
          );
        }
        break;
      }

      default:
        break;
    }
  }

  return segmentos;
}

function pontoMaisPertoNoSegmento(
  p: PontoMedicao,
  a: PontoMedicao,
  b: PontoMedicao
): PontoMedicao {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const comprimentoQuadrado = abx * abx + aby * aby;
  if (comprimentoQuadrado === 0) return { x: a.x, y: a.y };

  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / comprimentoQuadrado;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

type EncaixeAresta = { ponto: PontoMedicao; arco?: ArcoInfo };

/** Sempre retorna o ponto da aresta mais próxima do clique (sem limite de
 * distância) — a medição deve sempre partir de um ponto real do desenho,
 * nunca do pixel exato onde o usuário clicou. Só retorna null se não houver
 * nenhuma aresta extraída do desenho (ex.: geometria só dentro de blocos).
 * Quando a aresta mais próxima pertence a um arco/círculo, a info do arco
 * (`arco`) vai junto — usada para mostrar raio/diâmetro direto. */
function encontrarPontoNaAresta(
  clique: PontoMedicao,
  segmentos: SegmentoMedicao[]
): EncaixeAresta | null {
  let melhor: EncaixeAresta | null = null;
  let menorDistancia = Infinity;

  for (const { a, b, arco } of segmentos) {
    const candidato = pontoMaisPertoNoSegmento(clique, a, b);
    const distancia = Math.hypot(candidato.x - clique.x, candidato.y - clique.y);

    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      melhor = { ponto: candidato, arco };
    }
  }

  return melhor;
}

type Props = {
  open: boolean;
  caminhoDxf: string;
  arquivoDxf?: string;
  codigo: string;
  codDesenho?: string;
  onClose: () => void;
};

type Status = "carregando" | "pronto" | "erro";

export default function DesenhoViewerModal({
  open,
  caminhoDxf,
  arquivoDxf,
  codigo,
  codDesenho,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="desenho-viewer-title"
      >
        <div className={styles.header}>
          <div>
            <span className={styles.badge}>Conferência de DXF C/ Desenho </span>
            <h2 id="desenho-viewer-title" className={styles.title}>
              {arquivoDxf || codigo || "Desenho"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
            aria-label="Fechar"
            title="Fechar"
          >
            ×
          </button>
        </div>

        <div className={styles.panes}>
          <DxfPane open={open} caminho={caminhoDxf} />
          <div className={styles.paneDivider} />
          <PdfPane open={open} codigo={codigo} codDesenho={codDesenho} />
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            onClick={onClose}
            className={styles.secondaryButton}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function DxfPane({ open, caminho }: { open: boolean; caminho: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<DxfViewer | null>(null);
  const [status, setStatus] = useState<Status>("carregando");
  const [erro, setErro] = useState("");

  const [medindo, setMedindo] = useState(false);
  const [distancia, setDistancia] = useState<number | null>(null);
  const [medidaArco, setMedidaArco] = useState<ArcoInfo | null>(null);
  const [aguardandoSegundoPonto, setAguardandoSegundoPonto] = useState(false);
  const medindoRef = useRef(false);
  const primeiroPontoRef = useRef<PontoMedicao | null>(null);
  const grupoMedicaoRef = useRef<Group | null>(null);
  const segmentosRef = useRef<SegmentoMedicao[]>([]);
  const pointerDownRef = useRef<{
    ponto: PontoMedicao;
    clientX: number;
    clientY: number;
  } | null>(null);

  useEffect(() => {
    medindoRef.current = medindo;
    if (containerRef.current) {
      containerRef.current.style.cursor = medindo ? "crosshair" : "";
    }
    if (!medindo) primeiroPontoRef.current = null;
  }, [medindo]);

  const limparMedicaoVisual = useCallback(() => {
    const viewer = viewerRef.current;
    const grupo = grupoMedicaoRef.current;
    if (!viewer || !grupo) return;

    viewer.GetScene().remove(grupo);
    grupo.traverse((obj) => {
      if (obj instanceof Line) {
        obj.geometry.dispose();
        (obj.material as LineBasicMaterial).dispose();
      }
    });
    grupoMedicaoRef.current = null;
    viewer.Render();
  }, []);

  const desenharMedicaoVisual = useCallback(
    (p1: PontoMedicao, p2: PontoMedicao) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      limparMedicaoVisual();

      const camera = viewer.GetCamera();
      const canvasEl = viewer.GetCanvas();
      const worldPerPixel =
        (camera.right - camera.left) / (canvasEl.clientWidth * camera.zoom);
      const raioMarcador = worldPerPixel * 5;

      const grupo = new Group();
      const material = new LineBasicMaterial({ color: 0xd32f2f });

      grupo.add(
        new Line(
          new BufferGeometry().setFromPoints([
            new Vector3(p1.x, p1.y, 0),
            new Vector3(p2.x, p2.y, 0),
          ]),
          material
        )
      );

      for (const ponto of [p1, p2]) {
        grupo.add(criarMarcadorCircular(ponto, raioMarcador, material));
      }

      viewer.GetScene().add(grupo);
      grupoMedicaoRef.current = grupo;
      viewer.Render();
    },
    [limparMedicaoVisual]
  );

  const desenharMarcadorUnico = useCallback(
    (ponto: PontoMedicao) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      limparMedicaoVisual();

      const camera = viewer.GetCamera();
      const canvasEl = viewer.GetCanvas();
      const worldPerPixel =
        (camera.right - camera.left) / (canvasEl.clientWidth * camera.zoom);
      const raioMarcador = worldPerPixel * 5;

      const grupo = new Group();
      grupo.add(
        criarMarcadorCircular(
          ponto,
          raioMarcador,
          new LineBasicMaterial({ color: 0xd32f2f })
        )
      );

      viewer.GetScene().add(grupo);
      grupoMedicaoRef.current = grupo;
      viewer.Render();
    },
    [limparMedicaoVisual]
  );

  const desenharMedicaoArco = useCallback(
    (info: ArcoInfo) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      limparMedicaoVisual();

      const camera = viewer.GetCamera();
      const canvasEl = viewer.GetCanvas();
      const worldPerPixel =
        (camera.right - camera.left) / (canvasEl.clientWidth * camera.zoom);
      const raioMarcadorCentro = worldPerPixel * 4;

      const grupo = new Group();
      const material = new LineBasicMaterial({ color: 0xd32f2f });

      /* contorno do arco/círculo medido */
      grupo.add(
        new Line(
          new BufferGeometry().setFromPoints(
            amostrarArco(
              info.centro.x,
              info.centro.y,
              info.raio,
              info.anguloInicial,
              info.anguloFinal
            ).map((p) => new Vector3(p.x, p.y, 0))
          ),
          material
        )
      );

      /* marcador no centro */
      grupo.add(criarMarcadorCircular(info.centro, raioMarcadorCentro, material));

      viewer.GetScene().add(grupo);
      grupoMedicaoRef.current = grupo;
      viewer.Render();
    },
    [limparMedicaoVisual]
  );

  const registrarMedicaoDeArco = useCallback(
    (info: ArcoInfo) => {
      primeiroPontoRef.current = null;
      setAguardandoSegundoPonto(false);
      setDistancia(null);
      setMedidaArco(info);
      desenharMedicaoArco(info);
    },
    [desenharMedicaoArco]
  );

  const registrarPontoMedicao = useCallback(
    (ponto: PontoMedicao) => {
      const primeiro = primeiroPontoRef.current;

      if (!primeiro) {
        primeiroPontoRef.current = ponto;
        setAguardandoSegundoPonto(true);
        setDistancia(null);
        setMedidaArco(null);
        desenharMarcadorUnico(ponto);
        return;
      }

      setAguardandoSegundoPonto(false);
      setDistancia(Math.hypot(ponto.x - primeiro.x, ponto.y - primeiro.y));
      setMedidaArco(null);
      desenharMedicaoVisual(primeiro, ponto);
      primeiroPontoRef.current = null;
    },
    [desenharMarcadorUnico, desenharMedicaoVisual]
  );

  const limparMedicaoAtual = useCallback(() => {
    primeiroPontoRef.current = null;
    setAguardandoSegundoPonto(false);
    setDistancia(null);
    setMedidaArco(null);
    limparMedicaoVisual();
  }, [limparMedicaoVisual]);

  function alternarMedicao() {
    setMedindo((prev) => {
      if (prev) {
        primeiroPontoRef.current = null;
        setAguardandoSegundoPonto(false);
        limparMedicaoVisual();
        setDistancia(null);
        setMedidaArco(null);
      }
      return !prev;
    });
  }

  useEffect(() => {
    if (!open || !caminho || !containerRef.current) return;

    const container = containerRef.current;
    /* Destroy() da lib não remove o <canvas> do DOM — sem isso, cada
     * remontagem do efeito (StrictMode em dev, ou trocar de arquivo) deixa
     * um canvas "morto" sobreposto ao novo. */
    container.replaceChildren();

    let cancelado = false;

    const viewer = new DxfViewer(container, {
      autoResize: true,
      clearColor: new Color("#ffffff"),
      colorCorrection: true,
      /* Necessário pra extrair as arestas (linhas/arcos/círculos) do desenho
       * e permitir o "encaixe" do clique de medição nelas. */
      retainParsedDxf: true,
    });
    viewerRef.current = viewer;
    segmentosRef.current = [];

    function onPointerDown(evt: Event) {
      const detail = (evt as CustomEvent).detail;
      if (!medindoRef.current || !detail?.domEvent || !detail.position) {
        return;
      }
      if (detail.domEvent.button !== 0) return;

      pointerDownRef.current = {
        ponto: { x: detail.position.x, y: detail.position.y },
        clientX: detail.domEvent.clientX,
        clientY: detail.domEvent.clientY,
      };
    }

    function onPointerUp(evt: Event) {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down || !medindoRef.current) return;

      const detail = (evt as CustomEvent).detail;
      if (!detail?.domEvent) return;

      /* Só registra como clique (ponto de medição) se o mouse quase não se
       * moveu entre pointerdown/pointerup — caso contrário foi um arraste
       * para mover a visualização (pan), não uma marcação de ponto. */
      const deslocamento = Math.hypot(
        detail.domEvent.clientX - down.clientX,
        detail.domEvent.clientY - down.clientY
      );
      if (deslocamento > 4) return;

      /* Sempre encaixa o clique na aresta mais próxima do desenho — a
       * medição nunca parte do pixel exato clicado, e sim de um ponto real
       * da geometria (linha, polilinha, arco ou círculo). */
      const encaixado = encontrarPontoNaAresta(
        down.ponto,
        segmentosRef.current
      );

      /* Primeiro clique de uma medição nova, encaixado num arco/círculo:
       * mostra o raio/diâmetro direto, sem precisar de um segundo ponto. */
      if (!primeiroPontoRef.current && encaixado?.arco) {
        registrarMedicaoDeArco(encaixado.arco);
        return;
      }

      registrarPontoMedicao(encaixado?.ponto ?? down.ponto);
    }

    viewer.Subscribe("pointerdown", onPointerDown);
    viewer.Subscribe("pointerup", onPointerUp);

    const url = `/api/integra-lantek/dxf-conteudo?caminho=${encodeURIComponent(
      caminho
    )}`;

    viewer
      .Load({ url })
      .then(() => {
        if (cancelado) return;

        const dxfParseado = (
          viewer as unknown as { GetDxf(): unknown }
        ).GetDxf();
        const origem = viewer.GetOrigin();
        segmentosRef.current = extrairSegmentosDoDxf(dxfParseado, {
          x: origem.x,
          y: origem.y,
        });

        setStatus("pronto");
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        setStatus("erro");
        setErro(
          err instanceof Error ? err.message : "Erro ao carregar o DXF."
        );
      });

    return () => {
      cancelado = true;
      viewer.Unsubscribe("pointerdown", onPointerDown);
      viewer.Unsubscribe("pointerup", onPointerUp);
      viewerRef.current = null;
      grupoMedicaoRef.current = null;
      segmentosRef.current = [];
      viewer.Destroy();
      container.replaceChildren();
    };
  }, [open, caminho, registrarPontoMedicao, registrarMedicaoDeArco]);

  const temMedicaoParaLimpar =
    aguardandoSegundoPonto || distancia !== null || medidaArco !== null;

  return (
    <div className={styles.pane}>
      <div className={styles.paneHeader}>
        <span>DXF</span>
        <span className={styles.paneHint}>
          arraste para mover · scroll para zoom
        </span>
      </div>

      <div className={styles.paneBody}>
        {/* IMPORTANTE: não usar position:absolute aqui — o construtor do
         * DxfViewer força position:relative via inline style neste elemento,
         * o que sobrescreveria um position:absolute do CSS e zeraria a
         * altura da div (o canvas filho vira absolute e sai do fluxo). */}
        <div ref={containerRef} className={styles.viewerCanvas} />

        <div className={styles.medicaoFlutuante}>
          <div className={styles.medicaoFlutuanteLinha}>
            <button
              type="button"
              onClick={alternarMedicao}
              className={`${styles.medirButton} ${
                medindo ? styles.medirButtonAtivo : ""
              }`}
              disabled={status !== "pronto"}
            >
              {medindo ? "Medindo" : "Medir"}
            </button>

            {medindo && temMedicaoParaLimpar && (
              <button
                type="button"
                onClick={limparMedicaoAtual}
                className={styles.medicaoLimparButton}
                title="Limpar medição"
                aria-label="Limpar medição"
              >
                ✕
              </button>
            )}
          </div>

          {medindo && (
            <span className={styles.medicaoResultado}>
              {medidaArco
                ? formatarMedidaArco(medidaArco)
                : distancia !== null
                  ? formatarDistancia(distancia)
                  : aguardandoSegundoPonto
                    ? "Clique no 2º ponto"
                    : "Clique num ponto (curva mostra raio direto)"}
            </span>
          )}
        </div>

        {status === "carregando" && (
          <div className={styles.overlayState}>Carregando desenho...</div>
        )}

        {status === "erro" && (
          <div className={`${styles.overlayState} ${styles.overlayError}`}>
            <span>Não foi possível carregar o DXF.</span>
            {erro ? (
              <span className={styles.overlayErrorDetail}>{erro}</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPane({
  open,
  codigo,
  codDesenho,
}: {
  open: boolean;
  codigo: string;
  codDesenho?: string;
}) {
  const [status, setStatus] = useState<Status>("carregando");
  const [erro, setErro] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open || !codigo) return;

    let cancelado = false;

    const nomeArquivo = `${encodeURIComponent(codigo)}.pdf`;
    const params = new URLSearchParams();
    if (codDesenho) params.set("codDesenho", codDesenho);
    const query = params.toString();
    const rota = `/api/integra-lantek/desenho-pdf/${nomeArquivo}${query ? `?${query}` : ""}`;

    fetch(rota, { method: "HEAD" })
      .then((res) => {
        if (cancelado) return;

        if (!res.ok) {
          setStatus("erro");
          setErro("Nenhum PDF encontrado para este código.");
          return;
        }

        setUrl(rota);
        setStatus("pronto");
      })
      .catch(() => {
        if (!cancelado) {
          setStatus("erro");
          setErro("Erro ao buscar o PDF.");
        }
      });

    return () => {
      cancelado = true;
    };
  }, [open, codigo, codDesenho]);

  return (
    <div className={styles.pane}>
      <div className={styles.paneHeader}>
        <span>PDF (Desenho técnico)</span>
        <span className={styles.paneHint}>
          use os controles do navegador para navegar e dar zoom
        </span>
      </div>

      <div className={styles.paneBody}>
        {status === "pronto" && url && (
          <iframe
            src={url}
            className={styles.pdfFrame}
            title="Desenho técnico em PDF"
          />
        )}

        {status === "carregando" && (
          <div className={styles.overlayState}>Buscando PDF...</div>
        )}

        {status === "erro" && (
          <div className={`${styles.overlayState} ${styles.overlayError}`}>
            {erro}
          </div>
        )}
      </div>
    </div>
  );
}
