import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarEmpresas } from "@/lib/empresas/empresas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

/*
 * Lista só o necessário pro seletor de empresa (id/nome/codigo) — mesmo
 * recorte de src/app/api/estrutura-substituicao/empresas/route.ts.
 */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  try {
    const empresas = await listarEmpresas();
    return NextResponse.json({
      ok: true,
      data: empresas
        .filter((empresa) => empresa.ativa)
        .map((empresa) => ({ id: empresa.id, nome: empresa.nome, codigo: empresa.codigo })),
    });
  } catch (error) {
    console.error("Erro ao listar empresas (estoque de equipamentos usados):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as empresas." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/empresas", handleGET);
