"use client";

import { Alert } from "@/components/ui/Alert";

import type { ResultadoTempo } from "@/lib/tempos-maquina/tipos";

import styles from "./TemposMaquina.module.css";

export function formatarMinutos(minutos: number, casas = 4): string {
  return minutos.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

/* Resultado do cálculo de tempo: total, composição, o que foi usado, avisos e erros. */
export function ResultadoTempoView({ resultado }: { resultado: ResultadoTempo }) {
  const total = resultado.tempoMin ?? 0;

  return (
    <div className={styles.resultado}>
      {resultado.ok && resultado.tempoMin !== null && (
        <div className={styles.tempoTotal}>
          <span className={styles.tempoNumero}>{formatarMinutos(resultado.tempoMin)}</span>
          <span className={styles.tempoUnidade}>
            min por peça ({formatarMinutos(resultado.tempoMin * 60, 1)} s)
          </span>
        </div>
      )}

      {resultado.erros.length > 0 && (
        <Alert variant="danger" title="Não deu para calcular">
          <ul className={styles.lista}>
            {resultado.erros.map((erro) => (
              <li key={erro}>{erro}</li>
            ))}
          </ul>
        </Alert>
      )}

      {resultado.avisos.length > 0 && (
        <Alert variant="warning" title="Atenção">
          <ul className={styles.lista}>
            {resultado.avisos.map((aviso) => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
        </Alert>
      )}

      {resultado.parcelas.length > 0 && (
        <div className={styles.rolagem}>
          <table className={styles.grade}>
            <thead>
              <tr>
                <th>Parcela</th>
                <th style={{ textAlign: "right" }}>Minutos</th>
                <th style={{ width: "35%" }}>Peso no total</th>
              </tr>
            </thead>
            <tbody>
              {resultado.parcelas.map((parcela) => (
                <tr key={parcela.chave}>
                  <td>{parcela.rotulo}</td>
                  <td style={{ textAlign: "right" }}>{formatarMinutos(parcela.minutos)}</td>
                  <td>
                    <div className={styles.parcelaBarra} aria-hidden>
                      <div
                        className={styles.parcelaBarraValor}
                        style={{ width: `${total > 0 ? Math.min(100, (parcela.minutos / total) * 100) : 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resultado.referencia.length > 0 && (
        <dl className={styles.referencias}>
          {resultado.referencia.map((r) => (
            <div key={r.rotulo} className={styles.referencia}>
              <dt>{r.rotulo}</dt>
              <dd>{r.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
