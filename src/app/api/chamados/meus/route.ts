import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { listarChamadosDoUsuario } from "@/lib/chamados/chamados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return NextResponse.json(
      { ok: false, message: "É necessário estar autenticado." },
      { status: 401 }
    );
  }

  try {
    const chamados = await listarChamadosDoUsuario(usuario.id);
    return NextResponse.json({ ok: true, data: chamados });
  } catch (error) {
    console.error("Erro ao listar chamados do usuário:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar seus chamados." },
      { status: 500 }
    );
  }
}
