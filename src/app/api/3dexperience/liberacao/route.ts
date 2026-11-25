import { after, NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import {
  executarSimulacao,
  executarSimulacaoLista,
  iniciarSimulacao,
  iniciarSimulacaoLista,
  listarRodadas,
  MAX_CODIGOS_LISTA,
  type TipoRodada,
} from "@/lib/3dexperience/liberacao-desenhos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS: TipoRodada[] = ["todas", "simulacao", "liberacao"];

/*
 * Histórico de rodadas (simulações e liberações), paginado -- o registro
 * do período de teste. Query: pagina, porPagina, codigo (parte do código
 * do pai), tipo (todas | simulacao | liberacao).
 */
async function handleGET(request: Request) {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(url.searchParams.get("porPagina")) || 20));
  const codigo = (url.searchParams.get("codigo") ?? "").trim().slice(0, 50) || null;
  const tipoParam = url.searchParams.get("tipo") as TipoRodada | null;
  const tipo = tipoParam && TIPOS.includes(tipoParam) ? tipoParam : "todas";

  try {
    return NextResponse.json({ ok: true, data: await listarRodadas({ pagina, porPagina, codigo, tipo }) });
  } catch (error) {
    console.error("Erro ao listar as rodadas de liberação de desenhos:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível listar as rodadas." }, { status: 500 });
  }
}

export const GET = comMetricasApi("3dexperience/liberacao", handleGET);

const CODIGO_VALIDO = /^[0-9A-Za-z._-]+$/;

/* Lista de códigos de modelo: texto livre (um por linha, vírgula, espaço ou ponto e vírgula) ou array; sem repetidos. */
function lerCodigos(valor: unknown): string[] {
  const partes = Array.isArray(valor) ? valor : typeof valor === "string" ? valor.split(/[\s,;]+/) : null;
  if (!partes) throw new ValidationError("Informe a lista de códigos de modelo.");
  const codigos: string[] = [];
  const vistos = new Set<string>();
  for (const parte of partes) {
    if (typeof parte !== "string") throw new ValidationError("A lista de códigos deve ter só texto.");
    const codigo = parte.trim();
    if (!codigo) continue;
    if (codigo.length > 50 || !CODIGO_VALIDO.test(codigo)) throw new ValidationError(`Código inválido na lista: ${codigo.slice(0, 60)}`);
    const chave = codigo.toUpperCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    codigos.push(codigo);
  }
  if (codigos.length === 0) throw new ValidationError("Informe pelo menos um código de modelo.");
  if (codigos.length > MAX_CODIGOS_LISTA) {
    throw new ValidationError(`No máximo ${MAX_CODIGOS_LISTA} códigos por lista (foram ${codigos.length}). Divida em partes.`);
  }
  return codigos;
}

/*
 * Começa a SIMULAÇÃO de um item pai ({ codigo }) ou de uma lista de
 * códigos de modelo ({ codigos }). Devolve o id na hora; a busca dos
 * desenhos e o job no 3DX rodam depois da resposta -- a tela acompanha
 * por GET /api/3dexperience/liberacao/{id}.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    if (body.codigos !== undefined) {
      const codigos = lerCodigos(body.codigos);
      const id = await iniciarSimulacaoLista(codigos, acesso.usuario);
      after(() => executarSimulacaoLista(id, codigos));
      return NextResponse.json({ ok: true, data: { id } }, { status: 202 });
    }
    const codigo = requiredText(body.codigo, "código do item pai", 50).trim();
    if (!/^[0-9A-Za-z._-]+$/.test(codigo)) throw new ValidationError("Código do item inválido.");

    const id = await iniciarSimulacao(codigo, acesso.usuario);
    after(() => executarSimulacao(id, codigo));

    return NextResponse.json({ ok: true, data: { id } }, { status: 202 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao iniciar a simulação de liberação de desenhos:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível iniciar a simulação." }, { status: 500 });
  }
}

export const POST = comMetricasApi("3dexperience/liberacao", handlePOST);
