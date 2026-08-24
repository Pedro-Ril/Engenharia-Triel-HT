import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalText, requiredText } from "@/lib/auth/validation";
import { testarConexaoDb } from "@/lib/database/configuracao-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestarConfiguracaoDbBody {
  server?: unknown;
  database?: unknown;
  user?: unknown;
  senha?: unknown;
  encrypt?: unknown;
  trustServerCertificate?: unknown;
}

export async function POST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as TestarConfiguracaoDbBody;

    const server = requiredText(body.server, "servidor", 200);
    const database = requiredText(body.database, "banco de dados", 200);
    const user = requiredText(body.user, "usuário", 150);
    const senhaDigitada = optionalText(body.senha, "senha", 300);
    const encrypt = optionalBoolean(body.encrypt, "encrypt", true);
    const trustServerCertificate = optionalBoolean(
      body.trustServerCertificate,
      "trustServerCertificate",
      true
    );

    const senha = senhaDigitada ?? process.env.DB_PASSWORD ?? null;

    if (!senha) {
      throw new ValidationError("Informe a senha do banco de dados para testar a conexão.");
    }

    const teste = await testarConexaoDb({
      server,
      database,
      user,
      password: senha,
      encrypt,
      trustServerCertificate,
    });

    return NextResponse.json({ ok: true, data: teste });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao testar conexão com o banco de dados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível testar a conexão com o banco de dados." },
      { status: 500 }
    );
  }
}
