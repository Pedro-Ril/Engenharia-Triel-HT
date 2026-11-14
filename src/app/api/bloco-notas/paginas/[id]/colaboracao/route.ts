import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { corDaPessoa, emitirPasseColaboracao, portaColaboracao } from "@/lib/bloco-notas/colaboracao";
import { acessoPagina } from "@/lib/bloco-notas/compartilhamento";
import { ehUuid, idInvalido, MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/*
 * Passe para editar a página ao vivo: confere o acesso AGORA (dono ou
 * compartilhada) e devolve o token curto + a porta do serviço. Chamado a
 * cada (re)conexão, então quem perdeu o acesso não reconecta.
 */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    const acessoPg = await acessoPagina(acesso.usuario.id, id);
    if (!acessoPg) {
      return NextResponse.json({ ok: false, message: "Página não encontrada." }, { status: 404 });
    }

    const podeEditar = acessoPg.permissao !== "ver";
    const token = await emitirPasseColaboracao({ usuarioId: acesso.usuario.id, paginaId: id, podeEditar });

    return NextResponse.json({
      ok: true,
      data: {
        token,
        porta: portaColaboracao(),
        podeEditar,
        pessoa: { nome: acesso.usuario.nomeExibicao, cor: corDaPessoa(acesso.usuario.id) },
      },
    });
  } catch (error) {
    return respostaDeErro(error, "passe de colaboração");
  }
}

export const GET = comMetricasApi("bloco-notas/paginas/[id]/colaboracao", handleGET);
