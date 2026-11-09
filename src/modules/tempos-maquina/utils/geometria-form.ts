import { geometriaManual } from "@/lib/tempos-maquina/calculo";
import type { GeometriaPeca } from "@/lib/tempos-maquina/tipos";

/* Medidas digitadas da peça (simulador do admin e cálculo no Roteiro). Tudo texto: a pessoa digita com vírgula. */

export type LinhaMedida = { quantidade: string; a: string; b: string };

export type GeometriaManualForm = {
  largura: string;
  comprimento: string;
  perimetro: string;
  entradas: string;
  furos: LinhaMedida[];
  oblongos: LinhaMedida[];
};

export const GEOMETRIA_MANUAL_VAZIA: GeometriaManualForm = {
  largura: "",
  comprimento: "",
  perimetro: "",
  entradas: "",
  furos: [],
  oblongos: [],
};

export function numeroDoTexto(texto: string): number | null {
  const n = Number(String(texto).replace(",", "."));
  return String(texto).trim() && Number.isFinite(n) ? n : null;
}

export function geometriaDoForm(f: GeometriaManualForm): GeometriaPeca {
  return geometriaManual({
    larguraMm: numeroDoTexto(f.largura),
    comprimentoMm: numeroDoTexto(f.comprimento),
    perimetroMm: numeroDoTexto(f.perimetro),
    entradas: numeroDoTexto(f.entradas),
    furos: f.furos.map((x) => ({ quantidade: numeroDoTexto(x.quantidade) ?? 0, diametroMm: numeroDoTexto(x.a) ?? 0 })),
    oblongos: f.oblongos.map((x) => ({
      quantidade: numeroDoTexto(x.quantidade) ?? 0,
      larguraMm: numeroDoTexto(x.a) ?? 0,
      comprimentoMm: numeroDoTexto(x.b) ?? 0,
    })),
  });
}
