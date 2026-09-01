import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { buscarEmpresaPorId } from "@/lib/empresas/empresas";
import { validarCodigosNoErp } from "@/lib/estrutura-substituicao/estrutura-substituicao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ValidarBody {
  empresaId?: unknown;
  codigos?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("substituicao-estrutura");
  if (acesso.negado) return acesso.negado;

  let body: ValidarBody;

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
    const empresaId = requiredText(body.empresaId, "empresaId", 36);

    if (!Array.isArray(body.codigos) || body.codigos.some((c) => typeof c !== "string")) {
      throw new ValidationError("Informe uma lista de códigos (texto) para validar.");
    }

    const empresa = await buscarEmpresaPorId(empresaId);
    if (!empresa) {
      throw new ValidationError("Empresa não encontrada.");
    }
    if (!empresa.codigo) {
      throw new ValidationError(
        `A empresa "${empresa.nome}" não tem um código de empresa (cod_emp) cadastrado.`
      );
    }

    const resultado = await validarCodigosNoErp(body.codigos as string[], empresa.codigo);

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao validar códigos no ERP:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível validar os códigos." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estrutura-substituicao/validar", handlePOST);
