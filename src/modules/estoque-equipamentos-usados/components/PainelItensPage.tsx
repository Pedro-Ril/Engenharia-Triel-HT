"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { buscarPainelItens } from "../services/estoque.service";
import type { CondicaoEquipamento } from "../types/estoque.types";
import { CabecalhoPainel, EstadoPainel, MolduraEscalavel, usePainelDados, usePainelTv } from "./PainelBiPartes";
import { PalcoRodizio, useRodizio } from "./RodizioPaginas";
import { paginarItens, TabelaItensPainel } from "./TabelaItensPainel";
import estilosBi from "./PainelBiEstoquePage.module.css";

const TEMPO_PADRAO_S = 20;
const LINHAS_PADRAO = 15;

/*
 * BI de itens para TV: só as tabelas de itens (ver TabelaItensPainel), de
 * usados ou de novos. Quando não cabe numa tela, troca de página sozinho.
 * URL: ?tempo=30 (segundos por página), ?linhas=15 (linhas por página).
 * O BI padrão (/painel) já alterna o resumo com essas tabelas.
 */
export function PainelItensPage({ condicao }: { condicao: CondicaoEquipamento }) {
  const searchParams = useSearchParams();
  const tv = usePainelTv();
  const buscar = useCallback(() => buscarPainelItens(condicao), [condicao]);
  const { dados, erro } = usePainelDados(buscar);

  const tempoUrl = Number(searchParams.get("tempo"));
  const tempoS = Number.isFinite(tempoUrl) && tempoUrl >= 5 && tempoUrl <= 600 ? tempoUrl : TEMPO_PADRAO_S;
  const linhasUrl = Number(searchParams.get("linhas"));
  const linhasPorPagina = Number.isInteger(linhasUrl) && linhasUrl >= 4 && linhasUrl <= 30 ? linhasUrl : LINHAS_PADRAO;

  const paginas = useMemo(() => paginarItens(dados, linhasPorPagina), [dados, linhasPorPagina]);

  const rodizio = useRodizio(paginas.length, tempoS);

  if (!dados) return <EstadoPainel erro={erro} />;

  const titulo = condicao === "novo" ? "Equipamentos Novos · Itens" : "Equipamentos Usados · Itens";
  const { indice, contador } = rodizio;
  const pagina = paginas[indice];

  const indicador = paginas.length > 1 && (
    <div className={estilosBi.paginaIndicador} aria-live="polite">
      <span className={estilosBi.paginaNumero}>
        {indice + 1}/{paginas.length}
      </span>
      <span className={estilosBi.paginaTitulo}>{pagina?.tipo.tipoNome}</span>
      <span className={estilosBi.paginaProgressoFundo}>
        {/* key reinicia a animação a cada troca de página */}
        <span key={contador} className={estilosBi.paginaProgresso} style={{ animationDuration: `${tempoS}s` }} />
      </span>
    </div>
  );

  return (
    <MolduraEscalavel>
      <div className={estilosBi.painel}>
        <CabecalhoPainel tv={tv} subtitulo={titulo} extra={indicador} />
        {pagina ? (
          <PalcoRodizio rodizio={rodizio} renderPagina={(i) => <TabelaItensPainel pagina={paginas[i]} />} />
        ) : (
          <div className={estilosBi.estadoVazio}>
            <p>Nenhum equipamento {condicao === "novo" ? "novo" : "usado"} no estoque agora.</p>
          </div>
        )}
      </div>
    </MolduraEscalavel>
  );
}
