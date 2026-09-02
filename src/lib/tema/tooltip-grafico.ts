import type { CSSProperties } from "react";

/*
 * O <Tooltip /> do recharts vem com estilo inline fixo e nunca muda com o
 * tema: fundo sempre "#fff" (contentStyle) e o texto de cada item sempre
 * "#000" (itemStyle) — só o "label" (o título dentro do tooltip, ex: nome
 * da categoria) não tem cor própria nenhuma e por isso herda a cor de texto
 * do body, que em modo escuro fica clara. Resultado: label quase branco
 * sobre uma caixa que continua branca — ilegível. Usar essas 3 props em
 * todo <Tooltip /> do portal resolve isso nos dois temas de uma vez.
 * "itemStyle.color" aqui é só o FALLBACK — se a série já define uma cor
 * própria (ex: <Line stroke="var(--primary)">), o recharts sobrescreve
 * esse valor com a cor da série, então não estraga o código de cores já
 * existente nos gráficos.
 */
export const TOOLTIP_GRAFICO_TEMA: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
  },
  labelStyle: {
    color: "var(--text)",
    fontWeight: 600,
  },
  itemStyle: {
    color: "var(--text-soft)",
  },
};
