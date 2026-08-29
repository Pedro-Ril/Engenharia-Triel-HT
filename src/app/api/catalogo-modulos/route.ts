import { NextResponse } from "next/server";

import {
  getTodosSetoresComStatusAcesso,
  getUsuarioAutenticado,
} from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return NextResponse.json(
      { ok: false, message: "É necessário estar autenticado." },
      { status: 401 }
    );
  }

  try {
    const setores = await getTodosSetoresComStatusAcesso(usuario);
    return NextResponse.json({ ok: true, data: setores });
  } catch (error) {
    console.error("Erro ao buscar o catálogo de módulos:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o catálogo de ferramentas." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("catalogo-modulos", handleGET);
