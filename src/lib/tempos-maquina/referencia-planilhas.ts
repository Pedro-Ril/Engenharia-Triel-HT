import type { PerfilCorteCnc, PerfilTabelaDimensao } from "./tipos";

/*
 * Gerado por script, direto das planilhas (as mesmas tabelas estão no
 * anexo de docs/roteiro/calculo-automatico-tempos.md):
 * - TEMPOS_PLASMA_CNC_CORRIGIDA.xls, abas "Laser" e "Plasma OXIPIRA";
 * - TEMPOS_CORTE_DOBRA.xls, aba "Plan2".
 * Valores de REFERÊNCIA (2006-2013, máquinas da planilha) -- servem de
 * carga inicial e para os testes conferirem o motor contra a planilha.
 * Não estão validados para as máquinas de hoje.
 */

/* A planilha guarda pierce e espera em minutos (x/60); aqui vão em segundos. */
const seg = (segundos: number) => segundos / 60;

/* Laser BYSTAR (C035): chapa 4000 x 1500, vazio 70000 mm/min. */
const laserBystar: PerfilCorteCnc = {
  metodo: "corte_cnc",
  chapaPadrao: { larguraMm: 1500, comprimentoMm: 4000 },
  velocidadeVazioMmMin: 70000,
  entradaSaidaMm: 5,
  aproximacaoPorEntradaMin: 0,
  temposPorChapa: [
    { chave: "trocar_mesa", rotulo: "Trocar mesa", minutos: 1.294 },
    { chave: "referenciar_chapa", rotulo: "Referenciar chapa", minutos: 0.633 },
    { chave: "finalizar_programa", rotulo: "Finalizar programa", minutos: 0.157 },
  ],
  limpezaBicoMin: 0.273,
  variantes: [
    { chave: "padrao", rotulo: "Material padrão" },
    { chave: "especial", rotulo: "Material especial" },
  ],
  linhas: [
    { espessuraMm: 1.5, variante: "padrao", velocidadeMmMin: 7000, pierceMin: seg(0.2), esperaMin: seg(0.1), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 1.5, variante: "especial", velocidadeMmMin: 6300, pierceMin: seg(0.2), esperaMin: seg(0.1), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2, variante: "padrao", velocidadeMmMin: 5600, pierceMin: seg(0.2), esperaMin: seg(0.1), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2, variante: "especial", velocidadeMmMin: 5000, pierceMin: seg(0.2), esperaMin: seg(0.1), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2.65, variante: "padrao", velocidadeMmMin: 5000, pierceMin: seg(0.2), esperaMin: seg(0.3), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2.65, variante: "especial", velocidadeMmMin: 4500, pierceMin: seg(0.2), esperaMin: seg(0.3), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3, variante: "padrao", velocidadeMmMin: 4000, pierceMin: seg(0.3), esperaMin: seg(0.3), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3, variante: "especial", velocidadeMmMin: 3600, pierceMin: seg(0.3), esperaMin: seg(0.3), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3.35, variante: "padrao", velocidadeMmMin: 3500, pierceMin: seg(0.3), esperaMin: seg(0.3), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3.35, variante: "especial", velocidadeMmMin: 3500, pierceMin: seg(0.3), esperaMin: seg(0.3), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3.75, variante: "padrao", velocidadeMmMin: 3500, pierceMin: seg(0.3), esperaMin: seg(0.3), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 3.75, variante: "especial", velocidadeMmMin: 3300, pierceMin: seg(0.3), esperaMin: seg(0.3), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.25, variante: "padrao", velocidadeMmMin: 3500, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.25, variante: "especial", velocidadeMmMin: 3200, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "padrao", velocidadeMmMin: 2700, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "especial", velocidadeMmMin: 2500, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 6.35, variante: "padrao", velocidadeMmMin: 2400, pierceMin: seg(0.5), esperaMin: seg(0.6), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 6.35, variante: "especial", velocidadeMmMin: 2100, pierceMin: seg(0.5), esperaMin: seg(0.6), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 8, variante: "padrao", velocidadeMmMin: 1900, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 40, diametroMinimoFuroMm: null },
    { espessuraMm: 8, variante: "especial", velocidadeMmMin: 1700, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 40, diametroMinimoFuroMm: null },
    { espessuraMm: 9.5, variante: "padrao", velocidadeMmMin: 1400, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 30, diametroMinimoFuroMm: null },
    { espessuraMm: 9.5, variante: "especial", velocidadeMmMin: 1200, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 30, diametroMinimoFuroMm: null },
    { espessuraMm: 11, variante: "padrao", velocidadeMmMin: 1000, pierceMin: seg(0.6), esperaMin: seg(0.8), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
    { espessuraMm: 11, variante: "especial", velocidadeMmMin: 900, pierceMin: seg(0.6), esperaMin: seg(0.8), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
    { espessuraMm: 12.7, variante: "padrao", velocidadeMmMin: 1100, pierceMin: seg(0.6), esperaMin: seg(0.8), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
    { espessuraMm: 12.7, variante: "especial", velocidadeMmMin: 1000, pierceMin: seg(0.6), esperaMin: seg(0.8), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
  ],
};

/* Laser BYSPRINT (C034): chapa 4000 x 1500, vazio 110000 mm/min. */
const laserBysprint: PerfilCorteCnc = {
  metodo: "corte_cnc",
  chapaPadrao: { larguraMm: 1500, comprimentoMm: 4000 },
  velocidadeVazioMmMin: 110000,
  entradaSaidaMm: 5,
  aproximacaoPorEntradaMin: 0,
  temposPorChapa: [
    { chave: "trocar_mesa", rotulo: "Trocar mesa", minutos: 1.194 },
    { chave: "referenciar_chapa", rotulo: "Referenciar chapa", minutos: 0.253 },
    { chave: "finalizar_programa", rotulo: "Finalizar programa", minutos: 0.083 },
  ],
  limpezaBicoMin: 0.213,
  variantes: [
    { chave: "padrao", rotulo: "Material padrão" },
    { chave: "especial", rotulo: "Material especial" },
  ],
  linhas: [
    { espessuraMm: 1.5, variante: "padrao", velocidadeMmMin: 6300, pierceMin: seg(0.2), esperaMin: seg(0.1), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 1.5, variante: "especial", velocidadeMmMin: 6300, pierceMin: seg(0.2), esperaMin: seg(0.1), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2, variante: "padrao", velocidadeMmMin: 5600, pierceMin: seg(0.2), esperaMin: seg(0.1), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2, variante: "especial", velocidadeMmMin: 5000, pierceMin: seg(0.2), esperaMin: seg(0.1), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2.65, variante: "padrao", velocidadeMmMin: 5000, pierceMin: seg(0.2), esperaMin: seg(0.4), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2.65, variante: "especial", velocidadeMmMin: 4500, pierceMin: seg(0.2), esperaMin: seg(0.4), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3, variante: "padrao", velocidadeMmMin: 4000, pierceMin: seg(0.3), esperaMin: seg(0.4), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3, variante: "especial", velocidadeMmMin: 3600, pierceMin: seg(0.3), esperaMin: seg(0.4), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3.35, variante: "padrao", velocidadeMmMin: 3500, pierceMin: seg(0.3), esperaMin: seg(0.4), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3.35, variante: "especial", velocidadeMmMin: 3500, pierceMin: seg(0.3), esperaMin: seg(0.4), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3.75, variante: "padrao", velocidadeMmMin: 3500, pierceMin: seg(0.3), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 3.75, variante: "especial", velocidadeMmMin: 3300, pierceMin: seg(0.3), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.25, variante: "padrao", velocidadeMmMin: 3500, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.25, variante: "especial", velocidadeMmMin: 3200, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "padrao", velocidadeMmMin: 2700, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "especial", velocidadeMmMin: 2500, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 6.35, variante: "padrao", velocidadeMmMin: 2400, pierceMin: seg(0.5), esperaMin: seg(0.6), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 6.35, variante: "especial", velocidadeMmMin: 2100, pierceMin: seg(0.5), esperaMin: seg(0.6), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 8, variante: "padrao", velocidadeMmMin: 1900, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 40, diametroMinimoFuroMm: null },
    { espessuraMm: 8, variante: "especial", velocidadeMmMin: 1700, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 40, diametroMinimoFuroMm: null },
    { espessuraMm: 9.5, variante: "padrao", velocidadeMmMin: 1400, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 30, diametroMinimoFuroMm: null },
    { espessuraMm: 9.5, variante: "especial", velocidadeMmMin: 1200, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 30, diametroMinimoFuroMm: null },
    { espessuraMm: 11, variante: "padrao", velocidadeMmMin: 1000, pierceMin: seg(0.6), esperaMin: seg(0.8), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
    { espessuraMm: 11, variante: "especial", velocidadeMmMin: 900, pierceMin: seg(0.6), esperaMin: seg(0.8), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
    { espessuraMm: 12.7, variante: "padrao", velocidadeMmMin: 1100, pierceMin: seg(0.6), esperaMin: seg(0.8), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
    { espessuraMm: 12.7, variante: "especial", velocidadeMmMin: 1000, pierceMin: seg(0.6), esperaMin: seg(0.8), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
  ],
};

/* Laser BYSPEED (C007): chapa 4000 x 1500, vazio 120000 mm/min. */
const laserByspeed: PerfilCorteCnc = {
  metodo: "corte_cnc",
  chapaPadrao: { larguraMm: 1500, comprimentoMm: 4000 },
  velocidadeVazioMmMin: 120000,
  entradaSaidaMm: 5,
  aproximacaoPorEntradaMin: 0,
  temposPorChapa: [
    { chave: "trocar_mesa", rotulo: "Trocar mesa", minutos: 1.431 },
    { chave: "referenciar_chapa", rotulo: "Referenciar chapa", minutos: 0.343 },
    { chave: "finalizar_programa", rotulo: "Finalizar programa", minutos: 0.171 },
  ],
  limpezaBicoMin: 0.276,
  variantes: [
    { chave: "padrao", rotulo: "Material padrão" },
    { chave: "especial", rotulo: "Material especial" },
  ],
  linhas: [
    { espessuraMm: 1.5, variante: "padrao", velocidadeMmMin: 6300, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 1.5, variante: "especial", velocidadeMmMin: 6300, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2, variante: "padrao", velocidadeMmMin: 5300, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2, variante: "especial", velocidadeMmMin: 5000, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2.65, variante: "padrao", velocidadeMmMin: 4700, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 2.65, variante: "especial", velocidadeMmMin: 4500, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3, variante: "padrao", velocidadeMmMin: 4100, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3, variante: "especial", velocidadeMmMin: 4000, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3.35, variante: "padrao", velocidadeMmMin: 4000, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3.35, variante: "especial", velocidadeMmMin: 3700, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 60, diametroMinimoFuroMm: null },
    { espessuraMm: 3.75, variante: "padrao", velocidadeMmMin: 3700, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 3.75, variante: "especial", velocidadeMmMin: 3500, pierceMin: seg(0.3), esperaMin: seg(0.2), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.25, variante: "padrao", velocidadeMmMin: 3700, pierceMin: seg(0.4), esperaMin: seg(0.2), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.25, variante: "especial", velocidadeMmMin: 3400, pierceMin: seg(0.4), esperaMin: seg(0.2), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "padrao", velocidadeMmMin: 3200, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "especial", velocidadeMmMin: 3000, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 6.35, variante: "padrao", velocidadeMmMin: 2900, pierceMin: seg(0.5), esperaMin: seg(0.5), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 6.35, variante: "especial", velocidadeMmMin: 2700, pierceMin: seg(0.5), esperaMin: seg(0.5), piercesPorLimpeza: 50, diametroMinimoFuroMm: null },
    { espessuraMm: 8, variante: "padrao", velocidadeMmMin: 2400, pierceMin: seg(0.6), esperaMin: seg(0.5), piercesPorLimpeza: 40, diametroMinimoFuroMm: null },
    { espessuraMm: 8, variante: "especial", velocidadeMmMin: 2200, pierceMin: seg(0.6), esperaMin: seg(0.5), piercesPorLimpeza: 40, diametroMinimoFuroMm: null },
    { espessuraMm: 9.5, variante: "padrao", velocidadeMmMin: 2000, pierceMin: seg(0.6), esperaMin: seg(0.5), piercesPorLimpeza: 30, diametroMinimoFuroMm: null },
    { espessuraMm: 9.5, variante: "especial", velocidadeMmMin: 1800, pierceMin: seg(0.6), esperaMin: seg(0.5), piercesPorLimpeza: 30, diametroMinimoFuroMm: null },
    { espessuraMm: 11, variante: "padrao", velocidadeMmMin: 1400, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
    { espessuraMm: 11, variante: "especial", velocidadeMmMin: 1600, pierceMin: seg(0.6), esperaMin: seg(0.6), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
    { espessuraMm: 12.7, variante: "padrao", velocidadeMmMin: 1600, pierceMin: seg(1.2), esperaMin: seg(0.6), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
    { espessuraMm: 12.7, variante: "especial", velocidadeMmMin: 1400, pierceMin: seg(1.2), esperaMin: seg(0.6), piercesPorLimpeza: 15, diametroMinimoFuroMm: null },
  ],
};

/* Laser TRUMPF (C005): chapa 4000 x 1500, vazio 125000 mm/min. */
const laserTrumpf: PerfilCorteCnc = {
  metodo: "corte_cnc",
  chapaPadrao: { larguraMm: 1500, comprimentoMm: 4000 },
  velocidadeVazioMmMin: 125000,
  entradaSaidaMm: 5,
  aproximacaoPorEntradaMin: 0,
  temposPorChapa: [
    { chave: "trocar_mesa", rotulo: "Trocar mesa", minutos: 0.343 },
    { chave: "referenciar_chapa", rotulo: "Referenciar chapa", minutos: 0.553 },
    { chave: "finalizar_programa", rotulo: "Finalizar programa", minutos: 0 },
  ],
  limpezaBicoMin: 0.328,
  variantes: [
    { chave: "padrao", rotulo: "Material padrão" },
    { chave: "especial", rotulo: "Material especial" },
  ],
  linhas: [
    { espessuraMm: 1.5, variante: "padrao", velocidadeMmMin: 6000, pierceMin: seg(0.06), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 1.5, variante: "especial", velocidadeMmMin: 6000, pierceMin: seg(0.06), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 2, variante: "padrao", velocidadeMmMin: 5400, pierceMin: seg(0.07), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 2, variante: "especial", velocidadeMmMin: 5400, pierceMin: seg(0.07), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 2.65, variante: "padrao", velocidadeMmMin: 5000, pierceMin: seg(0.08), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 2.65, variante: "especial", velocidadeMmMin: 5000, pierceMin: seg(0.08), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 3, variante: "padrao", velocidadeMmMin: 5000, pierceMin: seg(0.09), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 3, variante: "especial", velocidadeMmMin: 5000, pierceMin: seg(0.09), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 3.35, variante: "padrao", velocidadeMmMin: 4000, pierceMin: seg(0.09), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 3.35, variante: "especial", velocidadeMmMin: 4000, pierceMin: seg(0.09), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 3.75, variante: "padrao", velocidadeMmMin: 4000, pierceMin: seg(0.11), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 3.75, variante: "especial", velocidadeMmMin: 4000, pierceMin: seg(0.11), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 4.25, variante: "padrao", velocidadeMmMin: 3500, pierceMin: seg(0.11), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 4.25, variante: "especial", velocidadeMmMin: 3500, pierceMin: seg(0.11), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "padrao", velocidadeMmMin: 3500, pierceMin: seg(0.15), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "especial", velocidadeMmMin: 3500, pierceMin: seg(0.15), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 6.35, variante: "padrao", velocidadeMmMin: 3000, pierceMin: seg(0.2), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 6.35, variante: "especial", velocidadeMmMin: 3000, pierceMin: seg(0.2), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 8, variante: "padrao", velocidadeMmMin: 2000, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 8, variante: "especial", velocidadeMmMin: 1900, pierceMin: seg(0.4), esperaMin: seg(0.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 9.5, variante: "padrao", velocidadeMmMin: 1900, pierceMin: seg(0.5), esperaMin: seg(0.9), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 9.5, variante: "especial", velocidadeMmMin: 1500, pierceMin: seg(0.5), esperaMin: seg(0.9), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 11, variante: "padrao", velocidadeMmMin: 1600, pierceMin: seg(0.7), esperaMin: seg(1.76), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 11, variante: "especial", velocidadeMmMin: 1600, pierceMin: seg(0.7), esperaMin: seg(1.76), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 12.7, variante: "padrao", velocidadeMmMin: 1500, pierceMin: seg(0.7), esperaMin: seg(1.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 12.7, variante: "especial", velocidadeMmMin: 1100, pierceMin: seg(0.7), esperaMin: seg(1.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 16, variante: "padrao", velocidadeMmMin: 1200, pierceMin: seg(2.2), esperaMin: seg(1.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 16, variante: "especial", velocidadeMmMin: 1200, pierceMin: seg(2.2), esperaMin: seg(1.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 19, variante: "padrao", velocidadeMmMin: 950, pierceMin: seg(4.5), esperaMin: seg(3.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
    { espessuraMm: 19, variante: "especial", velocidadeMmMin: 900, pierceMin: seg(4.5), esperaMin: seg(3.4), piercesPorLimpeza: 500, diametroMinimoFuroMm: null },
  ],
};

/* Plasma OXIPIRA: chapa 6000 x 1500, uma tocha. */
const plasmaOxipira: PerfilCorteCnc = {
  metodo: "corte_cnc",
  chapaPadrao: { larguraMm: 1500, comprimentoMm: 6000 },
  velocidadeVazioMmMin: 16000,
  entradaSaidaMm: 4.5,
  aproximacaoPorEntradaMin: 0.086,
  temposPorChapa: [{ chave: "referenciar_chapa", rotulo: "Referenciar chapa", minutos: 2.475 }],
  limpezaBicoMin: null,
  variantes: [
    { chave: "80A", rotulo: "80 A" },
    { chave: "260A", rotulo: "260 A" },
  ],
  linhas: [
    { espessuraMm: 1.9, variante: "80A", velocidadeMmMin: 9800, pierceMin: seg(0.1), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 2.65, variante: "80A", velocidadeMmMin: 7900, pierceMin: seg(0.1), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 3, variante: "80A", velocidadeMmMin: 6145, pierceMin: seg(0.2), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 3.35, variante: "80A", velocidadeMmMin: 5530, pierceMin: seg(0.2), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 3.75, variante: "80A", velocidadeMmMin: 4915, pierceMin: seg(0.2), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 4.25, variante: "80A", velocidadeMmMin: 4300, pierceMin: seg(0.2), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "80A", velocidadeMmMin: 3675, pierceMin: seg(0.2), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 4.75, variante: "260A", velocidadeMmMin: 6500, pierceMin: seg(0.3), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: 4.75 / 2.5 },
    { espessuraMm: 6.35, variante: "80A", velocidadeMmMin: 3045, pierceMin: seg(0.3), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 6.35, variante: "260A", velocidadeMmMin: 6500, pierceMin: seg(0.3), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: 6.35 / 2.5 },
    { espessuraMm: 8, variante: "80A", velocidadeMmMin: 2430, pierceMin: seg(0.4), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 8, variante: "260A", velocidadeMmMin: 5470, pierceMin: seg(0.3), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: 8 / 2.5 },
    { espessuraMm: 9.5, variante: "80A", velocidadeMmMin: 1810, pierceMin: seg(0.5), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 9.5, variante: "260A", velocidadeMmMin: 4440, pierceMin: seg(0.3), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: 9.5 / 2.5 },
    { espessuraMm: 11, variante: "80A", velocidadeMmMin: 1450, pierceMin: seg(0.5), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 11, variante: "260A", velocidadeMmMin: 3800, pierceMin: seg(0.4), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: 11 / 2.5 },
    { espessuraMm: 12.7, variante: "80A", velocidadeMmMin: 1410, pierceMin: seg(0.7), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 12.7, variante: "260A", velocidadeMmMin: 3850, pierceMin: seg(0.4), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: 12.7 / 2.5 },
    { espessuraMm: 16, variante: "80A", velocidadeMmMin: 1000, pierceMin: seg(0.8), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 16, variante: "260A", velocidadeMmMin: 3130, pierceMin: seg(0.5), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 19, variante: "80A", velocidadeMmMin: 550, pierceMin: seg(0.9), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 19, variante: "260A", velocidadeMmMin: 2170, pierceMin: seg(0.6), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 22.4, variante: "260A", velocidadeMmMin: 1930, pierceMin: seg(0.7), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 25, variante: "260A", velocidadeMmMin: 1685, pierceMin: seg(0.8), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 31.5, variante: "260A", velocidadeMmMin: 1135, pierceMin: seg(1), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 38, variante: "260A", velocidadeMmMin: 895, pierceMin: seg(1.2), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 44.45, variante: "260A", velocidadeMmMin: 580, pierceMin: seg(1.2), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 50, variante: "260A", velocidadeMmMin: 405, pierceMin: seg(1.2), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
    { espessuraMm: 63.5, variante: "260A", velocidadeMmMin: 192, pierceMin: seg(1.2), esperaMin: 0, piercesPorLimpeza: null, diametroMinimoFuroMm: null },
  ],
};

const LARGURAS_CD = [100, 200, 500, 700, 1000, 1200, 1400, 1500];
const COMPRIMENTOS_CD = [100, 200, 500, 700, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000];

/* Tempo base da TEMPOS CORTE E DOBRA (minutos), por faixa de espessura. */
const FAIXAS_CORTE_DOBRA: PerfilTabelaDimensao["faixas"] = [
    {
      rotulo: "0,91 à 2,65 mm",
      espessuraAteMm: 2.65,
      larguras: LARGURAS_CD,
      comprimentos: COMPRIMENTOS_CD,
      tempos: [
        [0.14939999999999998, 0.14939999999999998, 0.1992, 0.249, 0.29879999999999995, 0.34859999999999997, 0.34859999999999997, 0.3984, 0.44820000000000004, 0.498, 0.498, 0.5478000000000001, 0.5975999999999999, 0.6474, 0.6971999999999999],
        [0.14939999999999998, 0.1992, 0.249, 0.29879999999999995, 0.34859999999999997, 0.3984, 0.44820000000000004, 0.498, 0.5478000000000001, 0.5975999999999999, 0.6474, 0.6971999999999999, 0.747, 0.7968, 0.7968],
        [0.1992, 0.249, 0.29879999999999995, 0.34859999999999997, 0.3984, 0.498, 0.5478000000000001, 0.5975999999999999, 0.5975999999999999, 0.6474, 0.6971999999999999, 0.747, 0.7968, 0.8466, 0.8964000000000001],
        [0.249, 0.29879999999999995, 0.34859999999999997, 0.44820000000000004, 0.498, 0.5975999999999999, 0.6971999999999999, 0.747, 0.7968, 0.8466, 0.8964000000000001, 0.9461999999999999, 1, 1.0956000000000001, 1.1454],
        [0.29879999999999995, 0.34859999999999997, 0.3984, 0.498, 0.5975999999999999, 0.6971999999999999, 0.7968, 0.8964000000000001, 0.996, 0.996, 1.0458, 1.1454, 1.1951999999999998, 1.245, 1.2948],
        [0.34859999999999997, 0.3984, 0.498, 0.5975999999999999, 0.6971999999999999, 0.8964000000000001, 0.9461999999999999, 1.0458, 1.0956000000000001, 1.245, 1.2948, 1.3943999999999999, 1.4442, 1.494, 1.6434],
        [0.34859999999999997, 0.44820000000000004, 0.5478000000000001, 0.6971999999999999, 0.7968, 0.9461999999999999, 1.0956000000000001, 1.1951999999999998, 1.245, 1.3446, 1.4442, 1.5438, 1.5936, 1.743, 1.8426],
        [0.3984, 0.498, 0.5975999999999999, 0.747, 0.8964000000000001, 1.0458, 1.1951999999999998, 1.3446, 1.3943999999999999, 1.6434, 1.6434, 1.6932, 1.8426, 1.9422, 1.992],
      ],
    },
    {
      rotulo: "3,0 à 4,75 mm",
      espessuraAteMm: 4.75,
      larguras: LARGURAS_CD,
      comprimentos: COMPRIMENTOS_CD,
      tempos: [
        [0.1992, 0.1992, 0.249, 0.29879999999999995, 0.34859999999999997, 0.3984, 0.44820000000000004, 0.498, 0.5478000000000001, 0.5975999999999999, 0.6474, 0.747, 0.747, 0.8466, 0.8964000000000001],
        [0.1992, 0.249, 0.29879999999999995, 0.34859999999999997, 0.44820000000000004, 0.498, 0.5478000000000001, 0.5975999999999999, 0.5975999999999999, 0.6971999999999999, 0.747, 0.7968, 0.8466, 0.9461999999999999, 0.996],
        [0.249, 0.29879999999999995, 0.34859999999999997, 0.44820000000000004, 0.498, 0.5975999999999999, 0.6474, 0.6971999999999999, 0.747, 0.8466, 0.8964000000000001, 0.9461999999999999, 0.996, 1.0956000000000001, 1.1454],
        [0.29879999999999995, 0.34859999999999997, 0.44820000000000004, 0.498, 0.5975999999999999, 0.6971999999999999, 0.747, 0.8466, 0.9461999999999999, 0.996, 1.0458, 1.0956000000000001, 1.1951999999999998, 1.2948, 1.3446],
        [0.34859999999999997, 0.44820000000000004, 0.498, 0.5975999999999999, 0.6971999999999999, 0.747, 0.8466, 0.996, 1.0956000000000001, 1.1454, 1.1951999999999998, 1.245, 1.3446, 1.494, 1.5936],
        [0.3984, 0.498, 0.5975999999999999, 0.6971999999999999, 0.747, 0.8466, 0.996, 1.1454, 1.245, 1.3446, 1.3943999999999999, 1.494, 1.5936, 1.6932, 1.7928000000000002],
        [0.44820000000000004, 0.5478000000000001, 0.6474, 0.747, 0.8466, 0.996, 1.0956000000000001, 1.245, 1.3943999999999999, 1.4442, 1.494, 1.5438, 1.6434, 1.8426, 1.9422],
        [0.498, 0.5975999999999999, 0.6971999999999999, 0.8466, 0.996, 1.1951999999999998, 1.245, 1.4442, 1.5438, 1.5936, 1.6434, 1.8426, 1.8923999999999999, 1.992, 2.0916],
      ],
    },
    {
      rotulo: "6,3 à 25,4 mm",
      espessuraAteMm: 25.4,
      larguras: LARGURAS_CD,
      comprimentos: COMPRIMENTOS_CD,
      tempos: [
        [0.249, 0.29879999999999995, 0.34859999999999997, 0.3984, 0.498, 0.5478000000000001, 0.5975999999999999, 0.6474, 0.6971999999999999, 0.747, 0.7968, 0.8964000000000001, 0.8964000000000001, 0.9461999999999999, 0.996],
        [0.29879999999999995, 0.34859999999999997, 0.3984, 0.44820000000000004, 0.5478000000000001, 0.5975999999999999, 0.6474, 0.6971999999999999, 0.747, 0.7968, 0.8466, 0.8964000000000001, 0.996, 1.0458, 1.0956000000000001],
        [0.34859999999999997, 0.3984, 0.44820000000000004, 0.5478000000000001, 0.6474, 0.6971999999999999, 0.7968, 0.8466, 0.8964000000000001, 0.996, 1.0458, 1.1454, 1.1951999999999998, 1.245, 1.2948],
        [0.3984, 0.44820000000000004, 0.5478000000000001, 0.5975999999999999, 0.6971999999999999, 0.7968, 0.8964000000000001, 0.9461999999999999, 0.996, 1.0956000000000001, 1.245, 1.3446, 1.3943999999999999, 1.494, 1.6434],
        [0.498, 0.5478000000000001, 0.6474, 0.6971999999999999, 0.8466, 0.9461999999999999, 1.0458, 1.1454, 1.1951999999999998, 1.2948, 1.3446, 1.5438, 1.5936, 1.743, 1.9422],
        [0.5478000000000001, 0.5975999999999999, 0.6971999999999999, 0.7968, 0.9461999999999999, 0.996, 1.1454, 1.245, 1.3943999999999999, 1.494, 1.5936, 1.6932, 1.8426, 1.992, 2.1912000000000003],
        [0.5975999999999999, 0.6474, 0.7968, 0.8964000000000001, 1.0458, 1.1454, 1.2948, 1.3943999999999999, 1.494, 1.6434, 1.743, 1.8923999999999999, 2.0418, 2.1414, 2.241],
        [0.6474, 0.6971999999999999, 0.8466, 0.9461999999999999, 1.1454, 1.245, 1.3943999999999999, 1.494, 1.5936, 1.743, 1.8923999999999999, 2.0418, 2.1414, 2.2908, 2.4402],
      ],
    },
];

/* Guilhotina: o tempo de corte é o tempo base. */
const guilhotina: PerfilTabelaDimensao = { metodo: "tabela_dimensao", faixas: FAIXAS_CORTE_DOBRA, dobra: null };

/* Dobradeira: tempo base x fator do tipo de perfil. */
const dobradeira: PerfilTabelaDimensao = {
  metodo: "tabela_dimensao",
  faixas: FAIXAS_CORTE_DOBRA,
  dobra: {
    regra: "fator",
    fatores: [
      { chave: "uma", rotulo: "Uma Dobra", fator: 1.1 },
      { chave: "duas", rotulo: "Duas Dobras", fator: 1.2 },
      { chave: "tres", rotulo: "Três Dobras", fator: 1.3 },
      { chave: "mais_de_tres", rotulo: "Mais de Três Dobras", fator: 1.7 },
      { chave: "lateral_pratz", rotulo: "Lateral PRATZ", fator: 1.9 },
      { chave: "assoalho_aves", rotulo: "Assoalho Aves", fator: 3 },
    ],
  },
};

export const PERFIS_REFERENCIA_PLANILHAS = {
  laserBystar: { nome: "Laser BYSTAR (C035) - planilha", perfil: laserBystar },
  laserBysprint: { nome: "Laser BYSPRINT (C034) - planilha", perfil: laserBysprint },
  laserByspeed: { nome: "Laser BYSPEED (C007) - planilha", perfil: laserByspeed },
  laserTrumpf: { nome: "Laser TRUMPF (C005) - planilha", perfil: laserTrumpf },
  plasmaOxipira: { nome: "Plasma OXIPIRA 80/260 A - planilha", perfil: plasmaOxipira },
  guilhotina: { nome: "Guilhotina (corte e dobra) - planilha", perfil: guilhotina },
  dobradeira: { nome: "Dobradeira (corte e dobra) - planilha", perfil: dobradeira },
};
