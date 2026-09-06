import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarTransferenciasDoUsuario } from "@/lib/transferencia/transferencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("transferencia-arquivos");
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  try {
    const transferencias = await listarTransferenciasDoUsuario(usuario.id);
    return NextResponse.json({ ok: true, data: transferencias });
  } catch (error) {
    console.error("Erro ao listar transferências do usuário:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar suas transferências." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("transferencia-arquivos/minhas", handleGET);
