import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_URL = "http://proserver.trielht.com.br:4005/prodconnect/api";

export async function GET() {
  const acesso = await verificarAcessoModuloApi("semaforo");
  if (acesso.negado) return acesso.negado;

  try {
    const response = await fetch(`${BASE_URL}/semaforo/status`, {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: "Falha ao comunicar com o backend." },
      { status: 500 }
    );
  }
}
