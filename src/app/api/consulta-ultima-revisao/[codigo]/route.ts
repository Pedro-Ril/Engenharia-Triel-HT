import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { buscarEstruturaUltimaRevisao } from "@/lib/consulta-ultima-revisao/estrutura-3dx";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "consulta-ultima-revisao";

interface RouteContext {
  params: Promise<{ codigo: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  /* A estrutura é consultada na empresa de quem está pesquisando -- sem empresa no cadastro não dá pra montar a consulta. */
  if (!usuario.codigoEmpresa) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Seu usuário não tem uma empresa cadastrada no portal — avise o administrador antes de consultar a estrutura.",
      },
      { status: 400 }
    );
  }

  const { codigo } = await context.params;

  try {
    const estrutura = await buscarEstruturaUltimaRevisao(codigo, usuario.codigoEmpresa);

    if (!estrutura) {
      return NextResponse.json(
        { ok: false, message: `Nenhuma estrutura encontrada para o código ${codigo}.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: estrutura });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao consultar estrutura no 3DX:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível consultar a estrutura no 3DX." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("consulta-ultima-revisao/[codigo]", handleGET);
