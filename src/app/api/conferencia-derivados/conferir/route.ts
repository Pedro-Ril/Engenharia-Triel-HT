import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { conferirArquivosDerivados } from "@/lib/conferencia-derivados/conferencia";
import { separarCodigos } from "@/lib/conferencia-derivados/regra-codigo";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  ehTipoArquivoDerivado,
  LIMITE_CODIGOS,
  type TipoArquivoDerivado,
} from "@/modules/conferencia-derivados/constants/tipos-arquivo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO = "conferencia-derivados";

function lerTipos(valor: unknown): TipoArquivoDerivado[] {
  if (!Array.isArray(valor)) {
    throw new ValidationError("Informe os tipos de arquivo a conferir.");
  }

  const tipos = [...new Set(valor)].filter(ehTipoArquivoDerivado);

  if (tipos.length === 0) {
    throw new ValidationError("Marque ao menos um tipo de arquivo: PDF, DXF ou STEP.");
  }

  return tipos;
}

function lerCodigos(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    throw new ValidationError("Informe a lista de códigos.");
  }

  /* Reaplica a separação no servidor: não confia no que o cliente
     mandou já "limpo". */
  const codigos = separarCodigos(valor.map((item) => String(item ?? "")).join("\n"));

  if (codigos.length === 0) {
    throw new ValidationError("Nenhum código foi informado.");
  }

  if (codigos.length > LIMITE_CODIGOS) {
    throw new ValidationError(
      `São ${codigos.length} códigos; o limite por conferência é ${LIMITE_CODIGOS}. Divida a lista.`
    );
  }

  return codigos;
}

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi(MODULO);
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json().catch(() => null);

    if (!isObject(corpo)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const tipos = lerTipos(corpo.tipos);
    const codigos = lerCodigos(corpo.codigos);

    const resultado = await conferirArquivosDerivados(codigos, tipos);

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro na conferência de arquivos derivados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível fazer a conferência." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("conferencia-derivados/conferir", handlePOST);
