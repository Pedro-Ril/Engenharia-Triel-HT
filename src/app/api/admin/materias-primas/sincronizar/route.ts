import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import {
  SincronizacaoCanceladaError,
  sincronizarCatalogoMateriaPrima,
} from "@/lib/materias-primas/materias-primas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SincronizarBody {
  codEmpresa?: unknown;
}

/*
 * Versão do painel de admin — aceita sincronizar QUALQUER empresa
 * (não só a do usuário logado), pra um admin conseguir atualizar o
 * catálogo de todas as empresas já conhecidas a partir de uma
 * mesma tela.
 */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: SincronizarBody;

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
    const codEmpresa = requiredText(body.codEmpresa, "código da empresa", 30);

    const { totalItens } = await sincronizarCatalogoMateriaPrima(
      codEmpresa,
      acesso.usuario.samAccountName
    );

    return NextResponse.json({
      ok: true,
      message: `Catálogo sincronizado: ${totalItens} matérias-primas.`,
      data: { totalItens },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    if (error instanceof SincronizacaoCanceladaError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }

    console.error("Erro ao sincronizar catálogo de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível sincronizar o catálogo com o ERP." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/materias-primas/sincronizar", handlePOST);
