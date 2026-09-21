import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, optionalText } from "@/lib/auth/validation";
import { buscarConfigChamados, salvarConfigChamados } from "@/lib/chamados/chamados-config";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await buscarConfigChamados();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar configuração de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/chamados/config", handleGET);

interface ConfigBody {
  urlPublica?: unknown;
  diasAutoResolucao?: unknown;
}

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as ConfigBody;

    const urlPublica = optionalText(body.urlPublica, "URL pública do portal", 300);
    if (urlPublica && !/^https?:\/\//i.test(urlPublica)) {
      throw new ValidationError("A URL pública deve começar com http:// ou https://.");
    }

    /* Vazio/null desliga o recurso (nenhum chamado fecha sozinho) -- ver ChamadosConfig.diasAutoResolucao. */
    let diasAutoResolucao: number | null = null;
    if (body.diasAutoResolucao !== undefined && body.diasAutoResolucao !== null && body.diasAutoResolucao !== "") {
      diasAutoResolucao = optionalInteger(body.diasAutoResolucao, "dias para auto-resolução", 1);
      if (diasAutoResolucao < 1) {
        throw new ValidationError("O prazo para auto-resolução deve ser de pelo menos 1 dia.");
      }
    }

    const config = await salvarConfigChamados({
      urlPublica: urlPublica ? urlPublica.replace(/\/+$/, "") : null,
      diasAutoResolucao,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/chamados/config", handlePATCH);
