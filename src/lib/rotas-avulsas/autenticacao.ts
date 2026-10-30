import "server-only";

import { NextResponse } from "next/server";

import { extrairIpOrigem } from "@/lib/auth/login-historico";

import { consumirLimite, registrarFalhaToken, segundosDeBloqueioIp } from "./limite";
import {
  buscarConfigRotaAvulsa,
  buscarTokenPorValor,
  registrarLogRotaAvulsa,
  registrarUsoToken,
  tokenTemFormatoValido,
  type ConfigRotaAvulsa,
  type ResultadoLogRotaAvulsa,
  type TokenRotaAvulsa,
} from "./rotas-avulsas";

/*
 * Porta de entrada de toda rota avulsa. Ordem pensada para gastar o
 * mínimo com quem não tem acesso: IP bloqueado -> rota desligada ->
 * formato do token -> token no banco -> limite de requisições. Tudo isso
 * acontece ANTES de ler o corpo da requisição.
 *
 * Quem chama recebe sempre a mesma mensagem genérica para qualquer
 * problema de token (ausente, errado, revogado, expirado, de outra rota);
 * o motivo exato fica só no log.
 *
 * Toda resposta passa por `responder`, que grava a linha de log com a
 * duração. Exceção deliberada: IP já bloqueado não gera log a cada
 * tentativa (senão um ataque enche a tabela) — só o momento do bloqueio.
 */

export interface ContextoRotaAvulsa {
  rotaChave: string;
  metodo: string;
  caminho: string;
  ip: string | null;
  inicio: number;
  token: TokenRotaAvulsa | null;
}

export interface RespostaRotaAvulsa {
  status: number;
  resultado: ResultadoLogRotaAvulsa;
  /* Motivo interno, para o log. */
  motivo: string | null;
  corpo: { ok: boolean; message?: string; data?: unknown };
  detalhes?: unknown;
  cabecalhos?: Record<string, string>;
}

const MENSAGEM_TOKEN = "Token ausente ou inválido.";

export async function responder(ctx: ContextoRotaAvulsa, resposta: RespostaRotaAvulsa): Promise<NextResponse> {
  await registrarLogRotaAvulsa({
    rotaChave: ctx.rotaChave,
    tokenId: ctx.token?.id ?? null,
    tokenNome: ctx.token?.nome ?? null,
    ipOrigem: ctx.ip,
    metodo: ctx.metodo,
    caminho: ctx.caminho,
    statusHttp: resposta.status,
    resultado: resposta.resultado,
    motivo: resposta.motivo,
    detalhes: resposta.detalhes,
    duracaoMs: Date.now() - ctx.inicio,
  });
  return respostaJson(resposta.status, resposta.corpo, resposta.cabecalhos);
}

function respostaJson(status: number, corpo: unknown, cabecalhos?: Record<string, string>): NextResponse {
  return NextResponse.json(corpo, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...cabecalhos },
  });
}

function muitasRequisicoes(segundos: number) {
  return {
    status: 429,
    corpo: { ok: false, message: `Muitas requisições. Tente de novo em ${segundos} segundo(s).` },
    cabecalhos: { "Retry-After": String(segundos) },
  };
}

export type AutenticacaoRotaAvulsa =
  | { ok: true; ctx: ContextoRotaAvulsa & { token: TokenRotaAvulsa }; rota: ConfigRotaAvulsa }
  | { ok: false; resposta: NextResponse };

export async function autenticarRotaAvulsa(request: Request, rotaChave: string): Promise<AutenticacaoRotaAvulsa> {
  const ctx: ContextoRotaAvulsa = {
    rotaChave,
    metodo: request.method,
    caminho: new URL(request.url).pathname,
    ip: extrairIpOrigem(request),
    inicio: Date.now(),
    token: null,
  };

  const bloqueio = segundosDeBloqueioIp(ctx.ip);
  if (bloqueio > 0) {
    const r = muitasRequisicoes(bloqueio);
    return { ok: false, resposta: respostaJson(r.status, r.corpo, r.cabecalhos) };
  }

  const rota = await buscarConfigRotaAvulsa(rotaChave);
  if (!rota?.ativo) {
    return {
      ok: false,
      resposta: await responder(ctx, {
        status: 503,
        resultado: "recusado",
        motivo: "Rota desligada na administração.",
        corpo: { ok: false, message: "Serviço indisponível no momento." },
      }),
    };
  }

  const cabecalho = request.headers.get("authorization") ?? "";
  const valor = /^Bearer\s+(\S+)$/i.exec(cabecalho.trim())?.[1] ?? "";

  let motivoFalha: string | null = null;
  let token: TokenRotaAvulsa | null = null;

  if (!valor) motivoFalha = "Sem token no cabeçalho Authorization.";
  else if (!tokenTemFormatoValido(valor)) motivoFalha = "Token em formato inválido.";
  else {
    token = await buscarTokenPorValor(valor);
    if (!token) motivoFalha = "Token não cadastrado.";
    else if (token.rotaChave !== rotaChave) motivoFalha = `Token de outra rota (${token.rotaChave}).`;
    else if (token.situacao === "revogado") motivoFalha = "Token revogado.";
    else if (token.situacao === "expirado") motivoFalha = "Token expirado.";
  }

  if (motivoFalha) {
    const acabouDeBloquear = registrarFalhaToken(ctx.ip);
    /* Token conhecido (revogado/expirado/de outra rota) aparece no log com o nome do sistema. */
    ctx.token = token;
    return {
      ok: false,
      resposta: await responder(ctx, {
        status: 401,
        resultado: "recusado",
        motivo: acabouDeBloquear ? `${motivoFalha} IP bloqueado por 15 minutos após 10 falhas.` : motivoFalha,
        corpo: { ok: false, message: MENSAGEM_TOKEN },
        cabecalhos: { "WWW-Authenticate": 'Bearer realm="portal-triel-ht"' },
      }),
    };
  }

  const tokenValido = token as TokenRotaAvulsa;
  ctx.token = tokenValido;

  const limite = consumirLimite(tokenValido.id, {
    porSegundo: rota.limitePorSegundo,
    rajada: rota.rajada,
    porMinuto: rota.limitePorMinuto,
  });
  if (!limite.ok) {
    return {
      ok: false,
      resposta: await responder(ctx, {
        resultado: "recusado",
        motivo: `Limite de requisições atingido (aguardar ${limite.aguardarSegundos}s).`,
        ...muitasRequisicoes(limite.aguardarSegundos),
      }),
    };
  }

  await registrarUsoToken(tokenValido.id, ctx.ip);
  return { ok: true, ctx: { ...ctx, token: tokenValido }, rota };
}
