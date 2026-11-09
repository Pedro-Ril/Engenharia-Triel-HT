import type { ContornoInterno, GeometriaPeca } from "./tipos";

/*
 * Geometria da peça planificada a partir do DXF (texto ASCII), para o
 * cálculo de tempo: contorno externo, furos, oblongos e demais recortes
 * internos, área e o menor retângulo que envolve a peça. Puro (recebe o
 * texto; quem lê o arquivo é o servidor).
 *
 * Entende LINE, ARC, CIRCLE, LWPOLYLINE (com bulge), POLYLINE/VERTEX,
 * SPLINE e ELLIPSE na seção ENTITIES -- o que os DXFs do 3DX da Triel
 * usam (amostra de 30: LINE, ARC, CIRCLE, poucas SPLINE e LWPOLYLINE,
 * tudo na camada 0, em mm). O resto (texto, cota, bloco) é ignorado com
 * aviso. Linha que não fecha contorno não entra no corte (pode ser
 * gravação ou linha de dobra) e também vira aviso.
 */

type Ponto = { x: number; y: number };

type Trecho = {
  tipo: "linha" | "arco" | "circulo" | "curva";
  /* Pontos em ordem; o círculo vem fechado (último = primeiro). */
  pontos: Ponto[];
  comprimento: number;
  centro?: Ponto;
  raio?: number;
  varreduraRad?: number;
};

type Contorno = {
  trechos: Trecho[];
  pontos: Ponto[];
  comprimento: number;
  area: number;
};

export type ResultadoGeometriaDxf = {
  ok: boolean;
  geometria: GeometriaPeca | null;
  resumo: {
    furos: number;
    oblongos: number;
    recortes: number;
    /* Contornos fechados fora da peça principal (o DXF tem mais de uma peça). */
    pecasExtras: number;
    linhasSoltas: number;
    comprimentoLinhasSoltasMm: number;
  };
  avisos: string[];
  erros: string[];
};

/* Pontas a menos que isto se ligam. */
const TOLERANCIA_LIGACAO = 0.05;
/* Passo máximo ao transformar arco em pontos (para área e retângulo). */
const PASSO_ARCO_RAD = Math.PI / 180;

const ESCALA_UNIDADE: Record<string, number> = { "1": 25.4, "2": 304.8, "4": 1, "5": 10, "6": 1000 };

function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* ---------------- Leitura do texto ---------------- */

type Entidade = { tipo: string; grupos: [number, string][] };

function lerPares(texto: string): [number, string][] {
  const linhas = texto.split(/\r?\n/);
  const pares: [number, string][] = [];
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const codigo = Number(linhas[i].trim());
    if (!Number.isInteger(codigo)) continue;
    pares.push([codigo, linhas[i + 1].trim()]);
  }
  return pares;
}

function lerEntidades(pares: [number, string][]): { entidades: Entidade[]; unidade: string | null } {
  let unidade: string | null = null;
  const entidades: Entidade[] = [];
  let secao: string | null = null;
  let atual: Entidade | null = null;

  for (let i = 0; i < pares.length; i++) {
    const [codigo, valor] = pares[i];

    if (codigo === 9 && valor === "$INSUNITS" && pares[i + 1]?.[0] === 70) unidade = pares[i + 1][1];

    if (codigo === 0 && valor === "SECTION") {
      secao = pares[i + 1]?.[0] === 2 ? pares[i + 1][1] : null;
      continue;
    }
    if (codigo === 0 && valor === "ENDSEC") {
      secao = null;
      atual = null;
      continue;
    }
    if (secao !== "ENTITIES") continue;

    if (codigo === 0) {
      atual = { tipo: valor, grupos: [] };
      entidades.push(atual);
    } else if (atual) {
      atual.grupos.push([codigo, valor]);
    }
  }

  return { entidades, unidade };
}

function valor(e: Entidade, codigo: number, padrao = 0): number {
  const achado = e.grupos.find(([c]) => c === codigo);
  const n = achado ? Number(achado[1]) : NaN;
  return Number.isFinite(n) ? n : padrao;
}

function valores(e: Entidade, codigo: number): number[] {
  return e.grupos.filter(([c]) => c === codigo).map(([, v]) => Number(v));
}

/*
 * Extrusão (0,0,-1): o desenho está espelhado no X. Só vale para quem usa
 * o sistema de coordenadas do objeto (arco, círculo, polilinha); LINE,
 * SPLINE e ELLIPSE já vêm em coordenadas globais.
 */
const USAM_COORDENADAS_DO_OBJETO = new Set(["ARC", "CIRCLE", "LWPOLYLINE"]);

function espelhado(e: Entidade): boolean {
  return USAM_COORDENADAS_DO_OBJETO.has(e.tipo) && valor(e, 230, 1) < 0;
}

/* ---------------- Entidades -> trechos ---------------- */

function pontosDoArco(centro: Ponto, raio: number, inicio: number, varredura: number): Ponto[] {
  const passos = Math.max(2, Math.ceil(Math.abs(varredura) / PASSO_ARCO_RAD));
  const pontos: Ponto[] = [];
  for (let i = 0; i <= passos; i++) {
    const a = inicio + (varredura * i) / passos;
    pontos.push({ x: centro.x + raio * Math.cos(a), y: centro.y + raio * Math.sin(a) });
  }
  return pontos;
}

function trechoDeArco(centro: Ponto, raio: number, inicio: number, varredura: number): Trecho {
  return {
    tipo: "arco",
    pontos: pontosDoArco(centro, raio, inicio, varredura),
    comprimento: Math.abs(varredura) * raio,
    centro,
    raio,
    varreduraRad: Math.abs(varredura),
  };
}

function trechoDeLinha(a: Ponto, b: Ponto): Trecho {
  return { tipo: "linha", pontos: [a, b], comprimento: distancia(a, b) };
}

/* Segmento de polilinha com bulge (tangente de 1/4 do ângulo do arco). */
function trechoComBulge(a: Ponto, b: Ponto, bulge: number): Trecho {
  if (Math.abs(bulge) < 1e-12) return trechoDeLinha(a, b);

  const corda = distancia(a, b);
  const varredura = 4 * Math.atan(bulge);
  const raio = Math.abs(corda / (2 * Math.sin(varredura / 2)));
  /* Do meio da corda até o centro, na normal à esquerda: corda·(1 − b²)/(4b). */
  const afastamento = (corda * (1 - bulge * bulge)) / (4 * bulge);
  const normal = { x: -(b.y - a.y) / corda, y: (b.x - a.x) / corda };
  const centro = { x: (a.x + b.x) / 2 + normal.x * afastamento, y: (a.y + b.y) / 2 + normal.y * afastamento };

  return trechoDeArco(centro, raio, Math.atan2(a.y - centro.y, a.x - centro.x), varredura);
}

function trechosDaPolilinha(vertices: { p: Ponto; bulge: number }[], fechada: boolean): Trecho[] {
  const trechos: Trecho[] = [];
  const total = fechada ? vertices.length : vertices.length - 1;
  for (let i = 0; i < total; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (distancia(a.p, b.p) < 1e-9) continue;
    trechos.push(trechoComBulge(a.p, b.p, a.bulge));
  }
  return trechos;
}

function comprimentoDePontos(pontos: Ponto[]): number {
  let soma = 0;
  for (let i = 1; i < pontos.length; i++) soma += distancia(pontos[i - 1], pontos[i]);
  return soma;
}

/* B-spline racional (de Boor). */
function pontosDaSpline(grau: number, nos: number[], controle: Ponto[], pesos: number[]): Ponto[] {
  const n = controle.length;
  const inicio = nos[grau];
  const fim = nos[n];
  const amostras = Math.max(32, n * 16);
  const pontos: Ponto[] = [];

  for (let s = 0; s <= amostras; s++) {
    const t = inicio + ((fim - inicio) * s) / amostras;
    let k = n - 1;
    for (let i = grau; i < n; i++) {
      if (t >= nos[i] && t < nos[i + 1]) {
        k = i;
        break;
      }
    }

    const d: [number, number, number][] = [];
    for (let j = 0; j <= grau; j++) {
      const i = j + k - grau;
      const w = pesos[i] ?? 1;
      d.push([controle[i].x * w, controle[i].y * w, w]);
    }
    for (let r = 1; r <= grau; r++) {
      for (let j = grau; j >= r; j--) {
        const i = j + k - grau;
        const den = nos[i + grau - r + 1] - nos[i];
        const alfa = den === 0 ? 0 : (t - nos[i]) / den;
        d[j] = [
          (1 - alfa) * d[j - 1][0] + alfa * d[j][0],
          (1 - alfa) * d[j - 1][1] + alfa * d[j][1],
          (1 - alfa) * d[j - 1][2] + alfa * d[j][2],
        ];
      }
    }
    pontos.push({ x: d[grau][0] / d[grau][2], y: d[grau][1] / d[grau][2] });
  }

  return pontos;
}

function trechosDaEntidade(e: Entidade, escala: number, ignoradas: Map<string, number>): Trecho[] {
  const sx = espelhado(e) ? -escala : escala;
  const p = (x: number, y: number): Ponto => ({ x: x * sx, y: y * escala });

  switch (e.tipo) {
    case "LINE":
      return [trechoDeLinha(p(valor(e, 10), valor(e, 20)), p(valor(e, 11), valor(e, 21)))];

    case "CIRCLE": {
      const centro = p(valor(e, 10), valor(e, 20));
      const raio = valor(e, 40) * escala;
      return [{ ...trechoDeArco(centro, raio, 0, 2 * Math.PI), tipo: "circulo" }];
    }

    case "ARC": {
      /* Ângulos em graus, anti-horário; espelhado no X, o arco vira de lado. */
      let a0 = (valor(e, 50) * Math.PI) / 180;
      let a1 = (valor(e, 51) * Math.PI) / 180;
      if (sx < 0) [a0, a1] = [Math.PI - a1, Math.PI - a0];
      let varredura = a1 - a0;
      while (varredura <= 0) varredura += 2 * Math.PI;
      return [trechoDeArco(p(valor(e, 10), valor(e, 20)), valor(e, 40) * escala, a0, varredura)];
    }

    case "LWPOLYLINE": {
      const vertices: { p: Ponto; bulge: number }[] = [];
      for (const [codigo, v] of e.grupos) {
        if (codigo === 10) vertices.push({ p: { x: Number(v), y: 0 }, bulge: 0 });
        else if (codigo === 20 && vertices.length) vertices[vertices.length - 1].p.y = Number(v);
        else if (codigo === 42 && vertices.length) vertices[vertices.length - 1].bulge = Number(v);
      }
      const ajustados = vertices.map((vx) => ({ p: p(vx.p.x, vx.p.y), bulge: sx < 0 ? -vx.bulge : vx.bulge }));
      return trechosDaPolilinha(ajustados, (valor(e, 70) & 1) === 1);
    }

    case "SPLINE": {
      const grau = valor(e, 71, 3);
      const nos = valores(e, 40);
      const xs = valores(e, 10);
      const ys = valores(e, 20);
      const controle = xs.map((x, i) => p(x, ys[i] ?? 0));
      let pontos: Ponto[];
      if (controle.length > grau && nos.length === controle.length + grau + 1) {
        const pesos = valores(e, 41);
        pontos = pontosDaSpline(grau, nos, controle, pesos.length === controle.length ? pesos : controle.map(() => 1));
      } else {
        const fx = valores(e, 11);
        const fy = valores(e, 21);
        pontos = fx.length >= 2 ? fx.map((x, i) => p(x, fy[i] ?? 0)) : controle;
      }
      return pontos.length >= 2 ? [{ tipo: "curva", pontos, comprimento: comprimentoDePontos(pontos) }] : [];
    }

    case "ELLIPSE": {
      const centro = { x: valor(e, 10), y: valor(e, 20) };
      const eixo = { x: valor(e, 11), y: valor(e, 21) };
      const razao = valor(e, 40, 1);
      const t0 = valor(e, 41, 0);
      let t1 = valor(e, 42, 2 * Math.PI);
      if (t1 <= t0) t1 += 2 * Math.PI;
      const a = Math.hypot(eixo.x, eixo.y);
      const rot = Math.atan2(eixo.y, eixo.x);
      const passos = Math.max(32, Math.ceil((t1 - t0) / PASSO_ARCO_RAD));
      const pontos: Ponto[] = [];
      for (let i = 0; i <= passos; i++) {
        const t = t0 + ((t1 - t0) * i) / passos;
        const lx = a * Math.cos(t);
        const ly = a * razao * Math.sin(t);
        pontos.push(p(centro.x + lx * Math.cos(rot) - ly * Math.sin(rot), centro.y + lx * Math.sin(rot) + ly * Math.cos(rot)));
      }
      return [{ tipo: "curva", pontos, comprimento: comprimentoDePontos(pontos) }];
    }

    default:
      ignoradas.set(e.tipo, (ignoradas.get(e.tipo) ?? 0) + 1);
      return [];
  }
}

/* POLYLINE antiga: VERTEX... SEQEND viram uma LWPOLYLINE equivalente. */
function juntarPolylinesAntigas(entidades: Entidade[]): Entidade[] {
  const saida: Entidade[] = [];
  for (let i = 0; i < entidades.length; i++) {
    const e = entidades[i];
    if (e.tipo !== "POLYLINE") {
      saida.push(e);
      continue;
    }
    const grupos: [number, string][] = e.grupos.filter(([c]) => c === 70 || c === 230);
    let j = i + 1;
    for (; j < entidades.length && entidades[j].tipo === "VERTEX"; j++) {
      const v = entidades[j];
      grupos.push([10, String(valor(v, 10))], [20, String(valor(v, 20))], [42, String(valor(v, 42))]);
    }
    if (entidades[j]?.tipo === "SEQEND") j++;
    saida.push({ tipo: "LWPOLYLINE", grupos });
    i = j - 1;
  }
  return saida;
}

/* ---------------- Trechos -> contornos ---------------- */

function area(pontos: Ponto[]): number {
  let soma = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    soma += a.x * b.y - b.x * a.y;
  }
  return soma / 2;
}

function inverter(t: Trecho): Trecho {
  return { ...t, pontos: [...t.pontos].reverse() };
}

function montarContornos(trechos: Trecho[]): { fechados: Contorno[]; abertos: Trecho[][] } {
  const fechados: Contorno[] = [];
  const abertos: Trecho[][] = [];
  const usados = new Array(trechos.length).fill(false);
  const inicio = (t: Trecho) => t.pontos[0];
  const fim = (t: Trecho) => t.pontos[t.pontos.length - 1];

  /* Próximo trecho livre que encosta no ponto (já virado para continuar dali). */
  function proximo(ponto: Ponto): Trecho | null {
    for (let i = 0; i < trechos.length; i++) {
      if (usados[i]) continue;
      if (distancia(inicio(trechos[i]), ponto) <= TOLERANCIA_LIGACAO) {
        usados[i] = true;
        return trechos[i];
      }
      if (distancia(fim(trechos[i]), ponto) <= TOLERANCIA_LIGACAO) {
        usados[i] = true;
        return inverter(trechos[i]);
      }
    }
    return null;
  }

  for (let i = 0; i < trechos.length; i++) {
    if (usados[i]) continue;
    usados[i] = true;
    const cadeia = [trechos[i]];

    if (trechos[i].tipo !== "circulo") {
      for (;;) {
        if (distancia(fim(cadeia[cadeia.length - 1]), inicio(cadeia[0])) <= TOLERANCIA_LIGACAO) break;
        const seguinte = proximo(fim(cadeia[cadeia.length - 1]));
        if (!seguinte) break;
        cadeia.push(seguinte);
      }
    }

    const fechado =
      cadeia[0].tipo === "circulo" || distancia(fim(cadeia[cadeia.length - 1]), inicio(cadeia[0])) <= TOLERANCIA_LIGACAO;

    if (!fechado) {
      /* Aberto: completa para trás também, para contar a cadeia inteira uma vez só. */
      for (;;) {
        const anterior = proximo(inicio(cadeia[0]));
        if (!anterior) break;
        cadeia.unshift(inverter(anterior));
      }
      abertos.push(cadeia);
      continue;
    }

    const pontos: Ponto[] = [];
    for (const t of cadeia) pontos.push(...(pontos.length ? t.pontos.slice(1) : t.pontos));
    if (pontos.length > 1 && distancia(pontos[0], pontos[pontos.length - 1]) <= TOLERANCIA_LIGACAO) pontos.pop();

    fechados.push({
      trechos: cadeia,
      pontos,
      comprimento: cadeia.reduce((s, t) => s + t.comprimento, 0),
      area: Math.abs(area(pontos)),
    });
  }

  return { fechados, abertos };
}

function dentro(ponto: Ponto, poligono: Ponto[]): boolean {
  let resultado = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.y > ponto.y !== b.y > ponto.y && ponto.x < ((b.x - a.x) * (ponto.y - a.y)) / (b.y - a.y) + a.x) {
      resultado = !resultado;
    }
  }
  return resultado;
}

/* Menor retângulo (qualquer ângulo) que envolve os pontos: fecho convexo + teste em cada aresta. */
export function menorRetangulo(pontos: Ponto[]): { larguraMm: number; comprimentoMm: number } {
  const ordenados = [...pontos].sort((a, b) => a.x - b.x || a.y - b.y);
  const cruz = (o: Ponto, a: Ponto, b: Ponto) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const inferior: Ponto[] = [];
  for (const p of ordenados) {
    while (inferior.length >= 2 && cruz(inferior[inferior.length - 2], inferior[inferior.length - 1], p) <= 0) inferior.pop();
    inferior.push(p);
  }
  const superior: Ponto[] = [];
  for (const p of [...ordenados].reverse()) {
    while (superior.length >= 2 && cruz(superior[superior.length - 2], superior[superior.length - 1], p) <= 0) superior.pop();
    superior.push(p);
  }
  const fecho = [...inferior.slice(0, -1), ...superior.slice(0, -1)];

  let melhor = { area: Infinity, larguraMm: 0, comprimentoMm: 0 };
  for (let i = 0; i < fecho.length; i++) {
    const a = fecho[i];
    const b = fecho[(i + 1) % fecho.length];
    const angulo = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(-angulo);
    const s = Math.sin(-angulo);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of fecho) {
      const x = p.x * c - p.y * s;
      const y = p.x * s + p.y * c;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w * h < melhor.area - 1e-6) melhor = { area: w * h, larguraMm: Math.min(w, h), comprimentoMm: Math.max(w, h) };
  }

  return { larguraMm: melhor.larguraMm, comprimentoMm: melhor.comprimentoMm };
}

/* Furo (círculo, inteiro ou em arcos), oblongo (2 retas + 2 meias-voltas) ou recorte qualquer. */
function classificar(contorno: Contorno): ContornoInterno {
  const { trechos } = contorno;
  const arcos = trechos.filter((t) => t.tipo === "arco" || t.tipo === "circulo");
  const linhas = trechos.filter((t) => t.tipo === "linha");

  if (arcos.length === trechos.length) {
    const [primeiro] = arcos;
    const mesmoCirculo = arcos.every(
      (t) => distancia(t.centro as Ponto, primeiro.centro as Ponto) <= TOLERANCIA_LIGACAO && Math.abs((t.raio as number) - (primeiro.raio as number)) <= TOLERANCIA_LIGACAO
    );
    const voltaInteira = Math.abs(arcos.reduce((s, t) => s + (t.varreduraRad as number), 0) - 2 * Math.PI) < 0.01;
    if (mesmoCirculo && voltaInteira) return { tipo: "furo", diametroMm: 2 * (primeiro.raio as number) };
  }

  if (trechos.length === 4 && arcos.length === 2 && linhas.length === 2) {
    const [a1, a2] = arcos;
    const meiaVolta = (t: Trecho) => Math.abs((t.varreduraRad as number) - Math.PI) < 0.01;
    const mesmoRaio = Math.abs((a1.raio as number) - (a2.raio as number)) <= TOLERANCIA_LIGACAO;
    const retasIguais = Math.abs(linhas[0].comprimento - linhas[1].comprimento) <= TOLERANCIA_LIGACAO;
    if (meiaVolta(a1) && meiaVolta(a2) && mesmoRaio && retasIguais) {
      const largura = 2 * (a1.raio as number);
      return { tipo: "oblongo", larguraMm: largura, comprimentoMm: linhas[0].comprimento + largura };
    }
  }

  return { tipo: "recorte", perimetroMm: contorno.comprimento, menorDimensaoMm: menorRetangulo(contorno.pontos).larguraMm };
}

/* ---------------- Entrada ---------------- */

export function lerGeometriaDxf(texto: string): ResultadoGeometriaDxf {
  const avisos: string[] = [];
  const resumoVazio = { furos: 0, oblongos: 0, recortes: 0, pecasExtras: 0, linhasSoltas: 0, comprimentoLinhasSoltasMm: 0 };

  if (/^AutoCAD Binary DXF/.test(texto)) {
    return { ok: false, geometria: null, resumo: resumoVazio, avisos, erros: ["DXF binário não é lido; salve como DXF texto."] };
  }

  const { entidades, unidade } = lerEntidades(lerPares(texto));
  let escala = 1;
  if (unidade && unidade !== "0") {
    if (ESCALA_UNIDADE[unidade] === undefined) {
      return { ok: false, geometria: null, resumo: resumoVazio, avisos, erros: [`Unidade do DXF não reconhecida ($INSUNITS = ${unidade}).`] };
    }
    escala = ESCALA_UNIDADE[unidade];
    if (escala !== 1) avisos.push(`DXF em outra unidade ($INSUNITS = ${unidade}): convertido para mm.`);
  } else {
    avisos.push("O DXF não informa a unidade: considerado em mm.");
  }

  const ignoradas = new Map<string, number>();
  const trechos = juntarPolylinesAntigas(entidades).flatMap((e) => trechosDaEntidade(e, escala, ignoradas));
  if (ignoradas.size) {
    avisos.push(`Ignorado no DXF: ${[...ignoradas].map(([tipo, n]) => `${n} ${tipo}`).join(", ")}.`);
  }

  const { fechados, abertos } = montarContornos(trechos);
  if (fechados.length === 0) {
    return { ok: false, geometria: null, resumo: resumoVazio, avisos, erros: ["Nenhum contorno fechado no DXF."] };
  }

  const ordenados = [...fechados].sort((a, b) => b.area - a.area);
  const externo = ordenados[0];
  const internos: Contorno[] = [];
  let pecasExtras = 0;
  for (const c of ordenados.slice(1)) {
    if (dentro(c.pontos[0], externo.pontos)) internos.push(c);
    else pecasExtras++;
  }

  const contornosInternos = internos.map(classificar);
  const resumo = {
    furos: contornosInternos.filter((c) => c.tipo === "furo").length,
    oblongos: contornosInternos.filter((c) => c.tipo === "oblongo").length,
    recortes: contornosInternos.filter((c) => c.tipo === "recorte").length,
    pecasExtras,
    linhasSoltas: abertos.length,
    comprimentoLinhasSoltasMm: abertos.reduce((s, cadeia) => s + cadeia.reduce((t, tr) => t + tr.comprimento, 0), 0),
  };

  if (pecasExtras) avisos.push(`O DXF tem ${pecasExtras + 1} peças separadas: só a maior foi considerada.`);
  if (abertos.length) {
    avisos.push(
      `${abertos.length} ${abertos.length === 1 ? "linha não fecha" : "linhas não fecham"} contorno (${resumo.comprimentoLinhasSoltasMm.toFixed(0)} mm) e não ${abertos.length === 1 ? "entrou" : "entraram"} no corte -- gravação, dobra ou desenho aberto?`
    );
  }

  const retangulo = menorRetangulo(externo.pontos);

  return {
    ok: true,
    geometria: {
      perimetroExternoMm: externo.comprimento,
      larguraMm: retangulo.larguraMm,
      comprimentoMm: retangulo.comprimentoMm,
      areaMm2: externo.area - internos.reduce((s, c) => s + c.area, 0),
      contornosInternos,
      entradasAdicionais: 0,
    },
    resumo,
    avisos,
    erros: [],
  };
}
