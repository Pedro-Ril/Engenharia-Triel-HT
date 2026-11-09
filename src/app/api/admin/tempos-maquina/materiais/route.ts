import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarMateriais, salvarMaterial } from "@/lib/tempos-maquina/cadastro";

import { lerCorpo, respostaDeErro } from "../respostas";
import { validarMaterial } from "./validar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarMateriais() });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível listar os materiais");
  }
}

export const GET = comMetricasApi("admin/tempos-maquina/materiais", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const material = await salvarMaterial(null, validarMaterial(await lerCorpo(request)));
    return NextResponse.json({ ok: true, message: "Material criado.", data: material }, { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível criar o material");
  }
}

export const POST = comMetricasApi("admin/tempos-maquina/materiais", handlePOST);
