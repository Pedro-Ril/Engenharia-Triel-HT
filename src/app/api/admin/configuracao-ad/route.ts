import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import {
  getConfiguracaoAdSemSenha,
  salvarConfiguracaoAd,
} from "@/lib/auth/configuracao-ad";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const configuracao = await getConfiguracaoAdSemSenha();
    return NextResponse.json({ ok: true, data: configuracao });
  } catch (error) {
    console.error("Erro ao buscar a configuração do AD:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração do AD." },
      { status: 500 }
    );
  }
}

interface UpdateConfiguracaoAdBody {
  url?: unknown;
  baseDn?: unknown;
  usuarioServico?: unknown;
  senhaServico?: unknown;
  grupoAdminDn?: unknown;
}

export async function PUT(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: UpdateConfiguracaoAdBody;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    body = parsedBody;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  try {
    const url = requiredText(body.url, "URL do AD", 200);
    const baseDn = requiredText(body.baseDn, "base DN", 300);
    const usuarioServico = requiredText(
      body.usuarioServico,
      "usuário de serviço",
      150
    );
    const senhaServico = optionalText(body.senhaServico, "senha de serviço", 300);
    const grupoAdminDn = requiredText(
      body.grupoAdminDn,
      "grupo de administradores",
      300
    );

    const configuracao = await salvarConfiguracaoAd({
      url,
      baseDn,
      usuarioServico,
      senhaServico,
      grupoAdminDn,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({
      ok: true,
      message: "Configuração do AD atualizada.",
      data: configuracao,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar a configuração do AD:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a configuração do AD." },
      { status: 500 }
    );
  }
}
