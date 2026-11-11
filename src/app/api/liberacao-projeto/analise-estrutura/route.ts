import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { analisarEstruturaDaLiberacao } from "@/lib/liberacao-projeto/analise-estrutura";
import { ehClienteCiber } from "@/lib/liberacao-projeto/analise-regras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Pede a conferência "código do item = código do desenho" da estrutura de
 * um projeto liberado (body `{ codigo, cliente, ordem, nome }`). Responde
 * 202 na hora e a análise segue em segundo plano (ver analise-estrutura.ts);
 * se houver divergência, quem está logado recebe um e-mail. Cliente Ciber
 * não é analisado.
 */
export async function POST(request: Request) {
  const acesso = await verificarAcessoModuloApi("liberacao-projeto");
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    const codigo = requiredText(body.codigo, "Código CJ Geral", 50);
    if (!/^[0-9A-Za-z._-]+$/.test(codigo)) throw new ValidationError("Código CJ Geral inválido.");
    const cliente = optionalText(body.cliente, "cliente", 200) ?? "";
    const ordem = optionalText(body.ordem, "ordem", 100) ?? "";
    const responsavel = optionalText(body.nome, "nome", 200) ?? "";

    if (ehClienteCiber(cliente)) {
      return NextResponse.json({ ok: true, data: { analisando: false } }, { status: 200 });
    }

    /* Sem await: a resposta não espera o ERP nem o e-mail. */
    void analisarEstruturaDaLiberacao({ codigo, cliente, ordem, responsavel }, acesso.usuario);

    return NextResponse.json({ ok: true, data: { analisando: true } }, { status: 202 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao pedir a análise da estrutura da liberação:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível pedir a análise da estrutura." }, { status: 500 });
  }
}
