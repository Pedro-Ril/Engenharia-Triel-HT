import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredUuidArray } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { definirVisualizacaoDoAparelho } from "@/lib/terminal-fabrica/visualizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ terminalId: string }>;
};

/* Troca o app do 3D de um aparelho. Vale na próxima vez que ele buscar a grade. */
async function handlePUT(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { terminalId } = await context.params;
    const [id] = requiredUuidArray([terminalId], "aparelho");
    const body: unknown = await request.json();
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    await definirVisualizacaoDoAparelho(id, body.visualizacao, acesso.usuario);
    return NextResponse.json({ ok: true, message: "Visualização salva." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao salvar a visualização do aparelho:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível salvar a visualização." }, { status: 500 });
  }
}

export const PUT = comMetricasApi("admin/terminal-fabrica/visualizacao/[terminalId]", handlePUT);
