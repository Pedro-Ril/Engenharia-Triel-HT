import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarVersoes } from "@/lib/plugins-3dx/plugins-3dx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPONENTE = /^[a-z0-9-]{1,40}$/;

/* ?componente=core|<chave do plugin>; sem o parâmetro = todas as notas. */
async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const componente = new URL(request.url).searchParams.get("componente");
  try {
    const versoes = await listarVersoes(componente && COMPONENTE.test(componente) ? componente : null);
    return NextResponse.json({ ok: true, data: versoes });
  } catch (error) {
    console.error("Erro ao listar as notas de versão dos Plugins 3DX:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as notas de versão (a migração 0174 foi aplicada?)." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/plugins-3dx/versoes", handleGET);
