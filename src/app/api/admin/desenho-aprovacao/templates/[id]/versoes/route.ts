import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { criarNovaVersao, listarVersoesDoTemplate } from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TEMPLATE_JSON_VAZIO = {
  schemaVersion: 1,
  pagina: {
    formato: "A3",
    orientacao: "horizontal",
    larguraMm: 420,
    alturaMm: 297,
    unidade: "mm",
    margemSeguraMm: 10,
    corFundo: "#ffffff",
  },
  elementos: [],
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CreateVersaoBody {
  templateJson?: unknown;
}

async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "O identificador do template é inválido." }, { status: 400 });
  }

  try {
    const versoes = await listarVersoesDoTemplate(id);
    return NextResponse.json({ ok: true, data: versoes });
  } catch (error) {
    console.error("Erro ao listar versões do template:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível listar as versões." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/desenho-aprovacao/templates/[id]/versoes", handleGET);

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "O identificador do template é inválido." }, { status: 400 });
  }

  let body: CreateVersaoBody = {};

  try {
    const parsedBody: unknown = await request.json();

    if (isObject(parsedBody)) {
      body = parsedBody;
    }
  } catch {
    /*
     * Corpo é opcional — sem template_json informado, começa de uma
     * prancha em branco (TEMPLATE_JSON_VAZIO).
     */
  }

  try {
    const versao = await criarNovaVersao(
      id,
      body.templateJson ?? TEMPLATE_JSON_VAZIO,
      acesso.usuario.samAccountName
    );

    return NextResponse.json({ ok: true, message: "Nova versão criada.", data: versao }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar versão de template:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível criar a versão." }, { status: 500 });
  }
}

export const POST = comMetricasApi("admin/desenho-aprovacao/templates/[id]/versoes", handlePOST);
