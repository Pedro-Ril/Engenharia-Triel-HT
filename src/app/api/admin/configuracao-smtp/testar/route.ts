import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { enviarEmailTeste } from "@/lib/smtp/enviar-email";
import { getConfiguracaoSmtp, type CriptografiaSmtp } from "@/lib/smtp/smtp-config";

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

interface TestarConfiguracaoSmtpBody {
  host?: unknown;
  porta?: unknown;
  criptografia?: unknown;
  autenticacaoAtiva?: unknown;
  usuario?: unknown;
  senha?: unknown;
  remetenteNome?: unknown;
  remetenteEmail?: unknown;
}

/*
 * O destino do teste nunca vem do corpo da requisição — é sempre o
 * e-mail já cadastrado do próprio admin logado (pedido explícito do
 * usuário). Igual ao teste do AD, os demais campos do formulário
 * (ainda não salvos) são usados para testar, com a senha caindo pra
 * já salva quando o campo vier em branco.
 */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as TestarConfiguracaoSmtpBody;

    const host = requiredText(body.host, "servidor SMTP", 200);
    const porta = optionalInteger(body.porta, "porta", 587);
    const criptografia = validarCriptografia(body.criptografia ?? "tls");
    const autenticacaoAtiva = optionalBoolean(body.autenticacaoAtiva, "autenticação ativa", true);
    const usuario = optionalText(body.usuario, "usuário", 200);
    const senhaDigitada = optionalText(body.senha, "senha", 300);
    const remetenteNome = optionalText(body.remetenteNome, "nome do remetente", 150);
    const remetenteEmail = requiredText(body.remetenteEmail, "e-mail do remetente", 256);

    const configuracaoAtual = await getConfiguracaoSmtp();
    const senha = senhaDigitada ?? configuracaoAtual?.senha ?? null;

    if (autenticacaoAtiva && !senha) {
      throw new ValidationError("Informe a senha para testar o envio com autenticação.");
    }

    await enviarEmailTeste(
      { host, porta, criptografia, autenticacaoAtiva, usuario, senha, remetenteNome, remetenteEmail },
      acesso.usuario
    );

    return NextResponse.json({
      ok: true,
      message: `E-mail de teste enviado para ${acesso.usuario.email}.`,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao testar envio de e-mail:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível testar o envio do e-mail." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/configuracao-smtp/testar", handlePOST);
