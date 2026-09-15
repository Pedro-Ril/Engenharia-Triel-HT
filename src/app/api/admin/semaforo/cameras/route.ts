import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { criarCamera, listarCameras } from "@/lib/semaforo/cameras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const cameras = await listarCameras();
    return NextResponse.json({ ok: true, data: cameras });
  } catch (error) {
    console.error("Erro ao listar câmeras do Semáforo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as câmeras." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/semaforo/cameras", handleGET);

interface CriarCameraBody {
  nome?: unknown;
  host?: unknown;
  portaOnvif?: unknown;
  usuario?: unknown;
  senha?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body: CriarCameraBody = parsedBody;

    const nome = requiredText(body.nome, "nome", 100);
    const host = requiredText(body.host, "host/IP", 255);
    const portaOnvif = optionalInteger(body.portaOnvif, "porta ONVIF", 80);
    const usuario = requiredText(body.usuario, "usuário", 150);
    const senha = requiredText(body.senha, "senha", 300);

    const camera = await criarCamera({
      nome,
      host,
      portaOnvif,
      usuario,
      senha,
      atualizadoPor: acesso.usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: "Câmera adicionada.", data: camera });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar câmera do Semáforo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível adicionar a câmera." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/semaforo/cameras", handlePOST);
