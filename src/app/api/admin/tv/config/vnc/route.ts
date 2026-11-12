import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { salvarSenhaVncTv, validarSenhaVnc } from "@/lib/tv/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Senha do acesso remoto (VNC) aos terminais Linux da TV Corporativa
 * -- PUT define/troca, DELETE desliga. A senha nunca volta na resposta
 * (só `vncSenhaDefinida`). Os agentes aplicam no próximo ciclo de
 * configuração (até 5 min, ver tv-agente/agente.mjs).
 */
async function handlePUT(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError("O corpo da requisição contém um JSON inválido.");
    }
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    const senha = validarSenhaVnc(body.senha);
    const config = await salvarSenhaVncTv(senha, acesso.usuario.samAccountName);

    return NextResponse.json({ ok: true, message: "Senha do acesso remoto salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar a senha do VNC da TV Corporativa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a senha do acesso remoto." },
      { status: 500 }
    );
  }
}

async function handleDELETE() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await salvarSenhaVncTv(null, acesso.usuario.samAccountName);
    return NextResponse.json({ ok: true, message: "Acesso remoto desligado.", data: config });
  } catch (error) {
    console.error("Erro ao desligar o VNC da TV Corporativa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível desligar o acesso remoto." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("admin/tv/config/vnc", handlePUT);
export const DELETE = comMetricasApi("admin/tv/config/vnc", handleDELETE);
