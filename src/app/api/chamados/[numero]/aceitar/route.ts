import { NextResponse } from "next/server";

import { aceitarChamado, buscarChamadoPorNumero } from "@/lib/chamados/chamados";
import { origemPublicaEfetivaChamados } from "@/lib/chamados/chamados-config";
import { carregarContextoAcao, lerNomeConfirmado } from "@/lib/chamados/api-helpers";
import { notificarSolicitanteChamado } from "@/lib/chamados/notificacoes-email";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ numero: string }>;
}

async function handlePOST(request: Request, context: RouteContext) {
  const { numero } = await context.params;
  const nomeConfirmado = await lerNomeConfirmado(request);

  const { contexto, erro } = await carregarContextoAcao(numero, nomeConfirmado);
  if (erro) return erro;

  const { chamado, usuario, ehAtendente, ehDono } = contexto;

  if (!ehAtendente || !usuario) {
    return NextResponse.json(
      { ok: false, message: "Apenas atendentes deste setor podem aceitar o chamado." },
      { status: 403 }
    );
  }

  try {
    const sucesso = await aceitarChamado(chamado.id, usuario.id, usuario.nomeExibicao);

    if (!sucesso) {
      return NextResponse.json(
        {
          ok: false,
          message: chamado.atendenteNome
            ? `Este chamado já está sendo atendido por ${chamado.atendenteNome}.`
            : "Não foi possível aceitar este chamado.",
        },
        { status: 409 }
      );
    }

    if (!ehDono) {
      await notificarSolicitanteChamado({
        chamado,
        evento: "aceito",
        origem: await origemPublicaEfetivaChamados(request),
        autorNome: usuario.nomeExibicao,
      });
    }

    const atualizado = await buscarChamadoPorNumero(chamado.numero);
    return NextResponse.json({ ok: true, message: "Chamado aceito.", data: atualizado });
  } catch (error) {
    console.error("Erro ao aceitar chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível aceitar o chamado." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("chamados/[numero]/aceitar", handlePOST);
