import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { forcarLogoutTodos } from "@/lib/auth/admin";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { totalAfetados } = await forcarLogoutTodos();

    return NextResponse.json({
      ok: true,
      message: `${totalAfetados} sessão(ões) encerrada(s). Administradores continuam logados.`,
      data: { totalAfetados },
    });
  } catch (error) {
    console.error("Erro ao forçar logout de todos os usuários:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível encerrar as sessões." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/usuarios/forcar-logout-todos", handlePOST);
