import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { compartilharPagina, listarCompartilhamentos } from "@/lib/bloco-notas/compartilhamento";
import { avisarCompartilhamentoSemFalhar } from "@/lib/bloco-notas/notificacao-email";
import { ehUuid, idInvalido, MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { origemPublicaEfetivaChamados } from "@/lib/chamados/chamados-config";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Com quem a página está compartilhada (só o dono vê/muda). */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    return NextResponse.json({ ok: true, data: await listarCompartilhamentos(acesso.usuario.id, id) });
  } catch (error) {
    return respostaDeErro(error, "listar compartilhamentos");
  }
}

export const GET = comMetricasApi("bloco-notas/paginas/[id]/compartilhamentos", handleGET);

/* Inclui uma pessoa ou muda a permissão dela: { usuarioId, permissao: "ver" | "editar" }. */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    const corpo: unknown = await request.json();
    if (!isObject(corpo)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    if (!ehUuid(corpo.usuarioId)) throw new ValidationError("Escolha a pessoa.");
    if (corpo.permissao !== "ver" && corpo.permissao !== "editar") {
      throw new ValidationError("Permissão inválida.");
    }

    const { novo } = await compartilharPagina(acesso.usuario.id, id, corpo.usuarioId, corpo.permissao);

    /*
     * Quem acabou de ganhar acesso recebe um aviso por e-mail. Sem await:
     * o SMTP não segura a resposta da tela, e a função nunca falha (erro
     * vai para o log). Trocar a permissão de quem já tinha acesso não avisa.
     */
    if (novo) {
      const origem = await origemPublicaEfetivaChamados(request);
      void avisarCompartilhamentoSemFalhar({
        paginaId: id,
        usuarioAlvoId: corpo.usuarioId,
        donoNome: acesso.usuario.nomeExibicao,
        permissao: corpo.permissao,
        origem,
      });
    }

    return NextResponse.json({ ok: true, data: await listarCompartilhamentos(acesso.usuario.id, id) });
  } catch (error) {
    return respostaDeErro(error, "compartilhar");
  }
}

export const POST = comMetricasApi("bloco-notas/paginas/[id]/compartilhamentos", handlePOST);
