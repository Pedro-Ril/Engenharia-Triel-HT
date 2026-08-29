import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { listarUsuarios } from "@/lib/auth/admin";
import { ValidationError } from "@/lib/auth/errors";
import { importarUsuariosDoGrupoAd } from "@/lib/auth/importacao-usuarios";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const resultado = await importarUsuariosDoGrupoAd();
    const usuarios = await listarUsuarios();

    return NextResponse.json({
      ok: true,
      message: `${resultado.encontrados} usuário(s) encontrado(s) no grupo: ${resultado.criados} novo(s), ${resultado.atualizados} já existiam e foram atualizados.`,
      data: { ...resultado, usuarios },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao importar usuários do AD:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível importar os usuários do AD." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/usuarios/importar-ad", handlePOST);
