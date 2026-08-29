import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { listarUsuarios } from "@/lib/auth/admin";
import { ValidationError } from "@/lib/auth/errors";
import { atualizarUsuariosExistentesComAd } from "@/lib/auth/importacao-usuarios";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const resultado = await atualizarUsuariosExistentesComAd();
    const usuarios = await listarUsuarios();

    const sufixoNaoEncontrados =
      resultado.naoEncontrados > 0
        ? `, ${resultado.naoEncontrados} não encontrado(s) no AD`
        : "";

    return NextResponse.json({
      ok: true,
      message: `${resultado.verificados} usuário(s) verificado(s): ${resultado.atualizados} atualizado(s)${sufixoNaoEncontrados}.`,
      data: { ...resultado, usuarios },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar usuários a partir do AD:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar os usuários a partir do AD." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/usuarios/atualizar-ad", handlePOST);
