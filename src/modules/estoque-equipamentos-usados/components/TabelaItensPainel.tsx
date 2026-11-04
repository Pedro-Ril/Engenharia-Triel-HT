"use client";

import type { PainelItens } from "../types/estoque.types";
import { STATUS_LABELS } from "../utils/rotulos";
import { STATUS_COR } from "./PainelBiPartes";
import styles from "./PainelItensPage.module.css";

/*
 * Tabela de itens do BI (TV): um tipo de equipamento, uma página de
 * linhas, com status, com quem está e as informações técnicas marcadas em
 * Administração → Tipos ("Mostrar no BI de itens"). Usada pelo BI padrão
 * (rodízio com o resumo) e pelas páginas /painel/usados e /painel/novos.
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

export function TabelaItensPainel({ pagina }: { pagina: PaginaTabelaItens }) {
  const { tipo } = pagina;

  return (
    <section className={styles.cartao}>
      <header className={styles.cartaoTopo}>
        <h2 className={styles.tipoNome}>{tipo.tipoNome}</h2>
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

      <div className={styles.tabelaArea}>
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
                  {linha.comQuem && <span className={styles.comQuem}>{linha.comQuem}</span>}
                </td>
                {tipo.colunas.map((coluna) => (
                  <td key={coluna.chave}>{linha.valores[coluna.chave] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
