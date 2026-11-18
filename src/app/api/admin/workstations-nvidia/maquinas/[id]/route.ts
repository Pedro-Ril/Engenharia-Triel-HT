import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarEventoSemFalhar } from "@/lib/workstations-nvidia/eventos";
import { atualizarMaquina, buscarMaquina, excluirMaquina } from "@/lib/workstations-nvidia/maquinas";
import { montarMaquinaParaTela } from "@/lib/workstations-nvidia/resumo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

function idInvalido() {
  return NextResponse.json(
    { ok: false, message: "O identificador da máquina é inválido." },
    { status: 400 }
  );
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!uniqueIdentifierPattern.test(id)) return idInvalido();

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const dados: { ativo?: boolean; descricao?: string | null } = {};

    if (body.ativo !== undefined) {
      if (typeof body.ativo !== "boolean") {
        throw new ValidationError("O campo ativo deve ser verdadeiro ou falso.");
      }
      dados.ativo = body.ativo;
    }
    if (body.descricao !== undefined) {
      dados.descricao = optionalText(body.descricao, "descrição", 200);
    }

    const maquina = await atualizarMaquina(id, dados);
    if (!maquina) {
      return NextResponse.json({ ok: false, message: "Máquina não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: await montarMaquinaParaTela(maquina) });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao atualizar workstation NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a máquina." },
      { status: 500 }
    );
  }
}

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!uniqueIdentifierPattern.test(id)) return idInvalido();

  try {
    const maquina = await buscarMaquina(id);
    if (!maquina) {
      return NextResponse.json({ ok: false, message: "Máquina não encontrada." }, { status: 404 });
    }

    await excluirMaquina(id);

    /* O histórico da própria máquina sai junto (ON DELETE CASCADE); fica só este registro geral. */
    await registrarEventoSemFalhar({
      maquinaId: null,
      computador: maquina.computador,
      tipo: "maquina_removida",
      descricao: `${acesso.usuario.nomeExibicao} removeu ${maquina.computador} do monitoramento.`,
    });

    return NextResponse.json({ ok: true, message: `${maquina.computador} foi removida.` });
  } catch (error) {
    console.error("Erro ao excluir workstation NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível remover a máquina." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/workstations-nvidia/maquinas/[id]", handlePATCH);
export const DELETE = comMetricasApi("admin/workstations-nvidia/maquinas/[id]", handleDELETE);
