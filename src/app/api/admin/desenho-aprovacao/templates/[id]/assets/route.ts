import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredText } from "@/lib/auth/validation";
import { salvarAssetSvg } from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAMANHO_MAXIMO_SVG_BYTES = 2 * 1024 * 1024;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "O identificador do template é inválido." }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const arquivo = formData.get("arquivo");
    const versaoId = requiredText(formData.get("versaoId"), "versaoId", 36);

    if (!uniqueIdentifierPattern.test(versaoId)) {
      throw new ValidationError("O identificador da versão é inválido.");
    }

    if (!(arquivo instanceof File)) {
      throw new ValidationError('Envie um arquivo SVG no campo "arquivo".');
    }

    if (arquivo.size === 0) {
      throw new ValidationError("O arquivo está vazio.");
    }

    if (arquivo.size > TAMANHO_MAXIMO_SVG_BYTES) {
      throw new ValidationError(
        `O arquivo excede o tamanho máximo permitido (${Math.round(TAMANHO_MAXIMO_SVG_BYTES / 1024 / 1024)}MB).`
      );
    }

    const conteudoSvg = await arquivo.text();

    const asset = await salvarAssetSvg(
      { templateId: id, versaoId, nome: arquivo.name, conteudoSvg },
      acesso.usuario.samAccountName
    );

    return NextResponse.json({ ok: true, message: "Arte SVG enviada.", data: asset }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao enviar asset SVG de template:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível enviar o arquivo." }, { status: 500 });
  }
}

export const POST = comMetricasApi("admin/desenho-aprovacao/templates/[id]/assets", handlePOST);
