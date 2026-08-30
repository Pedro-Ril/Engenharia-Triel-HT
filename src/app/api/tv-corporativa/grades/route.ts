import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { criarGrade, listarGrades } from "@/lib/tv/grades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  try {
    const grades = await listarGrades();
    return NextResponse.json({ ok: true, data: grades });
  } catch (error) {
    console.error("Erro ao listar grades de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as grades." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv-corporativa/grades", handleGET);

interface CriarGradeBody {
  nome?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  let body: CriarGradeBody;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    body = parsedBody;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  try {
    const nome = requiredText(body.nome, "nome", 150);

    const grade = await criarGrade({ nome, criadoPor: acesso.usuario.samAccountName });

    return NextResponse.json(
      { ok: true, message: "Grade criada.", data: grade },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar grade de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar a grade." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("tv-corporativa/grades", handlePOST);
