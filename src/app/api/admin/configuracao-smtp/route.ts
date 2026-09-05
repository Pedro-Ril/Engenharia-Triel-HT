import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  isObject,
  optionalBoolean,
  optionalInteger,
  optionalText,
  requiredText,
} from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  getConfiguracaoSmtpSemSenha,
  salvarConfiguracaoSmtp,
  type CriptografiaSmtp,
} from "@/lib/smtp/smtp-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const criptografiasValidas: CriptografiaSmtp[] = ["nenhuma", "ssl", "tls"];

function validarCriptografia(valor: unknown): CriptografiaSmtp {
  const texto = requiredText(valor, "criptografia", 10).toLowerCase();
  if (!criptografiasValidas.includes(texto as CriptografiaSmtp)) {
    throw new ValidationError("A criptografia deve ser 'nenhuma', 'ssl' ou 'tls'.");
  }
  return texto as CriptografiaSmtp;
}

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await getConfiguracaoSmtpSemSenha();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar configuração de SMTP:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/configuracao-smtp", handleGET);

interface ConfigSmtpBody {
  host?: unknown;
  porta?: unknown;
  criptografia?: unknown;
  autenticacaoAtiva?: unknown;
  usuario?: unknown;
  senha?: unknown;
  remetenteNome?: unknown;
  remetenteEmail?: unknown;
}

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: ConfigSmtpBody;

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
    const host = requiredText(body.host, "servidor SMTP", 200);
    const porta = optionalInteger(body.porta, "porta", 587);
    const criptografia = validarCriptografia(body.criptografia ?? "tls");
    const autenticacaoAtiva = optionalBoolean(body.autenticacaoAtiva, "autenticação ativa", true);
    const usuario = optionalText(body.usuario, "usuário", 200);
    const senha = optionalText(body.senha, "senha", 300);
    const remetenteNome = optionalText(body.remetenteNome, "nome do remetente", 150);
    const remetenteEmail = requiredText(body.remetenteEmail, "e-mail do remetente", 256);

    const config = await salvarConfiguracaoSmtp({
      host,
      porta,
      criptografia,
      autenticacaoAtiva,
      usuario,
      senha,
      remetenteNome,
      remetenteEmail,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração de SMTP:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/configuracao-smtp", handlePATCH);
