import type { TemaPreferencia } from "@/modules/minha-conta/types/minhaConta.types";

export interface OrigemTransicaoTema {
  x: number;
  y: number;
}

function dataThemeParaTema(tema: TemaPreferencia): "light" | "dark" | null {
  if (tema === "claro") return "light";
  if (tema === "escuro") return "dark";
  return null;
}

function definirAtributoTema(dataTheme: "light" | "dark" | null) {
  if (dataTheme === null) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", dataTheme);
  }
}

/*
 * Efeito "gota d'água": um círculo cresce a partir do ponto
 * clicado até cobrir a tela inteira, revelando o novo tema por
 * baixo — usa a View Transitions API nativa (sem lib externa).
 * Sem suporte no navegador (ex: Firefox) ou com
 * prefers-reduced-motion, aplica a troca direto, sem animação.
 */
export function aplicarTemaComTransicao(
  tema: TemaPreferencia,
  origem?: OrigemTransicaoTema
): void {
  const dataTheme = dataThemeParaTema(tema);
  const aplicar = () => definirAtributoTema(dataTheme);

  const semSuporte = typeof document.startViewTransition !== "function";
  const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (semSuporte || semAnimacao) {
    aplicar();
    return;
  }

  const x = origem?.x ?? window.innerWidth / 2;
  const y = origem?.y ?? window.innerHeight / 2;

  const raio = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const root = document.documentElement;
  root.style.setProperty("--tema-origem-x", `${x}px`);
  root.style.setProperty("--tema-origem-y", `${y}px`);
  root.style.setProperty("--tema-raio", `${raio}px`);

  document.startViewTransition(aplicar);
}
