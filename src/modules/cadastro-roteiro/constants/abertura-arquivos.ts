/*
 * Onde o PDF e o 3D do Roteiro de Fabricação abrem.
 *
 * Em aba nova (o padrão, como sempre foi) o desenho fica escondido
 * atrás do portal, na mesma janela. Em janela separada ele ganha uma
 * entrada própria na barra de tarefas, então o ALT + TAB alterna direto
 * entre o portal e o desenho -- e dá para jogar a janela no segundo
 * monitor.
 *
 * Fica por usuário, em Minha conta > Configurações.
 */

export type ModoAberturaArquivos = "aba" | "janela";

export const MODO_ABERTURA_PADRAO: ModoAberturaArquivos = "aba";

/* Chave no store genérico de preferência por módulo. */
export const CHAVE_PREFERENCIA_ABERTURA = "cadastro-roteiro:abertura-arquivos";

export function ehModoAberturaArquivos(valor: unknown): valor is ModoAberturaArquivos {
  return valor === "aba" || valor === "janela";
}

/* Usado no RadioGroup de Minha conta. */
export const OPCOES_MODO_ABERTURA: {
  value: ModoAberturaArquivos;
  label: string;
  description: string;
}[] = [
  {
    value: "aba",
    label: "Nova aba",
    description: "Cada PDF ou 3D abre em uma aba nova, ao lado do portal.",
  },
  {
    value: "janela",
    label: "Janela separada",
    description:
      "Abre numa janela própria, para alternar com ALT + TAB ou levar para outro monitor. Abrir outro PDF substitui o anterior na mesma janela — o 3D tem a sua.",
  },
];
