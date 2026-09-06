import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  salvarImagem,
  TAMANHO_MAXIMO_IMAGEM_BYTES,
  TIPOS_MIME_IMAGEM_ACEITOS,
} from "@/lib/wiki/wiki-imagens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const formData = await request.formData();
    const arquivo = formData.get("imagem");

    if (!(arquivo instanceof File) || arquivo.size === 0) {
      throw new ValidationError("Envie um arquivo de imagem.");
    }

    if (!TIPOS_MIME_IMAGEM_ACEITOS.includes(arquivo.type)) {
      throw new ValidationError("Formato de imagem não suportado (use PNG, JPEG, GIF ou WEBP).");
    }

    if (arquivo.size > TAMANHO_MAXIMO_IMAGEM_BYTES) {
      throw new ValidationError(
        `A imagem excede o limite de ${TAMANHO_MAXIMO_IMAGEM_BYTES / (1024 * 1024)} MB.`
      );
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());

    const id = await salvarImagem({
      tipoMime: arquivo.type,
      tamanhoBytes: arquivo.size,
      conteudo: buffer,
      criadoPorUsuarioId: acesso.usuario.id,
    });

    return NextResponse.json({
      ok: true,
      data: { id, url: `/api/wiki/imagens/${id}` },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao enviar imagem do wiki:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível enviar a imagem." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/wiki/imagens", handlePOST);
