"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Box,
  FileText,
  Loader2,
  Package,
  PackageSearch,
  RotateCcw,
  ScanLine,
  Search,
  X,
} from "lucide-react";

import {
  buscarModelos3DPlay,
  montarUrl3DPlay,
} from "@/modules/cadastro-roteiro/services/threeDPlay.service";
import type { Modelo3DPlay } from "@/modules/cadastro-roteiro/services/threeDPlay.service";
import type { RoteiroTreeNode } from "@/modules/cadastro-roteiro/types/cadastroRoteiro.types";
import { buscarItemInfo } from "@/modules/terminal-fabrica/services/itemInfo.service";
import type { ItemInfoTerminal } from "@/modules/terminal-fabrica/services/itemInfo.service";
import { buscarPdfDetalhamentoItem } from "@/modules/terminal-fabrica/services/pdfKiosk.service";
import { registrarBuscaTerminal } from "@/modules/terminal-fabrica/services/registrarBusca.service";

import styles from "./terminal-fabrica.module.css";

type Overlay =
  | { tipo: "pdf"; url: string }
  | { tipo: "3d"; url: string; titulo: string };

function itemParaBusca3D(item: ItemInfoTerminal): RoteiroTreeNode {
  return {
    id: item.codigo,
    codigo: item.codigo,
    codigoNormalizado: item.codigo,
    descricaoNormalizada: item.descricao,
    title: item.titulo,
    revisao: item.revisao,
    roteiros: [],
    children: [],
  };
}

export default function TerminalFabrica() {
  const searchParams = useSearchParams();
  const emTelaCheia = searchParams.get("fullscreen") === "1";

  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [item, setItem] = useState<ItemInfoTerminal | null>(null);

  const [carregandoPdf, setCarregandoPdf] = useState(false);
  const [progressoPdf, setProgressoPdf] = useState(0);

  const [buscando3D, setBuscando3D] = useState(false);
  const [modelos3D, setModelos3D] = useState<Modelo3DPlay[]>([]);

  const [overlay, setOverlay] = useState<Overlay | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!overlay) {
      inputRef.current?.focus();
    }
  }, [overlay]);

  useEffect(() => {
    return () => {
      if (overlay?.tipo === "pdf") {
        window.URL.revokeObjectURL(overlay.url);
      }
    };
  }, [overlay]);

  /*
   * Modo tela cheia (?fullscreen=1) — pensado pro terminal
   * físico do chão de fábrica: pede a Fullscreen API do
   * navegador (esconde a barra de endereço, se o navegador
   * permitir) e trava a navegação "para trás" dentro do
   * próprio app. Isso não substitui configurar o navegador do
   * terminal em modo kiosk de verdade (ex: Chrome --kiosk) —
   * é só uma segunda camada, no nível da página, que não
   * depende de configuração no equipamento.
   */
  useEffect(() => {
    if (!emTelaCheia) return;

    document.documentElement
      .requestFullscreen?.()
      .catch(() => {
        /* Alguns navegadores exigem um gesto do usuário; sem problema, ignora. */
      });

    function bloquearMenuContexto(event: MouseEvent) {
      event.preventDefault();
    }

    function travarVoltar() {
      window.history.pushState(null, "", window.location.href);
    }

    function avisarAoSair(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", travarVoltar);
    document.addEventListener("contextmenu", bloquearMenuContexto);
    window.addEventListener("beforeunload", avisarAoSair);

    return () => {
      window.removeEventListener("popstate", travarVoltar);
      document.removeEventListener("contextmenu", bloquearMenuContexto);
      window.removeEventListener("beforeunload", avisarAoSair);
    };
  }, [emTelaCheia]);

  async function handleBuscar(event: React.FormEvent) {
    event.preventDefault();

    const codigoLimpo = codigo.trim();
    if (!codigoLimpo) return;

    setBuscando(true);
    setErro(null);
    setModelos3D([]);

    try {
      const resultado = await buscarItemInfo(codigoLimpo);
      setItem(resultado);
      registrarBuscaTerminal(codigoLimpo, true);
    } catch (error) {
      setItem(null);
      setErro(
        error instanceof Error ? error.message : "Não foi possível localizar o item."
      );
      registrarBuscaTerminal(codigoLimpo, false);
    } finally {
      setBuscando(false);
    }
  }

  function handleNovaConsulta() {
    setCodigo("");
    setItem(null);
    setErro(null);
    setModelos3D([]);
    inputRef.current?.focus();
  }

  async function handleVerPdf() {
    if (!item) return;

    setErro(null);
    setCarregandoPdf(true);
    setProgressoPdf(0);

    try {
      const url = await buscarPdfDetalhamentoItem(item.codigo, setProgressoPdf);
      setOverlay({ tipo: "pdf", url });
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Não foi possível abrir o PDF."
      );
    } finally {
      setCarregandoPdf(false);
    }
  }

  async function handleVer3D() {
    if (!item) return;

    setErro(null);
    setBuscando3D(true);
    setModelos3D([]);

    try {
      const resultados = await buscarModelos3DPlay(itemParaBusca3D(item));

      if (resultados.length === 0) {
        setErro("Nenhum modelo 3D encontrado para este item e revisão.");
        return;
      }

      if (resultados.length === 1) {
        abrirModelo3D(resultados[0]);
        return;
      }

      setModelos3D(resultados);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar o modelo 3D."
      );
    } finally {
      setBuscando3D(false);
    }
  }

  function abrirModelo3D(modelo: Modelo3DPlay) {
    const url = montarUrl3DPlay(modelo);
    setModelos3D([]);
    setOverlay({
      tipo: "3d",
      url,
      titulo: modelo.titulo || modelo.codigo || "Modelo 3D",
    });
  }

  function fecharOverlay() {
    setOverlay(null);
  }

  return (
    <div
      className={`${styles.page} ${emTelaCheia ? styles.telaCheia : ""}`}
    >
      <div className={styles.bgDecor} aria-hidden="true" />

      <div className={styles.marca}>
        <span className={styles.marcaLogo}>HT</span>
        <div className={styles.marcaTextos}>
          <strong>Portal Triel-HT</strong>
          <span>Terminal de Fábrica</span>
        </div>
      </div>

      {!item ? (
        <div key="busca" className={styles.buscaCard}>
          <div className={styles.buscaIconWrap}>
            <PackageSearch size={34} />
          </div>

          <h1 className={styles.titulo}>Consulta de item</h1>
          <p className={styles.subtitulo}>
            Digite o código do item para visualizar o desenho técnico e o
            modelo 3D.
          </p>

          <form className={styles.form} onSubmit={handleBuscar}>
            <div className={styles.inputWrap}>
              <Search className={styles.inputIcon} size={24} />

              <input
                ref={inputRef}
                className={styles.input}
                value={codigo}
                onChange={(event) => setCodigo(event.target.value)}
                placeholder="Código do item"
                autoFocus
                disabled={buscando}
              />
            </div>

            <button
              type="submit"
              className={styles.botaoBuscar}
              disabled={buscando || !codigo.trim()}
            >
              {buscando ? (
                <>
                  <Loader2 className={styles.spin} size={22} />
                  Buscando
                </>
              ) : (
                <>
                  Buscar
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          <span className={styles.dica}>
            <ScanLine size={16} />
            Compatível com leitor de código de barras
          </span>

          {erro && (
            <div className={styles.erroBox}>
              <AlertCircle size={22} />
              {erro}
            </div>
          )}
        </div>
      ) : (
        <div key="item" className={styles.itemCard}>
          <div className={styles.itemIconWrap}>
            <Package size={30} />
          </div>

          <span className={styles.itemEyebrow}>Código do item</span>
          <div className={styles.itemCodigo}>{item.codigo}</div>

          {(item.titulo || item.descricao) && (
            <p className={styles.itemDescricao}>
              {item.titulo || item.descricao}
            </p>
          )}

          {(item.revisao || item.estado) && (
            <div className={styles.badgesRow}>
              {item.revisao && (
                <span className={styles.itemRevisao}>
                  Revisão {item.revisao}
                </span>
              )}
              {item.estado && (
                <span className={styles.itemEstado}>{item.estado}</span>
              )}
            </div>
          )}

          <div className={styles.acoesGrid}>
            <button
              type="button"
              className={styles.acaoBotao}
              onClick={handleVerPdf}
              disabled={carregandoPdf}
            >
              <span className={styles.acaoIconWrap}>
                {carregandoPdf ? (
                  <Loader2 className={styles.spin} size={26} />
                ) : (
                  <FileText size={26} />
                )}
              </span>

              <span className={styles.acaoTextos}>
                <strong>
                  {carregandoPdf
                    ? progressoPdf > 0
                      ? `Abrindo ${progressoPdf}%`
                      : "Abrindo..."
                    : "Ver desenho"}
                </strong>
                <span>Todas as folhas em PDF</span>
              </span>
            </button>

            <button
              type="button"
              className={styles.acaoBotao}
              onClick={handleVer3D}
              disabled={buscando3D}
            >
              <span className={styles.acaoIconWrap}>
                {buscando3D ? (
                  <Loader2 className={styles.spin} size={26} />
                ) : (
                  <Box size={26} />
                )}
              </span>

              <span className={styles.acaoTextos}>
                <strong>{buscando3D ? "Buscando..." : "Ver modelo 3D"}</strong>
                <span>Abrir no 3DEXPERIENCE</span>
              </span>
            </button>
          </div>

          {carregandoPdf && (
            <div className={styles.progressoBarra}>
              <div
                className={styles.progressoPreenchimento}
                style={{ width: `${progressoPdf}%` }}
              />
            </div>
          )}

          {erro && (
            <div className={styles.erroBox}>
              <AlertCircle size={22} />
              {erro}
            </div>
          )}

          <button
            type="button"
            className={styles.novaConsultaBotao}
            onClick={handleNovaConsulta}
          >
            <RotateCcw size={16} />
            Nova consulta
          </button>
        </div>
      )}

      {modelos3D.length > 0 && (
        <div className={styles.overlay}>
          <div className={styles.overlayBarra}>
            <span className={styles.overlayTitulo}>
              {modelos3D.length} modelos encontrados — selecione um
            </span>

            <button
              type="button"
              className={styles.overlayFecharBotao}
              onClick={() => setModelos3D([])}
            >
              <X size={20} />
              Fechar
            </button>
          </div>

          <div className={styles.modeloLista}>
            {modelos3D.map((modelo) => (
              <div key={modelo.physicalId} className={styles.modeloCard}>
                <div className={styles.modeloInfo}>
                  <strong>{modelo.titulo || modelo.codigo}</strong>
                  <span>Revisão: {modelo.revisao || "-"}</span>
                </div>

                <button
                  type="button"
                  className={styles.modeloAbrirBotao}
                  onClick={() => abrirModelo3D(modelo)}
                >
                  Abrir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {overlay && (
        <div className={styles.overlay}>
          <div className={styles.overlayBarra}>
            <span className={styles.overlayTitulo}>
              {overlay.tipo === "pdf"
                ? `Desenho — ${item?.codigo}`
                : overlay.titulo}
            </span>

            <button
              type="button"
              className={styles.overlayFecharBotao}
              onClick={fecharOverlay}
            >
              <X size={20} />
              Fechar
            </button>
          </div>

          <div className={styles.overlayConteudo}>
            <iframe
              key={overlay.url}
              src={overlay.url}
              className={styles.overlayIframe}
              title={overlay.tipo === "pdf" ? "Desenho do item" : "Modelo 3D"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
