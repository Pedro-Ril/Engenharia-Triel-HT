import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { coletarMaquinas } from "@/lib/workstations-nvidia/coleta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* "Coletar agora": todas as máquinas ativas, ou só uma ({ maquinaId }). */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const maquinaId = isObject(body) ? optionalText(body.maquinaId, "maquinaId", 36) : null;

    if (maquinaId && !uniqueIdentifierPattern.test(maquinaId)) {
      throw new ValidationError("O identificador da máquina é inválido.");
    }

    const resultado = await coletarMaquinas({ maquinaId: maquinaId ?? undefined });

    const message =
      resultado.maquinasColetadas === 0
        ? "Nenhuma máquina ativa para coletar."
        : `${resultado.comSucesso} de ${resultado.maquinasColetadas} máquina(s) lida(s) com sucesso` +
          (resultado.semContato > 0 ? `, ${resultado.semContato} sem contato` : "") +
          (resultado.eventosGerados > 0 ? `, ${resultado.eventosGerados} evento(s) novo(s) no histórico` : "") +
          ".";

    return NextResponse.json({ ok: true, message, data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao coletar workstations NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível fazer a coleta." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/workstations-nvidia/coletar", handlePOST);
