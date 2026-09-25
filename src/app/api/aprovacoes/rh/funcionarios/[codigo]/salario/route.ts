import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { buscarEscopoUsuario, funcionarioDentroDoEscopo } from "@/lib/aprovacoes/escopo-colaboradores";
import { buscarDetalheAtualFuncionario } from "@/lib/rh-firebird/funcionarios";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "aprovacoes-solicitar-aumento";

interface RouteContext {
  params: Promise<{ codigo: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { codigo } = await context.params;

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
    const detalhe = await buscarDetalheAtualFuncionario(codigo, usuario.codigoEmpresa);

    if (detalhe.salarioAtual === null) {
      return NextResponse.json(
        { ok: false, message: "Não foi possível encontrar o salário atual deste colaborador." },
        { status: 404 }
      );
    }

    /* Segunda camada de defesa: mesmo que o código não apareça mais na busca (já filtrada pelo escopo), bloqueia aqui também caso alguém tente pelo código direto. */
    const escopo = await buscarEscopoUsuario(usuario.id);
    if (!funcionarioDentroDoEscopo({ codigo, departamento: detalhe.departamento, setor: detalhe.setor }, escopo)) {
      return NextResponse.json(
        { ok: false, message: "Você não tem permissão para consultar este colaborador." },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true, data: { salarioAtual: detalhe.salarioAtual, cpf: detalhe.cpf } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 503 });
    }

    console.error("Erro ao buscar salário do funcionário no RH:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível consultar o salário." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("aprovacoes/rh/funcionarios/[codigo]/salario", handleGET);
