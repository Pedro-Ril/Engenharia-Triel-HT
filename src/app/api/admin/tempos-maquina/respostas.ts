import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";

/* Respostas comuns das rotas de admin do cálculo de tempo. */

export async function lerCorpo(request: Request): Promise<Record<string, unknown>> {
  const corpo: unknown = await request.json().catch(() => null);
  if (!isObject(corpo)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
  return corpo;
}

export function respostaDeErro(error: unknown, mensagem: string) {
  if (error instanceof ValidationError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }
  console.error(`${mensagem}:`, error);
  return NextResponse.json({ ok: false, message: `${mensagem}.` }, { status: 500 });
}
