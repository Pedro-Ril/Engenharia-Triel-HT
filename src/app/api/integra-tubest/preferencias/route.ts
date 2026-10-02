import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import {
  buscarPreferenciaModulo,
  salvarPreferenciaModulo,
} from "@/lib/preferencias/preferencias-modulo";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  CHAVE_PREFERENCIA_COLUNAS,
  normalizarColunas,
} from "@/modules/integra-tubest/constants/colunas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("integra-tubest");
  if (acesso.negado) return acesso.negado;

  const salvas = await buscarPreferenciaModulo<string[]>(acesso.usuario.id, CHAVE_PREFERENCIA_COLUNAS);

  return NextResponse.json({ ok: true, data: { colunas: normalizarColunas(salvas) } });
}

export const GET = comMetricasApi("integra-tubest/preferencias", handleGET);

async function handlePUT(request: Request) {
  const acesso = await verificarAcessoModuloApi("integra-tubest");
  if (acesso.negado) return acesso.negado;

  try {
    const body = await request.json();

    /*
     * Normaliza antes de gravar: o que vai para o banco é sempre uma
     * lista válida de chaves conhecidas, com as fixas garantidas.
     */
    const colunas = normalizarColunas(body?.colunas);

    await salvarPreferenciaModulo(acesso.usuario.id, CHAVE_PREFERENCIA_COLUNAS, colunas);

    return NextResponse.json({ ok: true, data: { colunas } });
  } catch (error) {
    console.error("Erro ao salvar preferência de colunas do TuBest:", error);

    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a preferência de colunas." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("integra-tubest/preferencias", handlePUT);
