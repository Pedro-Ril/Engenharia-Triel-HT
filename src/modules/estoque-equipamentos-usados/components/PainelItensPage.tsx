"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { buscarPainelItens } from "../services/estoque.service";
import type { CondicaoEquipamento, PainelItens } from "../types/estoque.types";
import { STATUS_LABELS } from "../utils/rotulos";
import { CabecalhoPainel, EstadoPainel, MolduraEscalavel, STATUS_COR, usePainelDados, usePainelTv } from "./PainelBiPartes";
import estilosBi from "./PainelBiEstoquePage.module.css";
import styles from "./PainelItensPage.module.css";

const TEMPO_PADRAO_S = 20;
const LINHAS_PADRAO = 12;

type TipoPainel = PainelItens["tipos"][number];

interface PaginaTabela {
  tipo: TipoPainel;
  linhas: TipoPainel["linhas"];
  paginaDoTipo: number;
  paginasDoTipo: number;
}

/*
 * BI de itens para TV: uma tabela por tipo de equipamento com os itens que
 * não foram baixados e as informações técnicas marcadas em Administração →
 * Tipos ("Mostrar no BI de itens"). Quando não cabe numa tela, troca de
 * página sozinho. URL: ?tempo=30 (segundos por página), ?linhas=15 (linhas
 * por página).
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

  const paginas = useMemo<PaginaTabela[]>(() => {
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
  }, [dados, linhasPorPagina]);

  const [contador, setContador] = useState(0);
  useEffect(() => {
    if (paginas.length <= 1) return;
    const intervalo = setInterval(() => setContador((atual) => atual + 1), tempoS * 1000);
    return () => clearInterval(intervalo);
  }, [paginas.length, tempoS]);

  if (!dados) return <EstadoPainel erro={erro} />;

  const titulo = condicao === "novo" ? "Equipamentos Novos · Itens" : "Equipamentos Usados · Itens";
  const indice = paginas.length ? contador % paginas.length : 0;
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

        {!pagina ? (
          <div className={estilosBi.estadoVazio}>
            <p>Nenhum equipamento {condicao === "novo" ? "novo" : "usado"} no estoque agora.</p>
          </div>
        ) : (
          <section className={styles.cartao}>
            <header className={styles.cartaoTopo}>
              <h2 className={styles.tipoNome}>{pagina.tipo.tipoNome}</h2>
              <span className={styles.tipoResumo}>
                {pagina.tipo.linhas.length} {pagina.tipo.linhas.length === 1 ? "equipamento" : "equipamentos"}
                {pagina.paginasDoTipo > 1 && ` · página ${pagina.paginaDoTipo} de ${pagina.paginasDoTipo}`}
              </span>
            </header>

            {pagina.tipo.colunas.length === 0 && (
              <p className={styles.aviso}>
                Nenhuma informação técnica marcada para este tipo. Marque em Administração → Tipos de equipamento →
                campo → &quot;Mostrar no BI de itens&quot;.
              </p>
            )}

            <div className={styles.tabelaArea}>
              <table className={styles.tabela}>
                <thead>
                  <tr>
                    <th className={styles.colNumero}>Nº</th>
                    <th>Descrição</th>
                    <th>Status</th>
                    {pagina.tipo.colunas.map((coluna) => (
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
                      {pagina.tipo.colunas.map((coluna) => (
                        <td key={coluna.chave}>{linha.valores[coluna.chave] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </MolduraEscalavel>
  );
}
