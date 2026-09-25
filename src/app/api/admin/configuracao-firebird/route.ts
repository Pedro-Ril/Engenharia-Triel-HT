import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import {
  lerConfiguracaoFirebirdAtual,
  salvarConfiguracaoFirebirdNoEnv,
} from "@/lib/database/configuracao-firebird";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: lerConfiguracaoFirebirdAtual() });
  } catch (error) {
    console.error("Erro ao ler a configuração do Firebird:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível ler a configuração do Firebird." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/configuracao-firebird", handleGET);

interface AtualizarConfiguracaoFirebirdBody {
  host?: unknown;
  port?: unknown;
  database?: unknown;
  user?: unknown;
  senha?: unknown;
  charset?: unknown;
  role?: unknown;
  poolMin?: unknown;
  poolMax?: unknown;
}

/*
 * Diferente do PUT de configuracao-db, salva direto sem exigir que um
 * teste de conexão passe antes -- o Firebird não é dependência de boot
 * do portal (só o módulo de Aprovações usa), então travar o salvamento
 * enquanto a conexão estiver fora do ar (como está agora) impediria
 * justamente o ajuste fino que essa tela existe pra permitir. Mesmo
 * espírito de configuracao-smtp.
 */
async function handlePUT(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as AtualizarConfiguracaoFirebirdBody;

    const host = requiredText(body.host, "host", 200);
    const port = optionalInteger(body.port, "porta", 3050);
    const database = requiredText(body.database, "banco de dados", 300);
    const user = requiredText(body.user, "usuário", 150);
    const senha = optionalText(body.senha, "senha", 300);
    const charset = optionalText(body.charset, "charset", 20) ?? "UTF8";
    const role = optionalText(body.role, "role", 60) ?? "";
    const poolMin = optionalInteger(body.poolMin, "pool mínimo", 0);
    const poolMax = optionalInteger(body.poolMax, "pool máximo", 10);

    if (!senha && !process.env.FB_PASSWORD) {
      throw new ValidationError("Informe a senha do Firebird.");
    }

    await salvarConfiguracaoFirebirdNoEnv({
      host,
      port,
      database,
      user,
      password: senha,
      charset,
      role,
      poolMin,
      poolMax,
    });

    return NextResponse.json({
      ok: true,
      message: "Configuração salva. A próxima consulta já usa os novos valores.",
      data: lerConfiguracaoFirebirdAtual(),
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar a configuração do Firebird:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração do Firebird." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("admin/configuracao-firebird", handlePUT);
