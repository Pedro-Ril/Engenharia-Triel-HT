import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { getConfiguracaoAd } from "@/lib/auth/configuracao-ad";
import { ValidationError } from "@/lib/auth/errors";
import { testarConexaoAd } from "@/lib/auth/ldap";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestarConfiguracaoAdBody {
  url?: unknown;
  usuarioServico?: unknown;
  senhaServico?: unknown;
  grupoAdminDn?: unknown;
  grupoUsuariosDn?: unknown;
}

/*
 * Igual à checagem já feita dentro do PUT de
 * /api/admin/configuracao-ad (salvar sempre testa antes de
 * gravar) — só que separada, pra dar feedback de "conectou" sem
 * precisar salvar nada. Útil pra validar credenciais novas antes
 * de confirmar a troca.
 */
export async function POST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as TestarConfiguracaoAdBody;

    const url = requiredText(body.url, "URL do AD", 200);
    const usuarioServico = requiredText(body.usuarioServico, "usuário de serviço", 150);
    const senhaServicoDigitada = optionalText(body.senhaServico, "senha de serviço", 300);
    const grupoAdminDn = requiredText(body.grupoAdminDn, "grupo de administradores", 300);
    const grupoUsuariosDn = optionalText(body.grupoUsuariosDn, "grupo de usuários", 300);

    const configuracaoAtual = await getConfiguracaoAd();
    const senhaServico = senhaServicoDigitada ?? configuracaoAtual?.senhaServico ?? null;

    if (!senhaServico) {
      throw new ValidationError(
        "Informe a senha da conta de serviço para testar a conexão."
      );
    }

    const teste = await testarConexaoAd({
      url,
      usuarioServico,
      senhaServico,
      grupoAdminDn,
      grupoUsuariosDn,
    });

    return NextResponse.json({ ok: true, data: teste });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao testar conexão com o AD:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível testar a conexão com o AD." },
      { status: 500 }
    );
  }
}
