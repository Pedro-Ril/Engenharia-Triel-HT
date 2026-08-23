import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import { criarDownload, listarDownloadsAdmin } from "@/lib/downloads/downloads";
import { parseArquivoFormData, parseListaTextoFormData } from "@/lib/downloads/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const downloads = await listarDownloadsAdmin();
    return NextResponse.json({ ok: true, data: downloads });
  } catch (error) {
    console.error("Erro ao listar downloads:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os downloads." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const formData = await request.formData();

    const nome = requiredText(formData.get("nome"), "nome", 200);
    const descricao = requiredText(formData.get("descricao"), "descrição", 1000);
    const tag = optionalText(formData.get("tag"), "tag", 60);
    const ordem = optionalInteger(formData.get("ordem"), "ordem", 0);
    const instrucoes = parseListaTextoFormData(formData, "instrucoes");
    const funcionamento = parseListaTextoFormData(formData, "funcionamento");

    const arquivo = await parseArquivoFormData(formData, "arquivo");
    if (!arquivo) {
      throw new ValidationError("Selecione um arquivo para o download.");
    }

    const download = await criarDownload({
      nome,
      descricao,
      tag,
      instrucoes,
      funcionamento,
      ordem,
      criadoPor: acesso.usuario.samAccountName,
      arquivo,
    });

    return NextResponse.json(
      { ok: true, message: "Download criado.", data: download },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar download:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o download." },
      { status: 500 }
    );
  }
}
