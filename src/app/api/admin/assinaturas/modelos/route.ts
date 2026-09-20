import { NextResponse } from "next/server";

import { criarModelo, listarModelosAdmin } from "@/lib/assinaturas/modelos";
import { parseCamposConfigFormData, parseImagemModeloFormData } from "@/lib/assinaturas/validacao";
import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const modelos = await listarModelosAdmin();
    return NextResponse.json({ ok: true, data: modelos });
  } catch (error) {
    console.error("Erro ao listar modelos de assinatura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os modelos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/assinaturas/modelos", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const formData = await request.formData();

    const nome = requiredText(formData.get("nome"), "nome", 150);
    const camposConfig = parseCamposConfigFormData(formData, "camposConfig");

    const imagem = await parseImagemModeloFormData(formData, "imagem");
    if (!imagem) {
      throw new ValidationError("Selecione a imagem de fundo do modelo.");
    }

    const modelo = await criarModelo({
      nome,
      imagem,
      camposConfig,
      criadoPor: acesso.usuario.nomeExibicao,
    });

    return NextResponse.json(
      { ok: true, message: "Modelo criado.", data: modelo },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar modelo de assinatura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o modelo." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/assinaturas/modelos", handlePOST);
