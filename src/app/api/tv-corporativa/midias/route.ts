import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarMidias, salvarMidia } from "@/lib/tv/midias";
import type { MidiaTv } from "@/lib/tv/midias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  try {
    const midias = await listarMidias();
    return NextResponse.json({ ok: true, data: midias });
  } catch (error) {
    console.error("Erro ao listar mídias de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as mídias." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv-corporativa/midias", handleGET);

const TIPOS_VALIDOS: MidiaTv["tipo"][] = ["video", "foto", "documento"];

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  try {
    const formData = await request.formData();
    const arquivo = formData.get("arquivo");
    const tipo = formData.get("tipo");
    const pastaId = formData.get("pastaId");

    if (!(arquivo instanceof File)) {
      throw new ValidationError("Envie um arquivo no campo \"arquivo\".");
    }

    if (typeof tipo !== "string" || !TIPOS_VALIDOS.includes(tipo as MidiaTv["tipo"])) {
      throw new ValidationError('O campo "tipo" deve ser video, foto ou documento.');
    }

    const midia = await salvarMidia({
      arquivo,
      tipo: tipo as MidiaTv["tipo"],
      enviadoPor: acesso.usuario.samAccountName,
      pastaId: typeof pastaId === "string" && pastaId ? pastaId : null,
    });

    return NextResponse.json(
      { ok: true, message: "Mídia enviada.", data: midia },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao enviar mídia de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível enviar a mídia." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("tv-corporativa/midias", handlePOST);
