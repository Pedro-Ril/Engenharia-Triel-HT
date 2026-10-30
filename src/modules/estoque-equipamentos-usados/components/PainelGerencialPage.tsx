"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { buscarPainelGerencial } from "../services/estoque.service";
import { PaginaValorTempo } from "./PaginaValorTempo";
import {
  CabecalhoPainel,
  EstadoPainel,
  MolduraEscalavel,
  PaginaQuantidade,
  usePainelDados,
  usePainelTv,
} from "./PainelBiPartes";
import styles from "./PainelBiEstoquePage.module.css";

const PAGINAS = ["Onde está o estoque", "Quanto vale e há quanto tempo"];
const TEMPO_PADRAO_S = 60;

/*
 * Painel gerencial de Equipamentos Usados para TV: duas páginas que se
 * revezam (padrão 60 s cada). A 1 é a mesma do painel de BI (quantidades);
 * a 2 aprofunda cada quadro em valor e tempo. URL: ?tempo=45 muda o tempo
 * de cada página; ?pagina=1 ou 2 fixa uma página (sem rodízio).
 */
export function PainelGerencialPage() {
  const searchParams = useSearchParams();
  const tv = usePainelTv();
  const { dados, erro } = usePainelDados(buscarPainelGerencial);

  const tempoUrl = Number(searchParams.get("tempo"));
  const tempoS = Number.isFinite(tempoUrl) && tempoUrl >= 10 && tempoUrl <= 600 ? tempoUrl : TEMPO_PADRAO_S;
  const paginaFixa = searchParams.get("pagina") === "1" ? 0 : searchParams.get("pagina") === "2" ? 1 : null;
  const [paginaAtual, setPaginaAtual] = useState(0);
  const pagina = paginaFixa ?? paginaAtual;

  useEffect(() => {
    if (paginaFixa !== null) return;
    const intervalo = setInterval(() => setPaginaAtual((p) => (p + 1) % PAGINAS.length), tempoS * 1000);
    return () => clearInterval(intervalo);
  }, [paginaFixa, tempoS]);

  if (!dados) return <EstadoPainel erro={erro} />;

  const indicador = (
    <div className={styles.paginaIndicador} aria-live="polite">
      <span className={styles.paginaNumero}>
        {pagina + 1}/{PAGINAS.length}
      </span>
      <span className={styles.paginaTitulo}>{PAGINAS[pagina]}</span>
      {paginaFixa === null && (
        <span className={styles.paginaProgressoFundo}>
          {/* key reinicia a animação a cada troca de página */}
          <span key={pagina} className={styles.paginaProgresso} style={{ animationDuration: `${tempoS}s` }} />
        </span>
      )}
    </div>
  );

  return (
    <MolduraEscalavel>
      <div className={styles.painel}>
        <CabecalhoPainel tv={tv} subtitulo="Estoque de Equipamentos Usados · Gerencial" extra={indicador} />
        {pagina === 0 ? <PaginaQuantidade dados={dados.quantidade} /> : <PaginaValorTempo dados={dados.gerencial} />}
      </div>
    </MolduraEscalavel>
  );
}
