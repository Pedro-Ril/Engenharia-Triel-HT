import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { buscarUsuarioPorId } from "@/lib/auth/usuarios";
import { listarFuncionariosAtivos } from "@/lib/rh-firebird/funcionarios";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Só pra alimentar a tela de admin que configura o escopo de outros
 * usuários -- por isso não passa pelo escopo do próprio usuário-alvo
 * (o admin precisa ver todo mundo pra poder restringir). Busca com o
 * codigo_empresa do usuário-ALVO (?usuarioId=), não o do admin, já que
 * as opções mostradas devem refletir o que aquele usuário buscaria.
 */
async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const usuarioId = new URL(request.url).searchParams.get("usuarioId");
  if (!usuarioId) {
    return NextResponse.json({ ok: false, message: "Informe usuarioId." }, { status: 400 });
  }

  const usuarioAlvo = await buscarUsuarioPorId(usuarioId);
  if (!usuarioAlvo) {
    return NextResponse.json({ ok: false, message: "Usuário não encontrado." }, { status: 404 });
  }

  if (!usuarioAlvo.codigoEmpresa) {
    return NextResponse.json(
      {
        ok: false,
        message: `${usuarioAlvo.nomeExibicao} não tem uma empresa cadastrada — configure isso antes de definir o escopo.`,
      },
      { status: 400 }
    );
  }

  try {
    const funcionarios = await listarFuncionariosAtivos(usuarioAlvo.codigoEmpresa);
    return NextResponse.json({ ok: true, data: funcionarios });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 503 });
    }

    console.error("Erro ao listar funcionários do RH (admin):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os colaboradores." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/aprovacoes/rh/funcionarios", handleGET);
