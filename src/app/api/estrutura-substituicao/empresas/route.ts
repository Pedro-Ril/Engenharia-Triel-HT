import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarEmpresas } from "@/lib/empresas/empresas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Lista só o necessário pro seletor de empresa (id/nome/codigo) — não
 * expõe cnpj nem cores de tema pro cliente, essas informações só são
 * usadas server-side nas outras rotas deste módulo.
 */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi("substituicao-estrutura");
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
    console.error("Erro ao listar empresas (substituição de estrutura):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as empresas." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estrutura-substituicao/empresas", handleGET);
