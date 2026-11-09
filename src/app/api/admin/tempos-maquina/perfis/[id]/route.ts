import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { optionalBoolean, optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { atualizarPerfil, excluirPerfil } from "@/lib/tempos-maquina/cadastro";

import { lerCorpo, respostaDeErro } from "../../respostas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const corpo = await lerCorpo(request);
    const perfil = await atualizarPerfil(
      id,
      {
        nome: corpo.nome === undefined ? undefined : requiredText(corpo.nome, "nome", 150),
        parametros: corpo.parametros,
        observacao: corpo.observacao === undefined ? undefined : optionalText(corpo.observacao, "observação", 1000),
        ativo: corpo.ativo === undefined ? undefined : optionalBoolean(corpo.ativo, "ativo", false),
      },
      acesso.usuario.nomeExibicao
    );
    return NextResponse.json({ ok: true, message: "Perfil salvo.", data: perfil });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível salvar o perfil de tempo");
  }
}

export const PATCH = comMetricasApi("admin/tempos-maquina/perfis/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    await excluirPerfil(id);
    return NextResponse.json({ ok: true, message: "Perfil excluído." });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível excluir o perfil de tempo");
  }
}

export const DELETE = comMetricasApi("admin/tempos-maquina/perfis/[id]", handleDELETE);
