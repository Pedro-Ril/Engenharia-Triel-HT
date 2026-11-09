import type { PerfilCorteCnc, PerfilTabelaDimensao } from "@/lib/tempos-maquina/tipos";

/*
 * Formulário do editor de perfil: tudo texto (a pessoa digita com
 * vírgula). Pierce, espera e aproximação aparecem em SEGUNDOS (o perfil
 * guarda minutos, como a planilha). Na volta, texto que não é número vai
 * como está, para o servidor recusar com a mensagem certa.
 */

export type CorteCncForm = {
  chapaLargura: string;
  chapaComprimento: string;
  vazio: string;
  entradaSaida: string;
  aproximacaoSeg: string;
  limpezaBico: string;
  temposPorChapa: { chave: string; rotulo: string; minutos: string }[];
  variantes: { chave: string; rotulo: string }[];
  linhas: {
    espessura: string;
    variante: string;
    velocidade: string;
    pierceSeg: string;
    esperaSeg: string;
    piercesPorLimpeza: string;
    furoMinimo: string;
  }[];
};

export type RegraDobraForm = "nenhuma" | "fator" | "por_dobra";

export type TabelaForm = {
  faixas: { rotulo: string; ate: string; larguras: string; comprimentos: string; tempos: string[][] }[];
  dobra: RegraDobraForm;
  fatores: { chave: string; rotulo: string; fator: string }[];
  acrescimoPorDobra: string;
};

export function textoDeNumero(valor: number | null | undefined, casas = 6): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return String(Number(valor.toFixed(casas))).replace(".", ",");
}

/* "" -> null; número -> number; o resto vai cru (o servidor recusa). */
export function valorNumerico(texto: string): number | string | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const n = Number(limpo.replace(",", "."));
  return Number.isFinite(n) ? n : limpo;
}

function segundosParaMinutos(texto: string): number | string | null {
  const v = valorNumerico(texto);
  return typeof v === "number" ? v / 60 : v;
}

/* "100; 200; 500" -> [100, 200, 500] (vírgula é decimal, por isso o ponto e vírgula). */
export function lerDegraus(texto: string): (number | string)[] {
  return texto
    .split(/[;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => valorNumerico(t) as number | string);
}

export function ajustarMatriz(tempos: string[][], linhas: number, colunas: number): string[][] {
  return Array.from({ length: linhas }, (_, i) => Array.from({ length: colunas }, (_, j) => tempos[i]?.[j] ?? ""));
}

export const CORTE_CNC_VAZIO: CorteCncForm = {
  chapaLargura: "1500",
  chapaComprimento: "3000",
  vazio: "",
  entradaSaida: "5",
  aproximacaoSeg: "0",
  limpezaBico: "",
  temposPorChapa: [],
  variantes: [{ chave: "padrao", rotulo: "Padrão" }],
  linhas: [],
};

export const TABELA_VAZIA: TabelaForm = {
  faixas: [{ rotulo: "Faixa 1", ate: "", larguras: "100; 200", comprimentos: "100; 200", tempos: [["", ""], ["", ""]] }],
  dobra: "nenhuma",
  fatores: [],
  acrescimoPorDobra: "0,1",
};

export function corteCncParaForm(p: PerfilCorteCnc): CorteCncForm {
  return {
    chapaLargura: textoDeNumero(p.chapaPadrao.larguraMm),
    chapaComprimento: textoDeNumero(p.chapaPadrao.comprimentoMm),
    vazio: textoDeNumero(p.velocidadeVazioMmMin),
    entradaSaida: textoDeNumero(p.entradaSaidaMm),
    aproximacaoSeg: textoDeNumero(p.aproximacaoPorEntradaMin * 60, 4),
    limpezaBico: textoDeNumero(p.limpezaBicoMin),
    temposPorChapa: p.temposPorChapa.map((t) => ({ chave: t.chave, rotulo: t.rotulo, minutos: textoDeNumero(t.minutos) })),
    variantes: p.variantes.map((v) => ({ ...v })),
    linhas: p.linhas.map((l) => ({
      espessura: textoDeNumero(l.espessuraMm),
      variante: l.variante,
      velocidade: textoDeNumero(l.velocidadeMmMin),
      pierceSeg: textoDeNumero(l.pierceMin * 60, 4),
      esperaSeg: textoDeNumero(l.esperaMin * 60, 4),
      piercesPorLimpeza: textoDeNumero(l.piercesPorLimpeza),
      furoMinimo: textoDeNumero(l.diametroMinimoFuroMm, 4),
    })),
  };
}

export function formParaCorteCnc(f: CorteCncForm): unknown {
  return {
    metodo: "corte_cnc",
    chapaPadrao: { larguraMm: valorNumerico(f.chapaLargura), comprimentoMm: valorNumerico(f.chapaComprimento) },
    velocidadeVazioMmMin: valorNumerico(f.vazio),
    entradaSaidaMm: valorNumerico(f.entradaSaida),
    aproximacaoPorEntradaMin: segundosParaMinutos(f.aproximacaoSeg) ?? 0,
    temposPorChapa: f.temposPorChapa.map((t) => ({ chave: t.chave, rotulo: t.rotulo, minutos: valorNumerico(t.minutos) })),
    limpezaBicoMin: valorNumerico(f.limpezaBico),
    variantes: f.variantes,
    linhas: f.linhas.map((l) => ({
      espessuraMm: valorNumerico(l.espessura),
      variante: l.variante,
      velocidadeMmMin: valorNumerico(l.velocidade),
      pierceMin: segundosParaMinutos(l.pierceSeg),
      esperaMin: segundosParaMinutos(l.esperaSeg) ?? 0,
      piercesPorLimpeza: valorNumerico(l.piercesPorLimpeza),
      diametroMinimoFuroMm: valorNumerico(l.furoMinimo),
    })),
  };
}

export function tabelaParaForm(p: PerfilTabelaDimensao): TabelaForm {
  return {
    faixas: p.faixas.map((f) => ({
      rotulo: f.rotulo,
      ate: textoDeNumero(f.espessuraAteMm),
      larguras: f.larguras.map((v) => textoDeNumero(v)).join("; "),
      comprimentos: f.comprimentos.map((v) => textoDeNumero(v)).join("; "),
      tempos: f.tempos.map((linha) => linha.map((v) => textoDeNumero(v, 4))),
    })),
    dobra: p.dobra ? p.dobra.regra : "nenhuma",
    fatores: p.dobra?.regra === "fator" ? p.dobra.fatores.map((f) => ({ chave: f.chave, rotulo: f.rotulo, fator: textoDeNumero(f.fator) })) : [],
    acrescimoPorDobra: p.dobra?.regra === "por_dobra" ? textoDeNumero(p.dobra.acrescimoPorDobra) : "0,1",
  };
}

export function formParaTabela(f: TabelaForm): unknown {
  return {
    metodo: "tabela_dimensao",
    faixas: f.faixas.map((faixa) => ({
      rotulo: faixa.rotulo,
      espessuraAteMm: valorNumerico(faixa.ate),
      larguras: lerDegraus(faixa.larguras),
      comprimentos: lerDegraus(faixa.comprimentos),
      tempos: faixa.tempos.map((linha) => linha.map(valorNumerico)),
    })),
    dobra:
      f.dobra === "nenhuma"
        ? null
        : f.dobra === "fator"
          ? { regra: "fator", fatores: f.fatores.map((x) => ({ chave: x.chave, rotulo: x.rotulo, fator: valorNumerico(x.fator) })) }
          : { regra: "por_dobra", acrescimoPorDobra: valorNumerico(f.acrescimoPorDobra) },
  };
}
