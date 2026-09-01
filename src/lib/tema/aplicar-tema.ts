import type { TemaPreferencia } from "@/modules/minha-conta/types/minhaConta.types";

export interface OrigemTransicaoTema {
  x: number;
  y: number;
}

export const COOKIE_TEMA = "portal_tema";
const COOKIE_TEMA_MAX_AGE_SEGUNDOS = 60 * 60 * 24 * 365;

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
 * Guarda a preferência de tema num cookie NÃO-httpOnly (lido pelo
 * servidor via next/headers `cookies()`, mas escrito daqui, no
 * cliente) — sobrevive independente de sessão de login. É o que
 * permite que alguém que escolheu "escuro" (ou "sistema") continue
 * vendo esse tema mesmo depois que o login expira e o portal deixa
 * de saber quem é essa pessoa (ver src/app/layout.tsx).
 */
export function persistirTemaEmCookie(tema: TemaPreferencia): void {
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_TEMA}=${tema}; Path=/; Max-Age=${COOKIE_TEMA_MAX_AGE_SEGUNDOS}; SameSite=Lax${seguro}`;
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

  persistirTemaEmCookie(tema);

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
