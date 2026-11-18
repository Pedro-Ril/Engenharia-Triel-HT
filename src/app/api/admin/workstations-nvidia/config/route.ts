import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarConfiguracaoNvidia, salvarConfiguracaoNvidia } from "@/lib/workstations-nvidia/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await buscarConfiguracaoNvidia() });
  } catch (error) {
    console.error("Erro ao buscar a configuração de Workstations NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a configuração." },
      { status: 500 }
    );
  }
}

async function handlePUT(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const config = await salvarConfiguracaoNvidia({
      caminhoEstado: requiredText(body.caminhoEstado, "caminho do estado.json", 400),
      pastaPerfil: optionalText(body.pastaPerfil, "pasta central do perfil", 400),
      coletaAtiva: optionalBoolean(body.coletaAtiva, "coleta automática", true),
      intervaloMinutos: optionalInteger(body.intervaloMinutos, "intervalo da coleta", 30),
      horasSemContato: optionalInteger(body.horasSemContato, "horas sem contato", 24),
      emailsAlerta: optionalText(body.emailsAlerta, "e-mails para alertas", 1000),
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao salvar a configuração de Workstations NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/workstations-nvidia/config", handleGET);
export const PUT = comMetricasApi("admin/workstations-nvidia/config", handlePUT);
