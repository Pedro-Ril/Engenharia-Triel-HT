import { NextResponse } from "next/server";

import { atualizarModelo, excluirModelo } from "@/lib/assinaturas/modelos";
import { parseCamposConfigFormData, parseImagemModeloFormData } from "@/lib/assinaturas/validacao";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { optionalBoolean, optionalInteger, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

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
    const formData = await request.formData();

    const nome = optionalText(formData.get("nome"), "nome", 150) ?? undefined;
    const ativo =
      formData.get("ativo") !== null
        ? optionalBoolean(formData.get("ativo") === "true", "ativo", true)
        : undefined;
    const ordem =
      formData.get("ordem") !== null ? optionalInteger(formData.get("ordem"), "ordem", 0) : undefined;

    const camposConfigBruto = formData.get("camposConfig");
    const camposConfig =
      typeof camposConfigBruto === "string" && camposConfigBruto.trim()
        ? parseCamposConfigFormData(formData, "camposConfig")
        : undefined;

    const imagem = (await parseImagemModeloFormData(formData, "imagem")) ?? undefined;

    const modelo = await atualizarModelo(id, {
      nome,
      imagem,
      camposConfig,
      ativo,
      ordem,
      atualizadoPor: acesso.usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: "Modelo atualizado.", data: modelo });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar modelo de assinatura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o modelo." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/assinaturas/modelos/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    await excluirModelo(id);
    return NextResponse.json({ ok: true, message: "Modelo excluído." });
  } catch (error) {
    console.error("Erro ao excluir modelo de assinatura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o modelo." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/assinaturas/modelos/[id]", handleDELETE);
