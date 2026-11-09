import type {
  ContornoInterno,
  DadosPeca,
  GeometriaPeca,
  LinhaCorteCnc,
  ParcelaTempo,
  PerfilCorteCnc,
  PerfilTabelaDimensao,
  PerfilTempo,
  ResultadoTempo,
} from "./tipos";

/*
 * Motor do cálculo automático de tempo (minutos por peça). Reproduz as
 * planilhas TEMPOS PLASMA CNC (laser e plasma = "corte CNC") e TEMPOS
 * CORTE E DOBRA ("tabela por dimensão"), com as correções descritas em
 * docs/roteiro/calculo-automatico-tempos.md:
 * - oblongo do plasma com o perímetro certo, π·w + 2·(c − w) (a planilha
 *   usava π·w + (2·c − w));
 * - π de verdade nos furos (a planilha usava 3,1415);
 * - fração da chapa pela área da peça (a planilha usava o retângulo
 *   largura x comprimento, que é o que a digitação manual continua dando).
 */

/* Espessura que difere da tabela até isto conta como a mesma. */
const TOLERANCIA_ESPESSURA_MM = 0.01;
/* Fora da tabela por mais que isto (abaixo da menor ou acima da maior) não calcula. */
const FOLGA_FORA_DA_TABELA_MM = 0.3;

function num(valor: number, casas = 2): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

function resultadoComErro(erros: string[], avisos: string[] = []): ResultadoTempo {
  return { ok: false, tempoMin: null, parcelas: [], referencia: [], avisos, erros };
}

export function perimetroContorno(contorno: ContornoInterno): number {
  switch (contorno.tipo) {
    case "furo":
      return Math.PI * contorno.diametroMm;
    case "oblongo":
      return contorno.retangular
        ? 2 * contorno.larguraMm + 2 * contorno.comprimentoMm
        : Math.PI * contorno.larguraMm + 2 * (contorno.comprimentoMm - contorno.larguraMm);
    case "recorte":
      return contorno.perimetroMm;
  }
}

function menorDimensao(contorno: ContornoInterno): number | null {
  switch (contorno.tipo) {
    case "furo":
      return contorno.diametroMm;
    case "oblongo":
      return contorno.larguraMm;
    case "recorte":
      return contorno.menorDimensaoMm ?? null;
  }
}

/*
 * Linha da tabela para a espessura: a mais próxima (empate = a maior), com
 * aviso quando não é a mesma; fora da faixa da tabela, erro.
 */
export function escolherEspessura<T extends { espessuraMm: number }>(
  linhas: T[],
  espessuraMm: number
): { linha: T; aviso: string | null } | { erro: string } {
  if (linhas.length === 0) return { erro: "Sem tabela de corte." };

  const espessuras = linhas.map((l) => l.espessuraMm);
  const menor = Math.min(...espessuras);
  const maior = Math.max(...espessuras);

  if (espessuraMm < menor - FOLGA_FORA_DA_TABELA_MM || espessuraMm > maior + FOLGA_FORA_DA_TABELA_MM) {
    return { erro: `Espessura ${num(espessuraMm)} mm fora da tabela (${num(menor)} a ${num(maior)} mm).` };
  }

  let melhor = linhas[0];
  for (const linha of linhas) {
    const diferenca = Math.abs(linha.espessuraMm - espessuraMm);
    const diferencaMelhor = Math.abs(melhor.espessuraMm - espessuraMm);
    if (diferenca < diferencaMelhor - 1e-9 || (Math.abs(diferenca - diferencaMelhor) <= 1e-9 && linha.espessuraMm > melhor.espessuraMm)) {
      melhor = linha;
    }
  }

  const aviso =
    Math.abs(melhor.espessuraMm - espessuraMm) > TOLERANCIA_ESPESSURA_MM
      ? `Espessura ${num(espessuraMm)} mm calculada com a da tabela (${num(melhor.espessuraMm)} mm).`
      : null;

  return { linha: melhor, aviso };
}

/* Linha da variante que corta a peça, ou o motivo de não cortar. */
function linhaDaVariante(
  perfil: PerfilCorteCnc,
  variante: string,
  dados: DadosPeca
): { linha: LinhaCorteCnc; aviso: string | null } | { erro: string } {
  const rotulo = perfil.variantes.find((v) => v.chave === variante)?.rotulo ?? variante;
  const escolha = escolherEspessura(
    perfil.linhas.filter((l) => l.variante === variante),
    dados.espessuraMm
  );

  if ("erro" in escolha) return { erro: `${rotulo}: ${escolha.erro}` };

  const { linha } = escolha;
  if (!(linha.velocidadeMmMin > 0)) {
    return { erro: `${rotulo}: sem velocidade de corte para ${num(linha.espessuraMm)} mm.` };
  }

  if (linha.diametroMinimoFuroMm !== null) {
    const pequeno = dados.geometria.contornosInternos
      .map(menorDimensao)
      .find((medida) => medida !== null && medida <= (linha.diametroMinimoFuroMm as number));
    if (pequeno !== undefined && pequeno !== null) {
      return {
        erro: `${rotulo}: furo de ${num(pequeno)} mm pequeno demais em ${num(linha.espessuraMm)} mm (precisa passar de ${num(linha.diametroMinimoFuroMm)} mm).`,
      };
    }
  }

  return escolha;
}

export function calcularCorteCnc(perfil: PerfilCorteCnc, dados: DadosPeca): ResultadoTempo {
  const { geometria } = dados;
  const erros: string[] = [];

  if (!(dados.espessuraMm > 0)) erros.push("Informe a espessura.");
  if (!(geometria.perimetroExternoMm !== null && geometria.perimetroExternoMm > 0)) {
    erros.push("Informe as medidas da peça (largura e comprimento) ou o perímetro.");
  }
  if (erros.length) return resultadoComErro(erros);

  const pedida = dados.variante?.trim() || null;
  const candidatas = pedida ? [pedida] : perfil.variantes.map((v) => v.chave);

  let escolhida: { variante: string; linha: LinhaCorteCnc; aviso: string | null } | null = null;
  const motivos: string[] = [];

  for (const variante of candidatas) {
    const resultado = linhaDaVariante(perfil, variante, dados);
    if ("erro" in resultado) {
      motivos.push(resultado.erro);
      continue;
    }
    escolhida = { variante, ...resultado };
    break;
  }

  if (!escolhida) return resultadoComErro(motivos.length ? motivos : ["Sem tabela de corte."]);

  const avisos: string[] = [];
  if (escolhida.aviso) avisos.push(escolhida.aviso);

  const rotuloVariante = perfil.variantes.find((v) => v.chave === escolhida.variante)?.rotulo ?? escolhida.variante;
  if (!pedida && escolhida.variante !== candidatas[0]) {
    avisos.push(`Calculado com ${rotuloVariante} (${motivos.join(" ")})`);
  }

  const { linha } = escolhida;
  const contornos = geometria.contornosInternos;
  const entradas = 1 + contornos.length + Math.max(0, Math.trunc(geometria.entradasAdicionais || 0));
  const perimetroTotal =
    (geometria.perimetroExternoMm as number) + contornos.reduce((soma, c) => soma + perimetroContorno(c), 0);

  /* Fração da chapa padrão: sem área, os tempos por chapa ficam fora (com aviso). */
  const areaChapa = perfil.chapaPadrao.larguraMm * perfil.chapaPadrao.comprimentoMm;
  let fracao = 0;
  if (geometria.areaMm2 !== null && geometria.areaMm2 > 0 && areaChapa > 0) {
    fracao = geometria.areaMm2 / areaChapa;
  } else if (perfil.temposPorChapa.length > 0) {
    avisos.push("Sem a área da peça: os tempos por chapa (trocar mesa, referenciar...) não entraram.");
  }

  const vazio =
    entradas === 1 || !(perfil.velocidadeVazioMmMin > 0)
      ? 0
      : geometria.comprimentoMm !== null && geometria.comprimentoMm > 0
        ? geometria.comprimentoMm / perfil.velocidadeVazioMmMin
        : (geometria.perimetroExternoMm as number) / 4 / perfil.velocidadeVazioMmMin;

  const parcelas: ParcelaTempo[] = [
    { chave: "corte", rotulo: "Corte", minutos: perimetroTotal / linha.velocidadeMmMin },
    {
      chave: "perfuracao",
      rotulo: "Perfuração",
      minutos: entradas * (linha.pierceMin + linha.esperaMin + perfil.aproximacaoPorEntradaMin),
    },
    { chave: "vazio", rotulo: "Movimento no vazio", minutos: vazio },
    { chave: "entrada_saida", rotulo: "Entrada e saída", minutos: (entradas * perfil.entradaSaidaMm) / linha.velocidadeMmMin },
    ...perfil.temposPorChapa.map((t) => ({ chave: t.chave, rotulo: t.rotulo, minutos: fracao * t.minutos })),
  ];

  if (perfil.limpezaBicoMin !== null && linha.piercesPorLimpeza !== null && linha.piercesPorLimpeza > 0) {
    parcelas.push({
      chave: "limpeza_bico",
      rotulo: "Limpeza do bico",
      minutos: (entradas / linha.piercesPorLimpeza) * perfil.limpezaBicoMin,
    });
  }

  return {
    ok: true,
    tempoMin: parcelas.reduce((soma, p) => soma + p.minutos, 0),
    parcelas,
    referencia: [
      { rotulo: "Variante", valor: rotuloVariante },
      { rotulo: "Espessura da tabela", valor: `${num(linha.espessuraMm)} mm` },
      { rotulo: "Velocidade de corte", valor: `${num(linha.velocidadeMmMin, 0)} mm/min` },
      { rotulo: "Perímetro total", valor: `${num(perimetroTotal, 1)} mm` },
      { rotulo: "Entradas", valor: String(entradas) },
      { rotulo: "Fração da chapa", valor: `${num(fracao * 100, 3)}%` },
    ],
    avisos,
    erros: [],
  };
}

/* Índice do menor degrau que cobre a medida (acima do maior: o maior, com aviso). */
function degrau(valor: number, degraus: number[]): { indice: number; acima: boolean } {
  const indice = degraus.findIndex((d) => valor <= d + 1e-9);
  return indice === -1 ? { indice: degraus.length - 1, acima: true } : { indice, acima: false };
}

export function calcularTabelaDimensao(perfil: PerfilTabelaDimensao, dados: DadosPeca): ResultadoTempo {
  const { larguraMm, comprimentoMm } = dados.geometria;
  const erros: string[] = [];

  if (!(dados.espessuraMm > 0)) erros.push("Informe a espessura.");
  if (!(larguraMm && larguraMm > 0 && comprimentoMm && comprimentoMm > 0)) {
    erros.push("Informe a largura e o comprimento da peça.");
  }
  if (erros.length) return resultadoComErro(erros);

  const faixa = [...perfil.faixas]
    .sort((a, b) => a.espessuraAteMm - b.espessuraAteMm)
    .find((f) => dados.espessuraMm <= f.espessuraAteMm + TOLERANCIA_ESPESSURA_MM);
  if (!faixa) {
    const maior = Math.max(...perfil.faixas.map((f) => f.espessuraAteMm));
    return resultadoComErro([`Espessura ${num(dados.espessuraMm)} mm acima da tabela (até ${num(maior)} mm).`]);
  }

  /* A tabela tem largura até 1500 e comprimento até 3000: o menor lado é a largura. */
  const [menor, maior] = [larguraMm as number, comprimentoMm as number].sort((a, b) => a - b);
  const l = degrau(menor, faixa.larguras);
  const c = degrau(maior, faixa.comprimentos);
  const base = faixa.tempos[l.indice]?.[c.indice];

  if (base === undefined || !(base >= 0)) return resultadoComErro([`Tabela "${faixa.rotulo}" incompleta.`]);

  const avisos: string[] = [];
  if (l.acima || c.acima) {
    avisos.push(
      `Medida acima da tabela (máximo ${num(faixa.larguras.at(-1) as number, 0)} x ${num(faixa.comprimentos.at(-1) as number, 0)} mm): usado o maior valor.`
    );
  }

  const parcelas: ParcelaTempo[] = [{ chave: "base", rotulo: "Tempo da tabela", minutos: base }];
  const referencia = [
    { rotulo: "Faixa de espessura", valor: faixa.rotulo },
    { rotulo: "Medida da tabela", valor: `${num(faixa.larguras[l.indice], 0)} x ${num(faixa.comprimentos[c.indice], 0)} mm` },
  ];

  if (perfil.dobra) {
    let fator: number | null = null;
    let descricao = "";

    if (perfil.dobra.regra === "fator") {
      const escolhido = perfil.dobra.fatores.find((f) => f.chave === dados.dobra?.fator);
      if (!escolhido) return resultadoComErro(["Escolha o tipo de dobra."], avisos);
      fator = escolhido.fator;
      descricao = escolhido.rotulo;
    } else {
      const quantidade = Math.trunc(dados.dobra?.quantidade ?? 0);
      if (!(quantidade >= 1)) return resultadoComErro(["Informe o número de dobras."], avisos);
      fator = 1 + perfil.dobra.acrescimoPorDobra * quantidade;
      descricao = `${quantidade} ${quantidade === 1 ? "dobra" : "dobras"}`;
    }

    parcelas.push({ chave: "dobra", rotulo: `Acréscimo da dobra (x ${num(fator, 3)})`, minutos: base * (fator - 1) });
    referencia.push({ rotulo: "Dobra", valor: `${descricao} (x ${num(fator, 3)})` });
  }

  return {
    ok: true,
    tempoMin: parcelas.reduce((soma, p) => soma + p.minutos, 0),
    parcelas,
    referencia,
    avisos,
    erros: [],
  };
}

export function calcularTempo(perfil: PerfilTempo, dados: DadosPeca): ResultadoTempo {
  return perfil.metodo === "corte_cnc" ? calcularCorteCnc(perfil, dados) : calcularTabelaDimensao(perfil, dados);
}

/*
 * Geometria digitada como na planilha: largura x comprimento e/ou
 * perímetro (os dois somam), furos e oblongos por quantidade, e o nº de
 * entradas além deles. A área é a do retângulo (o que a planilha usava).
 */
export function geometriaManual(entrada: {
  larguraMm?: number | null;
  comprimentoMm?: number | null;
  perimetroMm?: number | null;
  furos?: { quantidade: number; diametroMm: number }[];
  oblongos?: { quantidade: number; larguraMm: number; comprimentoMm: number; retangular?: boolean }[];
  entradas?: number | null;
}): GeometriaPeca {
  const largura = entrada.larguraMm && entrada.larguraMm > 0 ? entrada.larguraMm : null;
  const comprimento = entrada.comprimentoMm && entrada.comprimentoMm > 0 ? entrada.comprimentoMm : null;
  const retangulo = largura && comprimento ? 2 * largura + 2 * comprimento : 0;
  const perimetro = retangulo + (entrada.perimetroMm && entrada.perimetroMm > 0 ? entrada.perimetroMm : 0);

  const contornos: ContornoInterno[] = [];
  for (const furo of entrada.furos ?? []) {
    if (!(furo.quantidade > 0 && furo.diametroMm > 0)) continue;
    for (let i = 0; i < Math.trunc(furo.quantidade); i++) contornos.push({ tipo: "furo", diametroMm: furo.diametroMm });
  }
  for (const oblongo of entrada.oblongos ?? []) {
    if (!(oblongo.quantidade > 0 && oblongo.larguraMm > 0 && oblongo.comprimentoMm > 0)) continue;
    for (let i = 0; i < Math.trunc(oblongo.quantidade); i++) {
      contornos.push({
        tipo: "oblongo",
        larguraMm: oblongo.larguraMm,
        comprimentoMm: oblongo.comprimentoMm,
        retangular: oblongo.retangular,
      });
    }
  }

  return {
    perimetroExternoMm: perimetro > 0 ? perimetro : null,
    larguraMm: largura,
    comprimentoMm: comprimento,
    areaMm2: largura && comprimento ? largura * comprimento : null,
    contornosInternos: contornos,
    entradasAdicionais: Math.max(0, Math.trunc(entrada.entradas ?? 0)),
  };
}
