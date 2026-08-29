import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { forcarLogoutUsuario } from "@/lib/auth/admin";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePOST(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do usuário é inválido." },
      { status: 400 }
    );
  }

  try {
    const usuario = await forcarLogoutUsuario(id);

    if (!usuario) {
      return NextResponse.json(
        { ok: false, message: "Usuário não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Sessão de ${usuario.nomeExibicao} encerrada.`,
      data: usuario,
    });
  } catch (error) {
    console.error("Erro ao forçar logout do usuário:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível encerrar a sessão do usuário." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/usuarios/[id]/forcar-logout", handlePOST);
