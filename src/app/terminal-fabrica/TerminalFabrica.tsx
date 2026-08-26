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
import { PdfViewerKiosk } from "@/modules/terminal-fabrica/components/PdfViewerKiosk";
import { buscarItemInfo } from "@/modules/terminal-fabrica/services/itemInfo.service";
import type { ItemInfoTerminal } from "@/modules/terminal-fabrica/services/itemInfo.service";
import {
  buscarPdfDetalhamentoItem,
  verificarPdfDisponivel,
} from "@/modules/terminal-fabrica/services/pdfKiosk.service";
import { registrarBuscaTerminal } from "@/modules/terminal-fabrica/services/registrarBusca.service";

import styles from "./terminal-fabrica.module.css";

type Overlay = { tipo: "pdf"; data: ArrayBuffer };

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
  const [pdfDisponivel, setPdfDisponivel] = useState<boolean | null>(null);

  const [buscando3D, setBuscando3D] = useState(false);
  const [modelos3D, setModelos3D] = useState<Modelo3DPlay[]>([]);
  const [modelos3DCache, setModelos3DCache] = useState<Modelo3DPlay[] | null>(null);

  const [overlay, setOverlay] = useState<Overlay | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const janela3DRef = useRef<Window | null>(null);
  const timeoutFechar3DRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function fecharJanela3DSeAberta() {
    if (timeoutFechar3DRef.current) {
      clearTimeout(timeoutFechar3DRef.current);
      timeoutFechar3DRef.current = null;
    }

    if (janela3DRef.current && !janela3DRef.current.closed) {
      janela3DRef.current.close();
    }

    janela3DRef.current = null;
  }

  /*
   * O 3DEXPERIENCE não pode ser embutido em iframe (ver
   * abrirModelo3D) — abre numa aba própria. Pra não deixar essa
   * aba acumulando no kiosk, ela fecha sozinha assim que o
   * operador volta a atenção pro terminal (aba/janela original
   * ganha foco de novo), e tem um limite de segurança caso esse
   * evento não dispare por algum motivo.
   */
  useEffect(() => {
    function aoVoltarFoco() {
      if (document.visibilityState === "visible") {
        fecharJanela3DSeAberta();
      }
    }

    window.addEventListener("focus", fecharJanela3DSeAberta);
    document.addEventListener("visibilitychange", aoVoltarFoco);

    return () => {
      window.removeEventListener("focus", fecharJanela3DSeAberta);
      document.removeEventListener("visibilitychange", aoVoltarFoco);
      if (timeoutFechar3DRef.current) clearTimeout(timeoutFechar3DRef.current);
    };
  }, []);

  useEffect(() => {
    if (!overlay) {
      inputRef.current?.focus();
    }
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
    setPdfDisponivel(null);
    setModelos3DCache(null);

    try {
      const resultado = await buscarItemInfo(codigoLimpo);
      setItem(resultado);
      registrarBuscaTerminal(codigoLimpo, true);
      verificarDisponibilidade(resultado);
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

  /*
   * Nem todo item tem 2D e 3D ao mesmo tempo — verifica os dois em
   * paralelo, em segundo plano, pra já mostrar ao operador qual
   * opção não está disponível em vez de deixar ele clicar e só
   * descobrir depois. Falha na própria checagem (rede instável,
   * etc.) não desabilita o botão — só fica "desconhecido" e deixa
   * o clique normal (com seu próprio tratamento de erro) decidir.
   */
  function verificarDisponibilidade(itemEncontrado: ItemInfoTerminal) {
    verificarPdfDisponivel(itemEncontrado.codigo)
      .then(setPdfDisponivel)
      .catch(() => setPdfDisponivel(null));

    if (itemEncontrado.revisao) {
      buscarModelos3DPlay(itemParaBusca3D(itemEncontrado))
        .then(setModelos3DCache)
        .catch(() => setModelos3DCache(null));
    }
  }

  function handleNovaConsulta() {
    setCodigo("");
    setItem(null);
    setErro(null);
    setModelos3D([]);
    setPdfDisponivel(null);
    setModelos3DCache(null);
    inputRef.current?.focus();
  }

  async function handleVerPdf() {
    if (!item) return;

    setErro(null);
    setCarregandoPdf(true);

    try {
      const data = await buscarPdfDetalhamentoItem(item.codigo);
      setOverlay({ tipo: "pdf", data });
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

    /* A verificação de disponibilidade em segundo plano já buscou isso — reaproveita em vez de consultar de novo. */
    if (modelos3DCache !== null) {
      abrirOuListarModelos3D(modelos3DCache);
      return;
    }

    setBuscando3D(true);
    setModelos3D([]);

    try {
      const resultados = await buscarModelos3DPlay(itemParaBusca3D(item));
      setModelos3DCache(resultados);
      abrirOuListarModelos3D(resultados);
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

  function abrirOuListarModelos3D(resultados: Modelo3DPlay[]) {
    if (resultados.length === 0) {
      setErro("Nenhum modelo 3D encontrado para este item e revisão.");
      return;
    }

    if (resultados.length === 1) {
      abrirModelo3D(resultados[0]);
      return;
    }

    setModelos3D(resultados);
  }

  /*
   * Nunca embutir o 3DEXPERIENCE num iframe — o login dele usa CAS
   * (SSO), que grava cookie de sessão a cada ticket validado; num
   * iframe (contexto de terceiro) o navegador bloqueia esse
   * cookie, e o login entra num loop infinito (dashboard → login
   * → dashboard → ...) até cair numa tela em branco, sem nenhum
   * erro visível. Abrindo numa aba de verdade (contexto de
   * primeira parte) o mesmo login funciona normalmente — testado e
   * confirmado.
   */
  function abrirModelo3D(modelo: Modelo3DPlay) {
    const url = montarUrl3DPlay(modelo);
    setModelos3D([]);

    /*
     * Nunca embutir o 3DEXPERIENCE num iframe — testado e
     * confirmado: mesmo com uma sessão já autenticada, o cookie de
     * sessão dele (SameSite=Lax) nunca é enviado numa requisição
     * de iframe vindo de outra origem, então o login entra num
     * loop infinito (dashboard → login → dashboard → ...) até
     * sobrar uma tela em branco, sem erro nenhum. Abrindo numa aba
     * de verdade (contexto de primeira parte) o mesmo login
     * funciona normalmente.
     *
     * Sem `noopener`, de propósito — precisamos da referência pra
     * fechar essa aba sozinha quando o operador voltar a atenção
     * pro terminal (ver fecharJanela3DSeAberta), já que o objetivo
     * é kiosk/tela cheia sem abas acumulando.
     */
    fecharJanela3DSeAberta();
    janela3DRef.current = window.open(url, "_blank");

    timeoutFechar3DRef.current = setTimeout(fecharJanela3DSeAberta, 5 * 60 * 1000);
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
          <strong>Portal Grupo Triel-HT</strong>
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

          {(item.descricao || item.titulo) && (
            <p className={styles.itemDescricao}>
              {item.descricao || item.titulo}
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
              disabled={carregandoPdf || pdfDisponivel === false}
            >
              <span className={styles.acaoIconWrap}>
                {carregandoPdf ? (
                  <Loader2 className={styles.spin} size={26} />
                ) : (
                  <FileText size={26} />
                )}
              </span>

              <span className={styles.acaoTextos}>
                <strong>{carregandoPdf ? "Abrindo..." : "Ver desenho"}</strong>
                <span>
                  {pdfDisponivel === false
                    ? "Nenhum desenho disponível para este item"
                    : "Todas as folhas em PDF"}
                </span>
              </span>
            </button>

            <button
              type="button"
              className={styles.acaoBotao}
              onClick={handleVer3D}
              disabled={buscando3D || modelos3DCache?.length === 0}
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
                <span>
                  {modelos3DCache?.length === 0
                    ? "Nenhum modelo 3D disponível para este item"
                    : "Abre em nova aba no 3DEXPERIENCE"}
                </span>
              </span>
            </button>
          </div>

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
        <PdfViewerKiosk data={overlay.data} itemCodigo={item?.codigo} onFechar={fecharOverlay} />
      )}
    </div>
  );
}
