import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { criarRedeWifi, listarRedesWifi } from "@/lib/tv/redes-wifi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const redes = await listarRedesWifi();
    return NextResponse.json({ ok: true, data: redes });
  } catch (error) {
    console.error("Erro ao listar redes Wi-Fi da TV Corporativa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as redes Wi-Fi." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/tv/redes-wifi", handleGET);

interface CriarRedeWifiBody {
  ssid?: unknown;
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
    const body: CriarRedeWifiBody = parsedBody;

    const ssid = requiredText(body.ssid, "SSID", 64);
    const senha = requiredText(body.senha, "senha", 300);

    const rede = await criarRedeWifi({
      ssid,
      senha,
      atualizadoPor: acesso.usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: "Rede Wi-Fi adicionada.", data: rede });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar rede Wi-Fi da TV Corporativa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível adicionar a rede Wi-Fi." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/tv/redes-wifi", handlePOST);
