import { NextResponse } from "next/server";

import { AuthenticationError, ValidationError } from "@/lib/auth/errors";
import { authenticateWithActiveDirectory } from "@/lib/auth/ldap";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { isObject, requiredText } from "@/lib/auth/validation";
import { guardarSenhaAgendada, MINUTOS_ESPERA_INDEXACAO } from "@/lib/3dexperience/liberacao-agendada";
import { agendarSimulacaoAutomatica } from "@/lib/3dexperience/liberacao-desenhos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * AGENDA a liberação de um item pai (body `{ codigo, senha }`): daqui a
 * MINUTOS_ESPERA_INDEXACAO o Portal simula, libera em nome de quem pediu
 * tudo o que estiver em trabalho e avisa por e-mail (ver
 * liberacao-agendada.ts). A senha é conferida AGORA no AD (senha errada
 * volta na hora, em vez de descobrir 4 minutos depois) e fica só na
 * memória do servidor até o 3DX aceitar o job -- nunca vai para banco
 * nem log. Administrador do Portal não manda senha.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    const codigo = requiredText(body.codigo, "código do item pai", 50).trim();
    if (!/^[0-9A-Za-z._-]+$/.test(codigo)) throw new ValidationError("Código do item inválido.");

    const comoAdmin = acesso.usuario.ehAdministrador;
    let senha: string | null = null;
    if (!comoAdmin) {
      senha = requiredText(body.senha, "senha", 200);
      try {
        await authenticateWithActiveDirectory(acesso.usuario.samAccountName, senha);
      } catch (erro) {
        if (erro instanceof AuthenticationError) {
          throw new ValidationError(
            erro.motivo === "erro_conexao_ad" || erro.motivo === "ad_nao_configurado"
              ? erro.message
              : "Senha incorreta. Digite a mesma senha que você usa para entrar no Portal."
          );
        }
        throw erro;
      }
    }

    const id = await agendarSimulacaoAutomatica(codigo, acesso.usuario, MINUTOS_ESPERA_INDEXACAO);
    if (senha) guardarSenhaAgendada(id, senha);

    await registrarLog({
      nivel: "info",
      origem: "3dexperience/liberacao",
      mensagem: `${acesso.usuario.nomeExibicao} agendou a liberação de ${codigo} para daqui a ${MINUTOS_ESPERA_INDEXACAO} minutos ${
        comoAdmin ? "com o admin da plataforma" : "em seu nome"
      } (rodada ${id}).`,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    });

    return NextResponse.json(
      { ok: true, data: { id, minutos: MINUTOS_ESPERA_INDEXACAO, semEmail: !acesso.usuario.email } },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao agendar a liberação de desenhos:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível agendar a liberação." }, { status: 500 });
  }
}

export const POST = comMetricasApi("3dexperience/liberacao/agendar", handlePOST);
