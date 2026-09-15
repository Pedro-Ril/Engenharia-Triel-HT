import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalInteger, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { atualizarCamera, excluirCamera } from "@/lib/semaforo/cameras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface AtualizarCameraBody {
  nome?: unknown;
  host?: unknown;
  portaOnvif?: unknown;
  usuario?: unknown;
  senha?: unknown;
  ativo?: unknown;
  ordem?: unknown;
}

async function handlePUT(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body: AtualizarCameraBody = parsedBody;

    const camera = await atualizarCamera(id, {
      nome: body.nome !== undefined ? optionalText(body.nome, "nome", 100) ?? undefined : undefined,
      host: body.host !== undefined ? optionalText(body.host, "host/IP", 255) ?? undefined : undefined,
      portaOnvif: body.portaOnvif !== undefined ? optionalInteger(body.portaOnvif, "porta ONVIF", 80) : undefined,
      usuario: body.usuario !== undefined ? optionalText(body.usuario, "usuário", 150) ?? undefined : undefined,
      senha: body.senha !== undefined ? optionalText(body.senha, "senha", 300) : undefined,
      ativo: body.ativo !== undefined ? optionalBoolean(body.ativo, "ativo", true) : undefined,
      ordem: body.ordem !== undefined ? optionalInteger(body.ordem, "ordem", 0) : undefined,
      atualizadoPor: acesso.usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: "Câmera atualizada.", data: camera });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar câmera do Semáforo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a câmera." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("admin/semaforo/cameras/[id]", handlePUT);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    await excluirCamera(id);
    return NextResponse.json({ ok: true, message: "Câmera removida." });
  } catch (error) {
    console.error("Erro ao excluir câmera do Semáforo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a câmera." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/semaforo/cameras/[id]", handleDELETE);
