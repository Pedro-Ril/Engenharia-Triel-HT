import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredText } from "@/lib/auth/validation";
import { verificarAcessoChamado } from "@/lib/chamados/autorizacao-chamados";
import { adicionarMensagem, buscarChamadoPorNumero } from "@/lib/chamados/chamados";
import { parseAnexosFormData } from "@/lib/chamados/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ numero: string }>;
}

function parseNumero(valor: string): number | null {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

export async function POST(request: Request, context: RouteContext) {
  const { numero: numeroParam } = await context.params;
  const numero = parseNumero(numeroParam);

  if (!numero) {
    return NextResponse.json(
      { ok: false, message: "Número de chamado inválido." },
      { status: 400 }
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição deve ser multipart/form-data." },
      { status: 400 }
    );
  }

  try {
    const usuario = await getUsuarioAutenticado();
    const nomeConfirmado = formData.get("nome");

    const chamado = await buscarChamadoPorNumero(numero);

    if (!chamado) {
      return NextResponse.json(
        { ok: false, message: "Chamado não encontrado." },
        { status: 404 }
      );
    }

    const { podeVer, ehAtendente } = await verificarAcessoChamado(
      chamado,
      usuario,
      typeof nomeConfirmado === "string" ? nomeConfirmado : null
    );

    if (!podeVer) {
      return NextResponse.json(
        { ok: false, message: "Você não tem acesso a este chamado." },
        { status: 403 }
      );
    }

    if (ehAtendente && !chamado.atendenteUsuarioId) {
      return NextResponse.json(
        { ok: false, message: "Aceite o chamado antes de responder." },
        { status: 409 }
      );
    }

    const texto = requiredText(formData.get("texto"), "mensagem", 4000);
    const interno = ehAtendente && formData.get("interno") === "true";
    const anexos = await parseAnexosFormData(formData, "anexos");

    const autorNome = usuario?.nomeExibicao ?? chamado.solicitanteNome;

    const mensagem = await adicionarMensagem({
      chamadoId: chamado.id,
      autorUsuarioId: usuario?.id ?? null,
      autorNome,
      autorTipo: ehAtendente ? "atendente" : "solicitante",
      interno,
      texto,
      anexos,
    });

    return NextResponse.json(
      { ok: true, message: "Mensagem enviada.", data: mensagem },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao adicionar mensagem ao chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível enviar a mensagem." },
      { status: 500 }
    );
  }
}
