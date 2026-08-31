import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarGradeComSlots, salvarSlotsDaGrade } from "@/lib/tv/grades";
import type { ItemSlotTv } from "@/lib/tv/grades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const horaPattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const TIPOS_CONTEUDO = ["video", "foto", "documento", "pagina_web"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

function validarItem(valor: unknown, indiceSlot: number, indiceItem: number) {
  if (!isObject(valor)) {
    throw new ValidationError(`Item ${indiceItem + 1} do slot ${indiceSlot + 1} é inválido.`);
  }

  const { tipoConteudo, midiaId, urlPaginaWeb, duracaoSegundos, ordem, diasSemana, horaInicio, horaFim } =
    valor;

  if (typeof tipoConteudo !== "string" || !TIPOS_CONTEUDO.includes(tipoConteudo)) {
    throw new ValidationError(
      `Tipo de conteúdo inválido no item ${indiceItem + 1} do slot ${indiceSlot + 1}.`
    );
  }

  if (tipoConteudo === "pagina_web") {
    if (typeof urlPaginaWeb !== "string" || !urlPaginaWeb.trim()) {
      throw new ValidationError(
        `Informe a URL da página web no item ${indiceItem + 1} do slot ${indiceSlot + 1}.`
      );
    }
  } else if (typeof midiaId !== "string" || !uniqueIdentifierPattern.test(midiaId)) {
    throw new ValidationError(
      `Selecione uma mídia válida no item ${indiceItem + 1} do slot ${indiceSlot + 1}.`
    );
  }

  if (typeof duracaoSegundos !== "number" || duracaoSegundos < 1) {
    throw new ValidationError(
      `A duração do item ${indiceItem + 1} do slot ${indiceSlot + 1} deve ser de pelo menos 1 segundo.`
    );
  }

  if (diasSemana !== undefined && (typeof diasSemana !== "string" || !diasSemana.trim())) {
    throw new ValidationError(
      `Dias da semana inválidos no item ${indiceItem + 1} do slot ${indiceSlot + 1}.`
    );
  }

  if (horaInicio !== undefined && (typeof horaInicio !== "string" || !horaPattern.test(horaInicio))) {
    throw new ValidationError(
      `Hora de início inválida no item ${indiceItem + 1} do slot ${indiceSlot + 1}.`
    );
  }

  if (horaFim !== undefined && (typeof horaFim !== "string" || !horaPattern.test(horaFim))) {
    throw new ValidationError(
      `Hora de fim inválida no item ${indiceItem + 1} do slot ${indiceSlot + 1}.`
    );
  }

  return {
    tipoConteudo: tipoConteudo as ItemSlotTv["tipoConteudo"],
    midiaId: tipoConteudo === "pagina_web" ? null : (midiaId as string),
    urlPaginaWeb: tipoConteudo === "pagina_web" ? (urlPaginaWeb as string).trim() : null,
    duracaoSegundos: Math.round(duracaoSegundos),
    ordem: typeof ordem === "number" ? ordem : indiceItem,
    diasSemana: typeof diasSemana === "string" ? diasSemana.trim() : "todos",
    horaInicio: typeof horaInicio === "string" ? horaInicio : "00:00:00",
    horaFim: typeof horaFim === "string" ? horaFim : "23:59:59",
  };
}

function validarSlot(valor: unknown, indiceSlot: number) {
  if (!isObject(valor)) {
    throw new ValidationError(`Slot ${indiceSlot + 1} é inválido.`);
  }

  const { nome, diasSemana, horaInicio, horaFim, ordem, itens } = valor;

  if (typeof horaInicio !== "string" || !horaPattern.test(horaInicio)) {
    throw new ValidationError(`Hora de início inválida no slot ${indiceSlot + 1}.`);
  }

  if (typeof horaFim !== "string" || !horaPattern.test(horaFim)) {
    throw new ValidationError(`Hora de fim inválida no slot ${indiceSlot + 1}.`);
  }

  if (typeof diasSemana !== "string" || !diasSemana.trim()) {
    throw new ValidationError(`Dias da semana inválidos no slot ${indiceSlot + 1}.`);
  }

  if (!Array.isArray(itens)) {
    throw new ValidationError(`A playlist do slot ${indiceSlot + 1} é inválida.`);
  }

  return {
    nome: typeof nome === "string" && nome.trim() ? nome.trim() : null,
    diasSemana: diasSemana.trim(),
    horaInicio,
    horaFim,
    ordem: typeof ordem === "number" ? ordem : indiceSlot,
    itens: itens.map((item, indiceItem) => validarItem(item, indiceSlot, indiceItem)),
  };
}

async function handlePUT(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da grade é inválido." },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  if (!isObject(body) || !Array.isArray(body.slots)) {
    return NextResponse.json(
      { ok: false, message: 'O corpo da requisição deve conter um array "slots".' },
      { status: 400 }
    );
  }

  try {
    const slots = body.slots.map((slot, indice) => validarSlot(slot, indice));

    await salvarSlotsDaGrade(id, slots);

    const grade = await buscarGradeComSlots(id);

    return NextResponse.json({ ok: true, message: "Programação salva.", data: grade });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar slots de grade de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a programação." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("tv-corporativa/grades/[id]/slots", handlePUT);
