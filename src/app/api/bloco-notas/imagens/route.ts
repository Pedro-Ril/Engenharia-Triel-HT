import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { salvarImagemNota, TAMANHO_MAXIMO_IMAGEM_NOTA, TIPOS_IMAGEM_NOTA } from "@/lib/bloco-notas/imagens";
import { MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Print colado/arrastado no editor: grava e devolve a URL para inserir no conteúdo. */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  try {
    const formData = await request.formData();
    const arquivo = formData.get("imagem");

    if (!(arquivo instanceof File) || arquivo.size === 0) {
      throw new ValidationError("Envie um arquivo de imagem.");
    }
    if (!TIPOS_IMAGEM_NOTA.includes(arquivo.type)) {
      throw new ValidationError("Formato de imagem não suportado (use PNG, JPEG, GIF ou WEBP).");
    }
    if (arquivo.size > TAMANHO_MAXIMO_IMAGEM_NOTA) {
      throw new ValidationError(`A imagem passa do limite de ${TAMANHO_MAXIMO_IMAGEM_NOTA / (1024 * 1024)} MB.`);
    }

    const id = await salvarImagemNota({
      usuarioId: acesso.usuario.id,
      tipoMime: arquivo.type,
      tamanhoBytes: arquivo.size,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });

    return NextResponse.json({ ok: true, data: { id, url: `/api/bloco-notas/imagens/${id}` } }, { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "enviar imagem");
  }
}

export const POST = comMetricasApi("bloco-notas/imagens", handlePOST);
