import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import { atualizarDownload, excluirDownload } from "@/lib/downloads/downloads";
import { parseArquivoFormData, parseListaTextoFormData } from "@/lib/downloads/validacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* FormData só carrega strings — diferente de optionalBoolean (feita pra corpo JSON). */
function parseBooleanFormData(valor: FormDataEntryValue | null, padrao: boolean): boolean {
  if (valor === null) return padrao;
  return valor === "true";
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do download é inválido." },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();

    const nome = requiredText(formData.get("nome"), "nome", 200);
    const descricao = requiredText(formData.get("descricao"), "descrição", 1000);
    const tag = optionalText(formData.get("tag"), "tag", 60);
    const ordem = optionalInteger(formData.get("ordem"), "ordem", 0);
    const ativo = parseBooleanFormData(formData.get("ativo"), true);
    const instrucoes = parseListaTextoFormData(formData, "instrucoes");
    const funcionamento = parseListaTextoFormData(formData, "funcionamento");
    const arquivo = await parseArquivoFormData(formData, "arquivo");

    const download = await atualizarDownload(id, {
      nome,
      descricao,
      tag,
      instrucoes,
      funcionamento,
      ordem,
      ativo,
      arquivo: arquivo ?? undefined,
    });

    if (!download) {
      return NextResponse.json(
        { ok: false, message: "Download não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Download atualizado.", data: download });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar download:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o download." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/downloads/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do download é inválido." },
      { status: 400 }
    );
  }

  try {
    const removido = await excluirDownload(id);

    if (!removido) {
      return NextResponse.json(
        { ok: false, message: "Download não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Download excluído." });
  } catch (error) {
    console.error("Erro ao excluir download:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o download." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/downloads/[id]", handleDELETE);
