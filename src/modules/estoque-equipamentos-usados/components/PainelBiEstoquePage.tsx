"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { buscarPainelBiEstoque, buscarPainelItens } from "../services/estoque.service";
import type { CondicaoEquipamento, PainelBiEstoque, PainelItens } from "../types/estoque.types";
import {
  CabecalhoPainel,
  EstadoPainel,
  MolduraEscalavel,
  PaginaQuantidade,
  usePainelDados,
  usePainelTv,
} from "./PainelBiPartes";
import { PalcoRodizio, useRodizio } from "./RodizioPaginas";
import { paginarItens, TabelaItensPainel, type PaginaTabelaItens } from "./TabelaItensPainel";
import styles from "./PainelBiEstoquePage.module.css";

const TEMPO_PADRAO_S = 60;
const LINHAS_PADRAO = 10;
const ROTULO_CONDICAO: Record<CondicaoEquipamento, string> = { usado: "Usados", novo: "Novos" };

interface DadosBi {
  resumo: Partial<Record<CondicaoEquipamento, PainelBiEstoque>>;
  itens: Partial<Record<CondicaoEquipamento, PainelItens>>;
}

type Pagina =
  | { tipo: "resumo"; condicao: CondicaoEquipamento; dados: PainelBiEstoque }
  | { tipo: "itens"; condicao: CondicaoEquipamento; pagina: PaginaTabelaItens };

/*
 * BI padrão do estoque de equipamentos (TV). Alterna as páginas sozinho
 * (padrão 60 s cada): resumo dos usados, as tabelas de itens dos usados
 * (uma por tipo, com as informações técnicas), e o mesmo para os novos --
 * a parte dos novos só entra quando há equipamento novo.
 * URL: ?tempo=90 (segundos por página), ?linhas=15 (linhas por tabela),
 * ?condicao=usado|novo (só um dos dois), ?rodizio=0 (fica no resumo).
 */
export function PainelBiEstoquePage() {
  const searchParams = useSearchParams();
  const tv = usePainelTv();

  const condicaoUrl = searchParams.get("condicao");
  const condicoes = useMemo<CondicaoEquipamento[]>(
    () => (condicaoUrl === "novo" ? ["novo"] : condicaoUrl === "usado" ? ["usado"] : ["usado", "novo"]),
    [condicaoUrl]
  );
  const comTabelas = searchParams.get("rodizio") !== "0";
  const tempoUrl = Number(searchParams.get("tempo"));
  const tempoS = Number.isFinite(tempoUrl) && tempoUrl >= 10 && tempoUrl <= 900 ? tempoUrl : TEMPO_PADRAO_S;
  const linhasUrl = Number(searchParams.get("linhas"));
  const linhasPorPagina = Number.isInteger(linhasUrl) && linhasUrl >= 4 && linhasUrl <= 30 ? linhasUrl : LINHAS_PADRAO;

  /* Resumo e itens de cada condição numa busca só; o resumo dos usados é o que não pode faltar. */
  const buscar = useCallback(async () => {
    try {
      const respostas = await Promise.all(
        condicoes.map(async (condicao) => {
          const [resumo, itens] = await Promise.all([
            buscarPainelBiEstoque(condicao),
            comTabelas ? buscarPainelItens(condicao) : Promise.resolve(null),
          ]);
          return { condicao, resumo, itens };
        })
      );
      const principal = respostas[0];
      if (!principal.resumo.ok || !principal.resumo.data) {
        return { ok: false, message: principal.resumo.message ?? "Não foi possível carregar o painel." };
      }
      const dados: DadosBi = { resumo: {}, itens: {} };
      for (const r of respostas) {
        if (r.resumo.ok && r.resumo.data) dados.resumo[r.condicao] = r.resumo.data;
        if (r.itens?.ok && r.itens.data) dados.itens[r.condicao] = r.itens.data;
      }
      return { ok: true, data: dados };
    } catch {
      return { ok: false, message: "Sem conexão com o Portal." };
    }
  }, [condicoes, comTabelas]);
  const { dados, erro } = usePainelDados(buscar);

  const paginas = useMemo<Pagina[]>(() => {
    if (!dados) return [];
    return condicoes.flatMap((condicao) => {
      const resumo = dados.resumo[condicao];
      if (!resumo) return [];
      /* Sem nenhum novo cadastrado, a parte dos novos não entra (a não ser que a URL peça só os novos). */
      if (condicao === "novo" && condicoes.length > 1 && resumo.totalEquipamentos === 0) return [];
      const tabelas: Pagina[] = comTabelas
        ? paginarItens(dados.itens[condicao], linhasPorPagina).map((pagina) => ({ tipo: "itens", condicao, pagina }))
        : [];
      return [{ tipo: "resumo", condicao, dados: resumo } as Pagina, ...tabelas];
    });
  }, [dados, condicoes, comTabelas, linhasPorPagina]);

  const rodizio = useRodizio(paginas.length, tempoS);

  if (!dados || paginas.length === 0) return <EstadoPainel erro={erro} />;

  const { indice, contador } = rodizio;
  const pagina = paginas[indice];
  const tituloPagina = pagina.tipo === "resumo" ? "Resumo" : pagina.pagina.tipo.tipoNome;

  const indicador = paginas.length > 1 && (
    <div className={styles.paginaIndicador} aria-live="polite">
      <span className={styles.paginaNumero}>
        {indice + 1}/{paginas.length}
      </span>
      <span className={styles.paginaTitulo}>
        {ROTULO_CONDICAO[pagina.condicao]} · {tituloPagina}
      </span>
      <span className={styles.paginaProgressoFundo}>
        {/* key reinicia a animação a cada troca de página */}
        <span key={contador} className={styles.paginaProgresso} style={{ animationDuration: `${tempoS}s` }} />
      </span>
    </div>
  );

  return (
    <MolduraEscalavel>
      <div className={styles.painel}>
        <CabecalhoPainel
          tv={tv}
          subtitulo={`Estoque de Equipamentos ${ROTULO_CONDICAO[pagina.condicao]}`}
          extra={indicador}
        />
        <PalcoRodizio
          rodizio={rodizio}
          renderPagina={(i) => {
            const p = paginas[i];
            return p.tipo === "resumo" ? <PaginaQuantidade dados={p.dados} /> : <TabelaItensPainel pagina={p.pagina} />;
          }}
        />
      </div>
    </MolduraEscalavel>
  );
}
