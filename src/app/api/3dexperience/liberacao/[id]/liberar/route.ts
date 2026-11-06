import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText, requiredUuidArray } from "@/lib/auth/validation";
import { iniciarLiberacao } from "@/lib/3dexperience/liberacao-desenhos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/* Os physicalIds dos desenhos marcados na tela (sem repetição). */
function desenhosEscolhidos(body: unknown): string[] {
  const lista = isObject(body) ? body.desenhos : undefined;
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new ValidationError("Marque pelo menos um desenho para liberar.");
  }
  const ids = lista.map((valor) => (typeof valor === "string" ? valor.trim() : ""));
  if (ids.some((id) => !id || id.length > 64)) throw new ValidationError("Lista de desenhos inválida.");
  return [...new Set(ids)];
}

/*
 * LIBERA de verdade no 3DX (produção) os desenhos marcados (body
 * `{ desenhos: physicalId[], senha }`), dentre os que a simulação {id}
 * apontou, EM NOME de quem pediu: a senha (a mesma do Portal/AD) vai para
 * a API do 3DX abrir uma sessão do próprio usuário. Nunca é gravada nem
 * logada. Administrador do Portal não manda senha: vai com o admin da
 * plataforma. Sem desfazer simples: a tela confirma antes de chamar.
 */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const simulacaoId = requiredUuidArray([id], "simulação")[0];
    const corpo: unknown = await request.json().catch(() => null);
    const desenhos = desenhosEscolhidos(corpo);
    /* Administrador do Portal libera com o admin da plataforma (sem senha); os demais, em nome próprio. */
    const senha = acesso.usuario.ehAdministrador
      ? null
      : requiredText(isObject(corpo) ? corpo.senha : undefined, "senha", 200);
    const liberacaoId = await iniciarLiberacao(simulacaoId, desenhos, acesso.usuario, senha);

    await registrarLog({
      nivel: "info",
      origem: "3dexperience/liberacao",
      mensagem: `${acesso.usuario.nomeExibicao} iniciou a liberação real de ${desenhos.length} desenho(s) ${
        acesso.usuario.ehAdministrador ? "com o admin da plataforma" : "em seu nome"
      } no 3DX (simulação ${simulacaoId}).`,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    });

    return NextResponse.json({ ok: true, data: { id: liberacaoId } }, { status: 202 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao iniciar a liberação de desenhos:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível iniciar a liberação." }, { status: 500 });
  }
}

export const POST = comMetricasApi("3dexperience/liberacao/[id]/liberar", handlePOST);
