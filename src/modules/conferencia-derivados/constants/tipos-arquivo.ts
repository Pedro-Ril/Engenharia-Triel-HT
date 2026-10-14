/*
 * Os tipos de arquivo derivado que a conferência sabe procurar. A pasta
 * de cada um vem da administração do módulo; aqui fica só o que é fixo.
 */

export type TipoArquivoDerivado = "pdf" | "dxf" | "step";

export interface DefinicaoTipoArquivo {
  tipo: TipoArquivoDerivado;
  rotulo: string;
  /* Comparada sem diferenciar maiúsculas: a rede tem .pdf e .PDF. */
  extensao: string;
  descricao: string;
}

export const TIPOS_ARQUIVO: DefinicaoTipoArquivo[] = [
  { tipo: "pdf", rotulo: "PDF", extensao: ".pdf", descricao: "Desenho em PDF" },
  { tipo: "dxf", rotulo: "DXF", extensao: ".dxf", descricao: "Planificação para corte" },
  { tipo: "step", rotulo: "STEP", extensao: ".step", descricao: "Modelo 3D" },
];

export function ehTipoArquivoDerivado(valor: unknown): valor is TipoArquivoDerivado {
  return valor === "pdf" || valor === "dxf" || valor === "step";
}

export function definicaoDoTipo(tipo: TipoArquivoDerivado): DefinicaoTipoArquivo {
  return TIPOS_ARQUIVO.find((item) => item.tipo === tipo) ?? TIPOS_ARQUIVO[0];
}

/* Teto por conferência -- a pasta de PDF sozinha tem ~264 mil arquivos. */
export const LIMITE_CODIGOS = 5000;
