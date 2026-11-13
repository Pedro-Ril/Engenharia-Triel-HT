import { NextResponse } from "next/server";

import { AuthenticationError, ValidationError } from "@/lib/auth/errors";
import { barrarAntesDoAd, concluirLogin } from "@/lib/auth/fluxo-login";
import type { ContextoLogin } from "@/lib/auth/fluxo-login";
import { trocarSenhaPendenteNoAd } from "@/lib/auth/ldap";
import {
  extrairIpOrigem,
  registrarTentativaLogin,
} from "@/lib/auth/login-historico";
import { registrarTentativaFalha } from "@/lib/auth/rate-limit";
import { isObject, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Troca de senha pendente (senha provisória do "alterar no próximo
 * logon", ou senha vencida), chamada pelo passo extra da tela de login.
 * Sem sessão -- quem prova a identidade é a senha atual, conferida pelo
 * próprio AD. Termina já logado, como o /api/auth/login.
 */
async function handlePOST(request: Request) {
  let usuarioDigitado: string;
  let senhaAtual: string;
  let novaSenha: string;

  try {
    const corpo: unknown = await request.json().catch(() => {
      throw new ValidationError("O corpo da requisição contém um JSON inválido.");
    });

    if (!isObject(corpo)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    usuarioDigitado = requiredText(corpo.usuario, "usuário", 150).toLowerCase();
    senhaAtual = requiredText(corpo.senhaAtual, "senha atual", 256);

    if (typeof corpo.novaSenha !== "string" || !corpo.novaSenha) {
      throw new ValidationError("Informe a nova senha.");
    }

    novaSenha = corpo.novaSenha;

    if (novaSenha.length > 256) {
      throw new ValidationError("A nova senha pode ter no máximo 256 caracteres.");
    }

    /*
     * O login do portal sempre ignorou espaço no começo/fim da senha; o
     * Windows não. Uma senha assim funcionaria num e não no outro.
     */
    if (novaSenha !== novaSenha.trim()) {
      throw new ValidationError("A nova senha não pode começar nem terminar com espaço.");
    }

    if (novaSenha === senhaAtual) {
      throw new ValidationError("A nova senha precisa ser diferente da atual.");
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    throw error;
  }

  const ipOrigem = extrairIpOrigem(request);
  const contexto: ContextoLogin = {
    usuarioDigitado,
    chaveLimite: `${ipOrigem ?? "sem-ip"}:${usuarioDigitado}`,
    ipOrigem,
    userAgent: request.headers.get("user-agent"),
  };

  const barrado = await barrarAntesDoAd(contexto);
  if (barrado) return barrado;

  try {
    const diretorioUsuario = await trocarSenhaPendenteNoAd(
      usuarioDigitado,
      senhaAtual,
      novaSenha
    );

    return await concluirLogin(
      request,
      contexto,
      diretorioUsuario,
      "Senha alterada. Você já está dentro do portal."
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      await registrarTentativaLogin({
        usuarioId: null,
        samAccountNameTentado: usuarioDigitado,
        sucesso: false,
        motivoFalha: "nova_senha_recusada",
        ipOrigem,
        userAgent: contexto.userAgent,
      });

      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    if (error instanceof AuthenticationError) {
      registrarTentativaFalha(contexto.chaveLimite);

      await registrarTentativaLogin({
        usuarioId: null,
        samAccountNameTentado: usuarioDigitado,
        sucesso: false,
        motivoFalha: error.motivo,
        ipOrigem,
        userAgent: contexto.userAgent,
      });

      return NextResponse.json({ ok: false, message: error.message }, { status: 401 });
    }

    console.error("Erro ao trocar a senha no AD:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Não foi possível trocar a senha agora. Tente de novo ou fale com a TI.",
      },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("auth/trocar-senha", handlePOST);
