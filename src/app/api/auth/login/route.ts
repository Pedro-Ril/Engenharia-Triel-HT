import { NextResponse } from "next/server";

import { getConfiguracaoAdSemSenha } from "@/lib/auth/configuracao-ad";
import { AuthenticationError, ValidationError } from "@/lib/auth/errors";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { authenticateWithActiveDirectory } from "@/lib/auth/ldap";
import {
  extrairIpOrigem,
  registrarTentativaLogin,
} from "@/lib/auth/login-historico";
import { registrarChamadaExternaSemFalhar } from "@/lib/monitoramento/chamadas-externas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  registrarTentativaFalha,
  limparTentativas,
  verificarLimiteLogin,
} from "@/lib/auth/rate-limit";
import { upsertUsuarioLogin } from "@/lib/auth/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoginRequestBody {
  usuario?: unknown;
  senha?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`Informe o campo ${fieldName}.`);
  }

  return value.trim();
}

async function handlePOST(request: Request) {
  let requestBody: LoginRequestBody;

  try {
    const parsedBody: unknown = await request.json();

    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    requestBody = parsedBody;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  const ipOrigem = extrairIpOrigem(request);
  const userAgent = request.headers.get("user-agent");

  let usuarioDigitado: string;
  let senha: string;

  try {
    usuarioDigitado = requiredText(requestBody.usuario, "usuário").toLowerCase();
    senha = requiredText(requestBody.senha, "senha");
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    throw error;
  }

  /*
   * A conta de serviço (configurada em Administração →
   * Configurações) é só para o backend usar no LDAP — nunca
   * deve conseguir logar interativamente no portal nem
   * aparecer como um usuário.
   */
  const configuracaoAd = await getConfiguracaoAdSemSenha();
  const contaServico = (configuracaoAd?.usuarioServico ?? "")
    .trim()
    .toLowerCase();

  if (contaServico && usuarioDigitado === contaServico) {
    await registrarTentativaLogin({
      usuarioId: null,
      samAccountNameTentado: usuarioDigitado,
      sucesso: false,
      motivoFalha: "conta_servico_bloqueada",
      ipOrigem,
      userAgent,
    });

    return NextResponse.json(
      { ok: false, message: "Usuário ou senha inválidos." },
      { status: 401 }
    );
  }

  const chaveLimite = `${ipOrigem ?? "sem-ip"}:${usuarioDigitado}`;
  const limite = verificarLimiteLogin(chaveLimite);

  if (!limite.permitido) {
    await registrarTentativaLogin({
      usuarioId: null,
      samAccountNameTentado: usuarioDigitado,
      sucesso: false,
      motivoFalha: "limite_tentativas_excedido",
      ipOrigem,
      userAgent,
    });

    return NextResponse.json(
      {
        ok: false,
        message:
          "Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.",
      },
      { status: 429 }
    );
  }

  try {
    const inicioAd = performance.now();
    let diretorioUsuario;

    try {
      diretorioUsuario = await authenticateWithActiveDirectory(usuarioDigitado, senha);

      await registrarChamadaExternaSemFalhar({
        servico: "active_directory",
        origem: "uso_real",
        sucesso: true,
        duracaoMs: performance.now() - inicioAd,
      });
    } catch (erroAd) {
      /*
       * Só "erro_conexao_ad" indica que o AD em si está fora do ar —
       * usuário/senha inválidos ou credenciais vazias significam que
       * o AD respondeu normalmente, então não contam como falha de
       * saúde do serviço (e "ad_nao_configurado"/"credenciais_invalidas"
       * nem chegam a tentar contato com o AD, então não geram métrica).
       */
      if (erroAd instanceof AuthenticationError) {
        if (erroAd.motivo === "erro_conexao_ad") {
          await registrarChamadaExternaSemFalhar({
            servico: "active_directory",
            origem: "uso_real",
            sucesso: false,
            duracaoMs: performance.now() - inicioAd,
            mensagemErro: erroAd.message,
          });
        } else if (
          erroAd.motivo === "usuario_nao_encontrado" ||
          erroAd.motivo === "senha_invalida"
        ) {
          await registrarChamadaExternaSemFalhar({
            servico: "active_directory",
            origem: "uso_real",
            sucesso: true,
            duracaoMs: performance.now() - inicioAd,
          });
        }
      }

      throw erroAd;
    }

    const usuario = await upsertUsuarioLogin(diretorioUsuario);

    if (!usuario.ativo) {
      registrarTentativaFalha(chaveLimite);

      await registrarTentativaLogin({
        usuarioId: usuario.id,
        samAccountNameTentado: usuarioDigitado,
        sucesso: false,
        motivoFalha: "usuario_inativo",
        ipOrigem,
        userAgent,
      });

      return NextResponse.json(
        {
          ok: false,
          message:
            "Seu acesso ao portal está desativado. Fale com o administrador.",
        },
        { status: 403 }
      );
    }

    limparTentativas(chaveLimite);

    await registrarTentativaLogin({
      usuarioId: usuario.id,
      samAccountNameTentado: usuarioDigitado,
      sucesso: true,
      ipOrigem,
      userAgent,
    });

    const { token, expiraEmSegundos } = await createSessionToken({
      sub: usuario.samAccountName,
      nomeExibicao: usuario.nomeExibicao,
      email: usuario.email,
    });

    const response = NextResponse.json({
      ok: true,
      message: "Login realizado com sucesso.",
      data: {
        nomeExibicao: usuario.nomeExibicao,
        email: usuario.email,
        ehAdministrador: usuario.ehAdministrador,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: expiraEmSegundos,
    });

    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      registrarTentativaFalha(chaveLimite);

      await registrarTentativaLogin({
        usuarioId: null,
        samAccountNameTentado: usuarioDigitado,
        sucesso: false,
        motivoFalha: error.motivo,
        ipOrigem,
        userAgent,
      });

      return NextResponse.json({ ok: false, message: error.message }, { status: 401 });
    }

    console.error("Erro ao processar login:", error);

    return NextResponse.json(
      { ok: false, message: "Não foi possível concluir o login." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("auth/login", handlePOST);
