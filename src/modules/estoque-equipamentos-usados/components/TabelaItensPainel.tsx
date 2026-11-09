"use client";

import { useEffect, useRef, useState } from "react";

import type { PainelItens } from "../types/estoque.types";
import { STATUS_LABELS } from "../utils/rotulos";
import { STATUS_COR } from "./PainelBiPartes";
import styles from "./TabelaItensPainel.module.css";

/*
 * Tabela de itens do BI (TV): um tipo de equipamento, uma página de
 * linhas, com status, com quem está e as informações técnicas marcadas em
 * Administração → Tipos ("Mostrar no BI de itens"). Entra no rodízio do
 * BI padrão, depois do resumo de cada condição (usados/novos).
 */

export type TipoPainelItens = PainelItens["tipos"][number];

export interface PaginaTabelaItens {
  tipo: TipoPainelItens;
  linhas: TipoPainelItens["linhas"];
  paginaDoTipo: number;
  paginasDoTipo: number;
}

/* Quebra cada tipo em páginas de até `linhasPorPagina` linhas. */
export function paginarItens(dados: PainelItens | null | undefined, linhasPorPagina: number): PaginaTabelaItens[] {
  if (!dados) return [];
  return dados.tipos.flatMap((tipo) => {
    const total = Math.max(1, Math.ceil(tipo.linhas.length / linhasPorPagina));
    return Array.from({ length: total }, (_, indice) => ({
      tipo,
      linhas: tipo.linhas.slice(indice * linhasPorPagina, (indice + 1) * linhasPorPagina),
      paginaDoTipo: indice + 1,
      paginasDoTipo: total,
    }));
  });
}

export function TabelaItensPainel({ pagina, rotuloCondicao }: { pagina: PaginaTabelaItens; rotuloCondicao: string }) {
  const { tipo } = pagina;

  /*
   * A tabela fica no tamanho natural (uma linha por célula) e encolhe só o
   * necessário para caber na área -- com muitas colunas marcadas no admin
   * ela diminui em vez de ser cortada. Medido com offsetWidth/Height, que
   * não mudam com as transformações das animações nem da moldura da TV.
   */
  const areaRef = useRef<HTMLDivElement>(null);
  const ajusteRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const area = areaRef.current;
    const ajuste = ajusteRef.current;
    if (!area || !ajuste) return;
    const observador = new ResizeObserver(() => {
      const fator = Math.min(1, area.clientWidth / ajuste.offsetWidth, area.clientHeight / ajuste.offsetHeight);
      setEscala(Number.isFinite(fator) && fator > 0 ? fator : 1);
    });
    observador.observe(area);
    observador.observe(ajuste);
    return () => observador.disconnect();
  }, []);

  return (
    <section className={styles.cartao}>
      <header className={styles.cartaoTopo}>
        <h2 className={styles.tipoNome}>
          {tipo.tipoNome} ({rotuloCondicao})
        </h2>
        <span className={styles.tipoResumo}>
          {tipo.linhas.length} {tipo.linhas.length === 1 ? "equipamento" : "equipamentos"}
          {pagina.paginasDoTipo > 1 && ` · página ${pagina.paginaDoTipo} de ${pagina.paginasDoTipo}`}
        </span>
      </header>

      {tipo.colunas.length === 0 && (
        <p className={styles.aviso}>
          Nenhuma informação técnica marcada para este tipo. Marque em Administração → Tipos de equipamento → campo →
          &quot;Mostrar no BI de itens&quot;.
        </p>
      )}

      <div ref={areaRef} className={styles.tabelaArea}>
        <div ref={ajusteRef} className={styles.tabelaAjuste} style={{ transform: `scale(${escala})` }}>
          <table className={styles.tabela}>
            <thead>
              <tr>
                <th className={styles.colNumero}>Nº</th>
                <th>Descrição</th>
                <th>Status</th>
                {tipo.colunas.map((coluna) => (
                  <th key={coluna.chave}>{coluna.rotulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagina.linhas.map((linha) => (
                <tr key={linha.id}>
                  <td className={styles.colNumero}>#{linha.numero}</td>
                  <td className={styles.descricao}>{linha.descricao}</td>
                  <td>
                    <span className={styles.status}>
                      <span className={styles.statusPonto} style={{ background: STATUS_COR[linha.status] }} />
                      {STATUS_LABELS[linha.status]}
                    </span>
                    {linha.comQuem && (
                      <span className={styles.comQuem} title={linha.comQuem}>
                        {linha.comQuem}
                      </span>
                    )}
                  </td>
                  {tipo.colunas.map((coluna) => (
                    <td key={coluna.chave}>{linha.valores[coluna.chave] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
