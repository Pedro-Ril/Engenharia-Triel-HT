import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { excluirMaterial, salvarMaterial } from "@/lib/tempos-maquina/cadastro";

import { lerCorpo, respostaDeErro } from "../../respostas";
import { validarMaterial } from "../validar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const material = await salvarMaterial(id, validarMaterial(await lerCorpo(request)));
    return NextResponse.json({ ok: true, message: "Material salvo.", data: material });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível salvar o material");
  }
}

export const PATCH = comMetricasApi("admin/tempos-maquina/materiais/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    await excluirMaterial(id);
    return NextResponse.json({ ok: true, message: "Material excluído." });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível excluir o material");
  }
}

export const DELETE = comMetricasApi("admin/tempos-maquina/materiais/[id]", handleDELETE);
