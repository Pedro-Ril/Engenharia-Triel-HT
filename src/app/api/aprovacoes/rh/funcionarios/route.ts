import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { aplicarEscopo, buscarEscopoUsuario } from "@/lib/aprovacoes/escopo-colaboradores";
import { listarFuncionariosAtivos } from "@/lib/rh-firebird/funcionarios";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "aprovacoes-solicitar-aumento";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  if (!usuario.codigoEmpresa) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Seu usuário não tem uma empresa cadastrada no portal — avise o administrador antes de buscar colaboradores.",
      },
      { status: 400 }
    );
  }

  try {
    const [funcionarios, escopo] = await Promise.all([
      listarFuncionariosAtivos(usuario.codigoEmpresa),
      buscarEscopoUsuario(usuario.id),
    ]);

    return NextResponse.json({ ok: true, data: aplicarEscopo(funcionarios, escopo) });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 503 });
    }

    console.error("Erro ao listar funcionários do RH:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os colaboradores." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("aprovacoes/rh/funcionarios", handleGET);
