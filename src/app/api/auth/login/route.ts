import { NextResponse } from "next/server";

import { AuthenticationError, TrocaSenhaPendenteError, ValidationError } from "@/lib/auth/errors";
import { barrarAntesDoAd, concluirLogin } from "@/lib/auth/fluxo-login";
import type { ContextoLogin } from "@/lib/auth/fluxo-login";
import { authenticateWithActiveDirectory } from "@/lib/auth/ldap";
import {
  extrairIpOrigem,
  registrarTentativaLogin,
} from "@/lib/auth/login-historico";
import { registrarTentativaFalha } from "@/lib/auth/rate-limit";
import { isObject, requiredText } from "@/lib/auth/validation";
import { registrarChamadaExternaSemFalhar } from "@/lib/monitoramento/chamadas-externas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Motivos em que o AD respondeu normalmente (só recusou a credencial ou
 * pediu troca de senha) -- contam como chamada bem-sucedida na saúde do
 * serviço. "erro_conexao_ad" é o único que indica o AD fora do ar; os
 * demais ("ad_nao_configurado"/"credenciais_invalidas") nem chegam a
 * falar com o AD, então não geram métrica.
 */
const MOTIVOS_AD_RESPONDEU = new Set([
  "usuario_nao_encontrado",
  "senha_invalida",
  "senha_troca_obrigatoria",
  "senha_expirada",
]);

async function handlePOST(request: Request) {
  let usuarioDigitado: string;
  let senha: string;

  try {
    const corpo: unknown = await request.json().catch(() => {
      throw new ValidationError("O corpo da requisição contém um JSON inválido.");
    });

    if (!isObject(corpo)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    usuarioDigitado = requiredText(corpo.usuario, "usuário", 150).toLowerCase();
    senha = requiredText(corpo.senha, "senha", 256);
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
      if (erroAd instanceof AuthenticationError) {
        if (erroAd.motivo === "erro_conexao_ad") {
          await registrarChamadaExternaSemFalhar({
            servico: "active_directory",
            origem: "uso_real",
            sucesso: false,
            duracaoMs: performance.now() - inicioAd,
            mensagemErro: erroAd.message,
          });
        } else if (MOTIVOS_AD_RESPONDEU.has(erroAd.motivo)) {
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

    return await concluirLogin(request, contexto, diretorioUsuario, "Login realizado com sucesso.");
  } catch (error) {
    /*
     * Senha certa, mas o AD exige trocar antes de entrar: não conta como
     * tentativa errada no limitador -- a tela abre o passo de nova senha.
     */
    if (error instanceof TrocaSenhaPendenteError) {
      await registrarTentativaLogin({
        usuarioId: null,
        samAccountNameTentado: usuarioDigitado,
        sucesso: false,
        motivoFalha: error.motivo,
        ipOrigem,
        userAgent: contexto.userAgent,
      });

      return NextResponse.json(
        {
          ok: false,
          message: error.message,
          data: { trocarSenha: error.tipo, politica: error.politica },
        },
        { status: 403 }
      );
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

    console.error("Erro ao processar login:", error);

    return NextResponse.json(
      { ok: false, message: "Não foi possível concluir o login." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("auth/login", handlePOST);
