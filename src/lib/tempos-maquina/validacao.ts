import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";

import type {
  ContornoInterno,
  DadosPeca,
  FaixaTabelaDimensao,
  LinhaCorteCnc,
  PerfilCorteCnc,
  PerfilTabelaDimensao,
  PerfilTempo,
  RegraDobra,
} from "./tipos";

/*
 * Parâmetros de um perfil de tempo, como chegam do painel admin: confere
 * tudo e devolve só os campos conhecidos (é o que vai para a coluna JSON
 * de eng_tempos_perfis). Erro vira ValidationError com o lugar exato.
 */

type OpcoesNumero = { min?: number; maiorQueZero?: boolean; inteiro?: boolean };

function numero(valor: unknown, campo: string, opcoes: OpcoesNumero = {}): number {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : Number(valor);
  if (valor === null || valor === undefined || valor === "" || !Number.isFinite(n)) {
    throw new ValidationError(`Informe ${campo}.`);
  }
  if (opcoes.inteiro && !Number.isInteger(n)) throw new ValidationError(`${campo} deve ser um número inteiro.`);
  if (opcoes.maiorQueZero && !(n > 0)) throw new ValidationError(`${campo} deve ser maior que zero.`);
  if (opcoes.min !== undefined && n < opcoes.min) throw new ValidationError(`${campo} não pode ser menor que ${opcoes.min}.`);
  return n;
}

function numeroOuNulo(valor: unknown, campo: string, opcoes: OpcoesNumero = {}): number | null {
  return valor === null || valor === undefined || valor === "" ? null : numero(valor, campo, opcoes);
}

function texto(valor: unknown, campo: string, max = 100): string {
  if (typeof valor !== "string" || !valor.trim()) throw new ValidationError(`Informe ${campo}.`);
  if (valor.trim().length > max) throw new ValidationError(`${campo} deve ter no máximo ${max} caracteres.`);
  return valor.trim();
}

function lista(valor: unknown, campo: string, minimo = 1): unknown[] {
  if (!Array.isArray(valor) || valor.length < minimo) {
    throw new ValidationError(minimo > 0 ? `Informe ao menos ${minimo === 1 ? "um item" : `${minimo} itens`} em ${campo}.` : `${campo} inválido.`);
  }
  return valor;
}

function objeto(valor: unknown, campo: string): Record<string, unknown> {
  if (!isObject(valor)) throw new ValidationError(`${campo} inválido.`);
  return valor;
}

/* "Trocar mesa" -> "trocar_mesa" (a chave identifica a parcela no resultado). */
export function chaveDeRotulo(rotulo: string): string {
  return (
    rotulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "item"
  );
}

function chaveUnica(chave: string, usadas: Set<string>): string {
  let final = chave;
  for (let i = 2; usadas.has(final); i++) final = `${chave}_${i}`;
  usadas.add(final);
  return final;
}

function validarCorteCnc(p: Record<string, unknown>): PerfilCorteCnc {
  const chapa = objeto(p.chapaPadrao, "a chapa padrão");

  const variantesUsadas = new Set<string>();
  const variantes = lista(p.variantes, "variantes").map((v, i) => {
    const o = objeto(v, `a variante ${i + 1}`);
    const rotulo = texto(o.rotulo, `o nome da variante ${i + 1}`, 60);
    const chave = typeof o.chave === "string" && o.chave.trim() ? o.chave.trim().slice(0, 30) : chaveDeRotulo(rotulo).slice(0, 30);
    if (variantesUsadas.has(chave)) throw new ValidationError(`Variante "${rotulo}" repetida.`);
    variantesUsadas.add(chave);
    return { chave, rotulo };
  });

  const temposUsados = new Set<string>(["corte", "perfuracao", "vazio", "entrada_saida", "limpeza_bico"]);
  const temposPorChapa = lista(p.temposPorChapa ?? [], "tempos por chapa", 0).map((t, i) => {
    const o = objeto(t, `o tempo por chapa ${i + 1}`);
    const rotulo = texto(o.rotulo, `o nome do tempo por chapa ${i + 1}`, 60);
    const chaveInformada = typeof o.chave === "string" && o.chave.trim() ? o.chave.trim() : chaveDeRotulo(rotulo);
    return {
      chave: chaveUnica(chaveInformada.slice(0, 40), temposUsados),
      rotulo,
      minutos: numero(o.minutos, `os minutos de "${rotulo}"`, { min: 0 }),
    };
  });

  const vistas = new Set<string>();
  const linhas: LinhaCorteCnc[] = lista(p.linhas, "a tabela de corte").map((l, i) => {
    const o = objeto(l, `a linha ${i + 1}`);
    const onde = `na linha ${i + 1} da tabela de corte`;
    const variante = typeof o.variante === "string" ? o.variante.trim() : "";
    if (!variantesUsadas.has(variante)) throw new ValidationError(`Variante inválida ${onde}.`);
    const espessuraMm = numero(o.espessuraMm, `a espessura ${onde}`, { maiorQueZero: true });
    const chave = `${variante}|${espessuraMm}`;
    if (vistas.has(chave)) throw new ValidationError(`Espessura ${espessuraMm} mm repetida na variante "${variante}".`);
    vistas.add(chave);
    return {
      espessuraMm,
      variante,
      velocidadeMmMin: numero(o.velocidadeMmMin, `a velocidade ${onde}`, { maiorQueZero: true }),
      pierceMin: numero(o.pierceMin, `o pierce ${onde}`, { min: 0 }),
      esperaMin: numero(o.esperaMin ?? 0, `a espera ${onde}`, { min: 0 }),
      piercesPorLimpeza: numeroOuNulo(o.piercesPorLimpeza, `as entradas por limpeza ${onde}`, { inteiro: true, maiorQueZero: true }),
      diametroMinimoFuroMm: numeroOuNulo(o.diametroMinimoFuroMm, `o furo mínimo ${onde}`, { maiorQueZero: true }),
    };
  });

  return {
    metodo: "corte_cnc",
    chapaPadrao: {
      larguraMm: numero(chapa.larguraMm, "a largura da chapa padrão", { maiorQueZero: true }),
      comprimentoMm: numero(chapa.comprimentoMm, "o comprimento da chapa padrão", { maiorQueZero: true }),
    },
    velocidadeVazioMmMin: numero(p.velocidadeVazioMmMin, "a velocidade no vazio", { min: 0 }),
    entradaSaidaMm: numero(p.entradaSaidaMm, "a entrada e saída do corte", { min: 0 }),
    aproximacaoPorEntradaMin: numero(p.aproximacaoPorEntradaMin ?? 0, "a aproximação por entrada", { min: 0 }),
    temposPorChapa,
    limpezaBicoMin: numeroOuNulo(p.limpezaBicoMin, "a limpeza do bico", { min: 0 }),
    variantes,
    linhas: ordenarLinhas(linhas, variantes),
  };
}

/* Na ordem das variantes do perfil (padrão antes de especial, 80 A antes de 260 A) e por espessura. */
export function ordenarLinhas<T extends { variante: string; espessuraMm: number }>(linhas: T[], variantes: { chave: string }[]): T[] {
  const ordem = (chave: string) => variantes.findIndex((v) => v.chave === chave);
  return [...linhas].sort((a, b) => ordem(a.variante) - ordem(b.variante) || a.espessuraMm - b.espessuraMm);
}

function degraus(valor: unknown, campo: string): number[] {
  const valores = lista(valor, campo).map((v, i) => numero(v, `o ${i + 1}º valor de ${campo}`, { maiorQueZero: true }));
  for (let i = 1; i < valores.length; i++) {
    if (!(valores[i] > valores[i - 1])) throw new ValidationError(`Os valores de ${campo} devem ser crescentes.`);
  }
  return valores;
}

function validarDobra(valor: unknown): RegraDobra | null {
  if (valor === null || valor === undefined) return null;
  const o = objeto(valor, "a regra de dobra");

  if (o.regra === "por_dobra") {
    return { regra: "por_dobra", acrescimoPorDobra: numero(o.acrescimoPorDobra, "o acréscimo por dobra", { min: 0 }) };
  }
  if (o.regra !== "fator") throw new ValidationError("Regra de dobra inválida.");

  const usadas = new Set<string>();
  return {
    regra: "fator",
    fatores: lista(o.fatores, "os tipos de dobra").map((f, i) => {
      const fo = objeto(f, `o tipo de dobra ${i + 1}`);
      const rotulo = texto(fo.rotulo, `o nome do tipo de dobra ${i + 1}`, 60);
      const chaveInformada = typeof fo.chave === "string" && fo.chave.trim() ? fo.chave.trim() : chaveDeRotulo(rotulo);
      return {
        chave: chaveUnica(chaveInformada.slice(0, 40), usadas),
        rotulo,
        fator: numero(fo.fator, `o fator de "${rotulo}"`, { maiorQueZero: true }),
      };
    }),
  };
}

function validarTabelaDimensao(p: Record<string, unknown>): PerfilTabelaDimensao {
  const vistas = new Set<number>();
  const faixas: FaixaTabelaDimensao[] = lista(p.faixas, "as faixas de espessura").map((f, i) => {
    const o = objeto(f, `a faixa ${i + 1}`);
    const rotulo = texto(o.rotulo, `o nome da faixa ${i + 1}`, 60);
    const espessuraAteMm = numero(o.espessuraAteMm, `a espessura máxima da faixa "${rotulo}"`, { maiorQueZero: true });
    if (vistas.has(espessuraAteMm)) throw new ValidationError(`Duas faixas terminam em ${espessuraAteMm} mm.`);
    vistas.add(espessuraAteMm);

    const larguras = degraus(o.larguras, `larguras da faixa "${rotulo}"`);
    const comprimentos = degraus(o.comprimentos, `comprimentos da faixa "${rotulo}"`);
    const tempos = lista(o.tempos, `os tempos da faixa "${rotulo}"`).map((linha, il) => {
      const valores = lista(linha, `a linha ${il + 1} da faixa "${rotulo}"`);
      if (valores.length !== comprimentos.length) {
        throw new ValidationError(`A linha da largura ${larguras[il] ?? il + 1} da faixa "${rotulo}" deve ter ${comprimentos.length} valores.`);
      }
      return valores.map((v, ic) =>
        numero(v, `o tempo ${larguras[il] ?? il + 1} x ${comprimentos[ic]} da faixa "${rotulo}"`, { min: 0 })
      );
    });
    if (tempos.length !== larguras.length) {
      throw new ValidationError(`A faixa "${rotulo}" deve ter uma linha de tempos por largura (${larguras.length}).`);
    }

    return { rotulo, espessuraAteMm, larguras, comprimentos, tempos };
  });

  return {
    metodo: "tabela_dimensao",
    faixas: faixas.sort((a, b) => a.espessuraAteMm - b.espessuraAteMm),
    dobra: validarDobra(p.dobra),
  };
}

export function validarParametrosPerfil(metodo: unknown, parametros: unknown): PerfilTempo {
  const p = objeto(parametros, "Parâmetros do perfil");
  if (metodo === "corte_cnc") return validarCorteCnc(p);
  if (metodo === "tabela_dimensao") return validarTabelaDimensao(p);
  throw new ValidationError("Método de cálculo inválido.");
}

/* Contornos internos são poucos; acima disto é erro de quem mandou. */
const MAXIMO_CONTORNOS = 5000;

/*
 * Dados da peça como chegam do Roteiro (para recalcular no servidor):
 * só números finitos, só os tipos de contorno conhecidos.
 */
export function validarDadosPeca(valor: unknown): DadosPeca {
  const d = objeto(valor, "Dados da peça");
  const g = objeto(d.geometria, "A geometria da peça");

  const contornos = lista(g.contornosInternos ?? [], "os contornos internos", 0);
  if (contornos.length > MAXIMO_CONTORNOS) throw new ValidationError("Contornos internos demais.");

  const contornosInternos: ContornoInterno[] = contornos.map((c, i) => {
    const o = objeto(c, `o contorno interno ${i + 1}`);
    if (o.tipo === "furo") return { tipo: "furo", diametroMm: numero(o.diametroMm, "o diâmetro do furo", { maiorQueZero: true }) };
    if (o.tipo === "oblongo") {
      return {
        tipo: "oblongo",
        larguraMm: numero(o.larguraMm, "a largura do oblongo", { maiorQueZero: true }),
        comprimentoMm: numero(o.comprimentoMm, "o comprimento do oblongo", { maiorQueZero: true }),
        retangular: o.retangular === true,
      };
    }
    if (o.tipo === "recorte") {
      return {
        tipo: "recorte",
        perimetroMm: numero(o.perimetroMm, "o perímetro do recorte", { min: 0 }),
        menorDimensaoMm: numeroOuNulo(o.menorDimensaoMm, "a menor medida do recorte", { min: 0 }),
      };
    }
    throw new ValidationError(`Contorno interno ${i + 1} inválido.`);
  });

  const dobra = d.dobra === null || d.dobra === undefined ? null : objeto(d.dobra, "A dobra");

  return {
    espessuraMm: numero(d.espessuraMm, "a espessura", { maiorQueZero: true }),
    variante: typeof d.variante === "string" && d.variante.trim() ? d.variante.trim().slice(0, 30) : null,
    dobra: dobra
      ? {
          fator: typeof dobra.fator === "string" && dobra.fator.trim() ? dobra.fator.trim().slice(0, 40) : null,
          quantidade: numeroOuNulo(dobra.quantidade, "o número de dobras", { min: 0 }),
        }
      : null,
    geometria: {
      perimetroExternoMm: numeroOuNulo(g.perimetroExternoMm, "o perímetro externo", { min: 0 }),
      larguraMm: numeroOuNulo(g.larguraMm, "a largura", { min: 0 }),
      comprimentoMm: numeroOuNulo(g.comprimentoMm, "o comprimento", { min: 0 }),
      areaMm2: numeroOuNulo(g.areaMm2, "a área", { min: 0 }),
      contornosInternos,
      entradasAdicionais: numero(g.entradasAdicionais ?? 0, "as entradas adicionais", { inteiro: true, min: 0 }),
    },
  };
}
