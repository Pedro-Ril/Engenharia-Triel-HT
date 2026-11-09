import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { definirPerfilDaMaquina, listarMaquinas } from "@/lib/tempos-maquina/cadastro";

import { lerCorpo, respostaDeErro } from "../respostas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarMaquinas() });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível listar as máquinas");
  }
}

export const GET = comMetricasApi("admin/tempos-maquina/maquinas", handleGET);

/* { codRecurso, descRecurso, perfilId } -- perfilId null desliga a máquina do perfil. */
async function handlePUT(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const corpo = await lerCorpo(request);
    const perfilId = corpo.perfilId === null ? null : optionalText(corpo.perfilId, "perfil", 36);
    if (corpo.perfilId !== null && !perfilId) throw new ValidationError("Informe o perfil (ou nenhum, para desligar).");

    await definirPerfilDaMaquina(
      requiredText(corpo.codRecurso, "máquina", 30).toUpperCase(),
      optionalText(corpo.descRecurso, "descrição da máquina", 150),
      perfilId,
      acesso.usuario.nomeExibicao
    );
    return NextResponse.json({
      ok: true,
      message: perfilId ? "Máquina ligada ao perfil." : "Máquina desligada do perfil.",
      data: await listarMaquinas(),
    });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível salvar a máquina");
  }
}

export const PUT = comMetricasApi("admin/tempos-maquina/maquinas", handlePUT);
