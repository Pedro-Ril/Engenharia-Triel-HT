import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalText, requiredText } from "@/lib/auth/validation";
import {
  lerConfiguracaoDbAtual,
  salvarConfiguracaoDbNoEnv,
  testarConexaoDb,
} from "@/lib/database/configuracao-db";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: lerConfiguracaoDbAtual() });
  } catch (error) {
    console.error("Erro ao ler a configuração do banco de dados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível ler a configuração do banco de dados." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/configuracao-db", handleGET);

interface AtualizarConfiguracaoDbBody {
  server?: unknown;
  database?: unknown;
  user?: unknown;
  senha?: unknown;
  encrypt?: unknown;
  trustServerCertificate?: unknown;
}

/*
 * Sempre testa a conexão com os valores candidatos antes de
 * gravar no .env — mesma cautela do PUT de configuracao-ad, pra
 * nunca deixar o .env com credenciais que derrubariam o portal no
 * próximo restart.
 */
async function handlePUT(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as AtualizarConfiguracaoDbBody;

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
      throw new ValidationError("Informe a senha do banco de dados para validar a conexão.");
    }

    const teste = await testarConexaoDb({
      server,
      database,
      user,
      password: senha,
      encrypt,
      trustServerCertificate,
    });

    if (!teste.conectou) {
      throw new ValidationError(
        teste.mensagemErro ?? "Não foi possível conectar com essas credenciais."
      );
    }

    salvarConfiguracaoDbNoEnv({
      server,
      database,
      user,
      password: senhaDigitada,
      encrypt,
      trustServerCertificate,
    });

    return NextResponse.json({
      ok: true,
      message:
        "Configuração salva no .env. As alterações só valem depois de reiniciar o processo.",
      data: lerConfiguracaoDbAtual(),
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar a configuração do banco de dados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração do banco de dados." },
      { status: 500 }
    );
  }
}

export const PUT = comMetricasApi("admin/configuracao-db", handlePUT);
