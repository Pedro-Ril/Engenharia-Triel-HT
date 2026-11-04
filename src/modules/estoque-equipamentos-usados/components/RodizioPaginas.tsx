"use client";

import { useEffect, useState, type ReactNode } from "react";

import styles from "./RodizioPaginas.module.css";

/* Tempo que a página que sai fica na tela (a animação de saída e a cortina cabem nele). */
const DURACAO_TROCA_MS = 1100;

/*
 * Rodízio de páginas da TV: avança a cada `tempoS` segundos e guarda,
 * durante a troca, qual página está saindo -- para as duas ficarem na
 * tela ao mesmo tempo (uma saindo, outra entrando).
 */
export function useRodizio(total: number, tempoS: number) {
  const [estado, setEstado] = useState<{ contador: number; anterior: number | null }>({ contador: 0, anterior: null });

  useEffect(() => {
    if (total <= 1) return;
    let fimDaTroca: ReturnType<typeof setTimeout> | undefined;
    const intervalo = setInterval(() => {
      setEstado((atual) => ({ contador: atual.contador + 1, anterior: atual.contador }));
      clearTimeout(fimDaTroca);
      fimDaTroca = setTimeout(() => setEstado((atual) => ({ ...atual, anterior: null })), DURACAO_TROCA_MS);
    }, tempoS * 1000);
    return () => {
      clearInterval(intervalo);
      clearTimeout(fimDaTroca);
    };
  }, [total, tempoS]);

  return {
    contador: estado.contador,
    indice: total ? estado.contador % total : 0,
    contadorAnterior: estado.anterior,
    indiceAnterior: total && estado.anterior !== null ? estado.anterior % total : null,
  };
}

/*
 * Palco das páginas: a que sai desliza para a esquerda e desfoca, uma
 * cortina com o gradiente da marca atravessa a tela, e a nova entra pela
 * direita com os blocos (indicadores, cards, linhas da tabela) em cascata.
 * Sem animação para quem pede menos movimento no sistema.
 */
export function PalcoRodizio({
  rodizio,
  renderPagina,
}: {
  rodizio: ReturnType<typeof useRodizio>;
  renderPagina: (indice: number) => ReactNode;
}) {
  const emTroca = rodizio.contadorAnterior !== null && rodizio.indiceAnterior !== null;

  return (
    <div className={styles.palco}>
      {emTroca && (
        <div key={`saindo-${rodizio.contadorAnterior}`} className={`${styles.camada} ${styles.saindo}`} aria-hidden>
          {renderPagina(rodizio.indiceAnterior as number)}
        </div>
      )}
      <div key={`entrando-${rodizio.contador}`} className={`${styles.camada} ${styles.entrando}`}>
        {renderPagina(rodizio.indice)}
      </div>
      {emTroca && <div key={`cortina-${rodizio.contador}`} className={styles.cortina} aria-hidden />}
    </div>
  );
}
