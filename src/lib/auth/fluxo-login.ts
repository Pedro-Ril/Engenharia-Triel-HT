import "server-only";

import { NextResponse } from "next/server";

import { getConfiguracaoAdSemSenha } from "./configuracao-ad";
import { createSessionToken, deveUsarCookieSeguro, SESSION_COOKIE_NAME } from "./jwt";
import type { ActiveDirectoryUser } from "./ldap";
import { registrarTentativaLogin } from "./login-historico";
import { limparTentativas, registrarTentativaFalha, verificarLimiteLogin } from "./rate-limit";
import { upsertUsuarioLogin } from "./usuarios";

/*
 * Partes do login compartilhadas entre /api/auth/login e
 * /api/auth/trocar-senha (troca de senha pendente, que termina já
 * logado) -- as duas rotas recebem usuário + senha sem sessão, então
 * passam pelas mesmas barreiras e pelo mesmo registro no histórico.
 */
export interface ContextoLogin {
  usuarioDigitado: string;
  chaveLimite: string;
  ipOrigem: string | null;
  userAgent: string | null;
}

/*
 * A conta de serviço (configurada em Administração → Configurações) é
 * só para o backend usar no LDAP -- nunca deve conseguir logar
 * interativamente no portal nem aparecer como um usuário. E o limite de
 * tentativas por IP + usuário vale para as duas rotas juntas.
 */
export async function barrarAntesDoAd(
  contexto: ContextoLogin
): Promise<NextResponse | null> {
  const configuracaoAd = await getConfiguracaoAdSemSenha();
  const contaServico = (configuracaoAd?.usuarioServico ?? "").trim().toLowerCase();

  if (contaServico && contexto.usuarioDigitado === contaServico) {
    await registrarTentativaLogin({
      usuarioId: null,
      samAccountNameTentado: contexto.usuarioDigitado,
      sucesso: false,
      motivoFalha: "conta_servico_bloqueada",
      ipOrigem: contexto.ipOrigem,
      userAgent: contexto.userAgent,
    });

    return NextResponse.json(
      { ok: false, message: "Usuário ou senha inválidos." },
      { status: 401 }
    );
  }

  if (!verificarLimiteLogin(contexto.chaveLimite).permitido) {
    await registrarTentativaLogin({
      usuarioId: null,
      samAccountNameTentado: contexto.usuarioDigitado,
      sucesso: false,
      motivoFalha: "limite_tentativas_excedido",
      ipOrigem: contexto.ipOrigem,
      userAgent: contexto.userAgent,
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

  return null;
}

/* Usuário já autenticado no AD: sincroniza no portal e abre a sessão. */
export async function concluirLogin(
  request: Request,
  contexto: ContextoLogin,
  diretorioUsuario: ActiveDirectoryUser,
  mensagemSucesso: string
): Promise<NextResponse> {
  const usuario = await upsertUsuarioLogin(diretorioUsuario);

  if (!usuario.ativo) {
    registrarTentativaFalha(contexto.chaveLimite);

    await registrarTentativaLogin({
      usuarioId: usuario.id,
      samAccountNameTentado: contexto.usuarioDigitado,
      sucesso: false,
      motivoFalha: "usuario_inativo",
      ipOrigem: contexto.ipOrigem,
      userAgent: contexto.userAgent,
    });

    return NextResponse.json(
      {
        ok: false,
        message: "Seu acesso ao portal está desativado. Fale com o administrador.",
      },
      { status: 403 }
    );
  }

  limparTentativas(contexto.chaveLimite);

  await registrarTentativaLogin({
    usuarioId: usuario.id,
    samAccountNameTentado: contexto.usuarioDigitado,
    sucesso: true,
    ipOrigem: contexto.ipOrigem,
    userAgent: contexto.userAgent,
  });

  const { token, expiraEmSegundos } = await createSessionToken({
    sub: usuario.samAccountName,
    nomeExibicao: usuario.nomeExibicao,
    email: usuario.email,
  });

  const response = NextResponse.json({
    ok: true,
    message: mensagemSucesso,
    data: {
      nomeExibicao: usuario.nomeExibicao,
      email: usuario.email,
      ehAdministrador: usuario.ehAdministrador,
    },
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: deveUsarCookieSeguro(request),
    path: "/",
    maxAge: expiraEmSegundos,
  });

  return response;
}
