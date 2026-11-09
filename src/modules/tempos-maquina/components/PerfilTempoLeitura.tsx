"use client";

import { Stack } from "@/components/ui/Stack";

import type { PerfilTempo } from "@/lib/tempos-maquina/tipos";

import { textoDeNumero } from "../utils/perfil-form";
import styles from "./admin/TemposMaquina.module.css";

/* Parâmetros de um perfil, só para consulta (Roteiro de Fabricação: "Consultar tempos"). */
export function PerfilTempoLeitura({ perfil }: { perfil: PerfilTempo }) {
  if (perfil.metodo === "corte_cnc") {
    const rotuloVariante = (chave: string) => perfil.variantes.find((v) => v.chave === chave)?.rotulo ?? chave;
    const dados: [string, string][] = [
      ["Chapa padrão", `${textoDeNumero(perfil.chapaPadrao.larguraMm)} x ${textoDeNumero(perfil.chapaPadrao.comprimentoMm)} mm`],
      ["Velocidade no vazio", `${textoDeNumero(perfil.velocidadeVazioMmMin)} mm/min`],
      ["Entrada + saída por furo", `${textoDeNumero(perfil.entradaSaidaMm)} mm`],
      ["Aproximação por entrada", `${textoDeNumero(perfil.aproximacaoPorEntradaMin * 60, 3)} s`],
      ...perfil.temposPorChapa.map((t): [string, string] => [`${t.rotulo} (por chapa)`, `${textoDeNumero(t.minutos)} min`]),
      ...(perfil.limpezaBicoMin !== null ? [["Limpeza do bico", `${textoDeNumero(perfil.limpezaBicoMin)} min`] as [string, string]] : []),
    ];

    return (
      <Stack gap={12}>
        <dl className={styles.referencias}>
          {dados.map(([rotulo, valor]) => (
            <div key={rotulo} className={styles.referencia}>
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.rolagem}>
          <table className={styles.grade}>
            <thead>
              <tr>
                <th>Espessura (mm)</th>
                <th>Variante</th>
                <th>Velocidade (mm/min)</th>
                <th>Pierce (s)</th>
                <th>Espera (s)</th>
                <th>Entradas por limpeza</th>
                <th>Furo mínimo (mm)</th>
              </tr>
            </thead>
            <tbody>
              {perfil.linhas.map((l) => (
                <tr key={`${l.variante}-${l.espessuraMm}`}>
                  <td>{textoDeNumero(l.espessuraMm)}</td>
                  <td>{rotuloVariante(l.variante)}</td>
                  <td>{textoDeNumero(l.velocidadeMmMin)}</td>
                  <td>{textoDeNumero(l.pierceMin * 60, 3)}</td>
                  <td>{textoDeNumero(l.esperaMin * 60, 3)}</td>
                  <td>{l.piercesPorLimpeza ?? "—"}</td>
                  <td>{l.diametroMinimoFuroMm !== null ? textoDeNumero(l.diametroMinimoFuroMm, 2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Stack>
    );
  }

  return (
    <Stack gap={16}>
      {perfil.faixas.map((faixa) => (
        <section key={faixa.rotulo} className={styles.secao}>
          <h3 className={styles.secaoTitulo}>
            {faixa.rotulo} (até {textoDeNumero(faixa.espessuraAteMm)} mm) · minutos
          </h3>
          <div className={styles.rolagem}>
            <table className={styles.grade}>
              <thead>
                <tr>
                  <th>Larg. \ Comp.</th>
                  {faixa.comprimentos.map((c) => (
                    <th key={c}>{textoDeNumero(c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {faixa.larguras.map((l, il) => (
                  <tr key={l}>
                    <td className={styles.rotuloLinha}>{textoDeNumero(l)}</td>
                    {faixa.comprimentos.map((c, ic) => (
                      <td key={c} style={{ textAlign: "right" }}>
                        {textoDeNumero(faixa.tempos[il]?.[ic], 4)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {perfil.dobra?.regra === "fator" && (
        <p className={styles.texto}>
          Dobra (tempo da tabela x fator): {perfil.dobra.fatores.map((f) => `${f.rotulo} x ${textoDeNumero(f.fator)}`).join(" · ")}
        </p>
      )}
      {perfil.dobra?.regra === "por_dobra" && (
        <p className={styles.texto}>Dobra: cada dobra soma {textoDeNumero(perfil.dobra.acrescimoPorDobra * 100)}% do tempo da tabela.</p>
      )}
    </Stack>
  );
}
