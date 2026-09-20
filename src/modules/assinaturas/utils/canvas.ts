"use client";

import type { CamposAssinaturaConfig, ValoresFormularioAssinatura } from "../types/assinaturas.types";

/*
 * Porta de Gerador_Assinaturas/script.js (carregarFontes) -- só as 4
 * fontes de fato usadas pelos modelos hoje (ver plano de migração).
 * Registradas com o MESMO nome de família usado em CampoAssinaturaConfig.fonte,
 * pra `ctx.font = '${tamanho}px "${fonte}"'` funcionar direto, sem precisar
 * de um segundo mapeamento peso/família.
 */
const FONTES: { familia: string; arquivo: string }[] = [
  { familia: "Metropolis", arquivo: "/assinaturas/fontes/Metropolis-Regular.otf" },
  { familia: "Metropolis Bold", arquivo: "/assinaturas/fontes/Metropolis-Bold.otf" },
  { familia: "Montserrat", arquivo: "/assinaturas/fontes/Montserrat-Regular.ttf" },
  { familia: "Montserrat Bold", arquivo: "/assinaturas/fontes/Montserrat-Bold.ttf" },
];

let promessaFontes: Promise<void> | null = null;

/* Idempotente -- chamável várias vezes (tela de geração + preview do editor de modelos no admin) sem recarregar as fontes de novo. */
export function carregarFontesAssinatura(): Promise<void> {
  if (!promessaFontes) {
    promessaFontes = Promise.all(
      FONTES.map(async ({ familia, arquivo }) => {
        const fonte = new FontFace(familia, `url(${arquivo})`);
        await fonte.load();
        document.fonts.add(fonte);
      })
    ).then(() => undefined);
  }

  return promessaFontes;
}

export function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Erro ao carregar imagem: ${url}`));
    img.src = url;
  });
}

export type PosicoesDesenhadas = Record<keyof CamposAssinaturaConfig, { x: number; y: number }>;

/*
 * Só a matemática de posição (sem desenhar nada) -- usado tanto por
 * desenharAssinaturaNoCanvas quanto pelo editor de modelos, que precisa
 * recalcular a posição real do "sobrenome" (quando seguirNome) a cada
 * pixel arrastado, sem pagar o custo de um drawImage/fillText completo
 * a cada movimento do mouse.
 */
export function calcularPosicoesAssinatura(
  ctx: CanvasRenderingContext2D | null,
  camposConfig: CamposAssinaturaConfig,
  valores: ValoresFormularioAssinatura
): PosicoesDesenhadas {
  const { nome: campoNome, sobrenome: campoSobrenome, setor: campoSetor, email: campoEmail, celular: campoCelular } =
    camposConfig;

  const xSobrenome = campoSobrenome.seguirNome
    ? campoNome.x +
      (ctx ? medirLarguraTexto(ctx, valores.nome, campoNome.fonte, campoNome.tamanhoPx) : 0) +
      campoSobrenome.espacamentoAposNomePx
    : campoSobrenome.x;

  return {
    nome: { x: campoNome.x, y: campoNome.y },
    sobrenome: { x: xSobrenome, y: campoSobrenome.y },
    setor: { x: campoSetor.x, y: campoSetor.y },
    email: { x: campoEmail.x, y: campoEmail.y },
    celular: { x: campoCelular.x, y: campoCelular.y },
  };
}

/*
 * Porta de desenharTexto/calcularPosicaoSobrenome
 * (Gerador_Assinaturas/script.js:106-203) -- generalizado pra ler
 * posição/fonte/cor de camposConfig (dado do modelo, vindo do banco) em
 * vez de um switch hardcoded por nome de arquivo de imagem. Reaproveitado
 * tanto pela tela de geração quanto pelo preview do editor de modelos.
 */
export function desenharAssinaturaNoCanvas(
  canvas: HTMLCanvasElement,
  imagemFundo: HTMLImageElement,
  camposConfig: CamposAssinaturaConfig,
  valores: ValoresFormularioAssinatura
): PosicoesDesenhadas {
  const ctx = canvas.getContext("2d");

  canvas.width = imagemFundo.naturalWidth;
  canvas.height = imagemFundo.naturalHeight;

  const { nome: campoNome, sobrenome: campoSobrenome, setor: campoSetor, email: campoEmail, celular: campoCelular } =
    camposConfig;

  const posicoes = calcularPosicoesAssinatura(ctx, camposConfig, valores);
  const xSobrenome = posicoes.sobrenome.x;

  if (!ctx) return posicoes;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagemFundo, 0, 0, canvas.width, canvas.height);

  ctx.font = `${campoNome.tamanhoPx}px "${campoNome.fonte}"`;
  ctx.fillStyle = campoNome.cor;
  ctx.fillText(valores.nome, campoNome.x, campoNome.y);

  ctx.font = `${campoSobrenome.tamanhoPx}px "${campoSobrenome.fonte}"`;
  ctx.fillStyle = campoSobrenome.cor;
  ctx.fillText(valores.sobrenome, xSobrenome, campoSobrenome.y);

  ctx.font = `${campoSetor.tamanhoPx}px "${campoSetor.fonte}"`;
  ctx.fillStyle = campoSetor.cor;
  ctx.fillText(valores.setor, campoSetor.x, campoSetor.y);

  ctx.font = `${campoEmail.tamanhoPx}px "${campoEmail.fonte}"`;
  ctx.fillStyle = campoEmail.cor;
  ctx.fillText(valores.email, campoEmail.x, campoEmail.y);

  if (valores.celular.trim()) {
    ctx.font = `${campoCelular.tamanhoPx}px "${campoCelular.fonte}"`;
    ctx.fillStyle = campoCelular.cor;
    ctx.fillText(valores.celular, campoCelular.x, campoCelular.y);
  }

  return posicoes;
}

function medirLarguraTexto(ctx: CanvasRenderingContext2D, texto: string, fonte: string, tamanhoPx: number): number {
  ctx.font = `${tamanhoPx}px "${fonte}"`;
  return ctx.measureText(texto).width;
}
