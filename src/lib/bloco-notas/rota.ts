import "server-only";

import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";

import { ConflitoVersaoError } from "./bloco-notas";

/* Peças comuns das rotas de /api/bloco-notas/**. */

export const MODULO_BLOCO_NOTAS = "bloco-notas";

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && PADRAO_UUID.test(valor);
}

export function idInvalido(): NextResponse {
  return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
}

/* Validação -> 400, conflito de versão -> 409 (com a versão atual), o resto -> 500 com log. */
export function respostaDeErro(error: unknown, contexto: string): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  if (error instanceof ConflitoVersaoError) {
    return NextResponse.json(
      { ok: false, message: error.message, data: { versaoAtual: error.versaoAtual } },
      { status: 409 }
    );
  }

  console.error(`Erro no Bloco de Notas (${contexto}):`, error);
  return NextResponse.json(
    { ok: false, message: "Não foi possível concluir a operação. Tente de novo." },
    { status: 500 }
  );
}
