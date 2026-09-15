import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { buscarUsuariosParaSelecao } from "@/lib/auth/usuarios";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Só exige login (não admin) -- alimenta o seletor de "usuário em cópia"/"abrir em nome de", usado por atendentes e solicitantes comuns. */
async function handleGET(request: Request) {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return NextResponse.json(
      { ok: false, message: "É necessário estar autenticado." },
      { status: 401 }
    );
  }

  const termo = new URL(request.url).searchParams.get("q") ?? "";

  try {
    const usuarios = await buscarUsuariosParaSelecao(termo);
    return NextResponse.json({ ok: true, data: usuarios });
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar usuários." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("chamados/usuarios-busca", handleGET);
