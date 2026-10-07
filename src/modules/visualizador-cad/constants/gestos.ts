/*
 * Como o mouse controla a câmera do visualizador.
 *
 * Quem passa o dia no SolidWorks tem o gesto na memória muscular: lá o
 * botão esquerdo é só seleção e quem gira é a roda pressionada. O modo
 * padrão daqui é o da maioria dos visualizadores web (arrastar com o
 * esquerdo gira), que é o que quem não vem do SolidWorks espera.
 *
 * Fica por usuário, em Minha conta > Configurações.
 */

export type ModoGestos = "padrao" | "solidworks";

export const MODO_GESTOS_PADRAO: ModoGestos = "padrao";

/* Chave no store genérico de preferência por módulo. */
export const CHAVE_PREFERENCIA_GESTOS = "visualizador-cad:gestos";

export function ehModoGestos(valor: unknown): valor is ModoGestos {
  return valor === "padrao" || valor === "solidworks";
}

/* Usado no RadioGroup de Minha conta. */
export const OPCOES_MODO_GESTOS: {
  value: ModoGestos;
  label: string;
  description: string;
}[] = [
  {
    value: "padrao",
    label: "Padrão",
    description:
      "Arrastar com o botão esquerdo gira · roda aproxima · botão do meio desloca.",
  },
  {
    value: "solidworks",
    label: "SolidWorks",
    description:
      "Roda pressionada gira · Ctrl + roda desloca · Shift + roda aproxima · Alt + roda inclina · duplo clique na roda enquadra · girar a roda para frente afasta · os botões esquerdo e direito não mexem a câmera.",
  },
];

/* O lembrete que aparece no rodapé do visualizador. */
export function dicaDeGestos(modo: ModoGestos): string {
  return modo === "solidworks"
    ? "Roda gira · Ctrl desloca · Shift aproxima · Alt inclina · duplo clique enquadra"
    : "Arrastar gira · Scroll aproxima · Botão do meio desloca";
}
