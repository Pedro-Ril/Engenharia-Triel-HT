import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarEventoSemFalhar } from "@/lib/workstations-nvidia/eventos";
import { adicionarMaquinas, normalizarNomesComputadores } from "@/lib/workstations-nvidia/maquinas";
import { montarResumoMaquinas } from "@/lib/workstations-nvidia/resumo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const resumo = await montarResumoMaquinas();
    return NextResponse.json({ ok: true, data: resumo });
  } catch (error) {
    console.error("Erro ao listar as workstations NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as workstations." },
      { status: 500 }
    );
  }
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const texto = requiredText(body.computadores, "computadores", 20000);
    const computadores = normalizarNomesComputadores(texto);
    const resultado = await adicionarMaquinas(computadores, acesso.usuario.samAccountName);

    if (resultado.adicionadas.length > 0) {
      await registrarEventoSemFalhar({
        maquinaId: null,
        computador: null,
        tipo: "maquina_adicionada",
        descricao: `${acesso.usuario.nomeExibicao} adicionou ${resultado.adicionadas.length} máquina(s): ${resultado.adicionadas.join(", ")}.`,
      });
    }

    const partes = [`${resultado.adicionadas.length} máquina(s) adicionada(s).`];
    if (resultado.jaExistiam.length > 0) {
      partes.push(`Já estavam cadastradas: ${resultado.jaExistiam.join(", ")}.`);
    }

    return NextResponse.json({ ok: true, message: partes.join(" "), data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao adicionar workstations NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível adicionar as máquinas." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/workstations-nvidia/maquinas", handleGET);
export const POST = comMetricasApi("admin/workstations-nvidia/maquinas", handlePOST);
