import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import { testarConexaoFirebird } from "@/lib/database/configuracao-firebird";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestarConfiguracaoFirebirdBody {
  host?: unknown;
  port?: unknown;
  database?: unknown;
  user?: unknown;
  senha?: unknown;
  charset?: unknown;
  role?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as TestarConfiguracaoFirebirdBody;

    const host = requiredText(body.host, "host", 200);
    const port = optionalInteger(body.port, "porta", 3050);
    const database = requiredText(body.database, "banco de dados", 300);
    const user = requiredText(body.user, "usuário", 150);
    const senhaDigitada = optionalText(body.senha, "senha", 300);
    const charset = optionalText(body.charset, "charset", 20) ?? "UTF8";
    const role = optionalText(body.role, "role", 60);

    const senha = senhaDigitada ?? process.env.FB_PASSWORD ?? null;

    if (!senha) {
      throw new ValidationError("Informe a senha do Firebird para testar a conexão.");
    }

    const teste = await testarConexaoFirebird({ host, port, database, user, password: senha, charset, role });

    return NextResponse.json({ ok: true, data: teste });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao testar conexão com o Firebird:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível testar a conexão com o Firebird." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/configuracao-firebird/testar", handlePOST);
