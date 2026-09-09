import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import type { EventoNotificacaoChamado } from "@/lib/chamados/notificacoes-email";
import { listarNotificacoesEmailChamados } from "@/lib/chamados/notificacoes-email";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTOS_VALIDOS: EventoNotificacaoChamado[] = [
  "aberto",
  "aceito",
  "nova_resposta",
  "resolvido_pendente",
  "reaberto",
  "fechado",
];

async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { searchParams } = new URL(request.url);

  const chamadoNumeroParam = searchParams.get("chamadoNumero");
  const chamadoNumero =
    chamadoNumeroParam && Number.isInteger(Number(chamadoNumeroParam))
      ? Number(chamadoNumeroParam)
      : undefined;

  const eventoParam = searchParams.get("evento");
  const evento =
    eventoParam && (EVENTOS_VALIDOS as string[]).includes(eventoParam)
      ? (eventoParam as EventoNotificacaoChamado)
      : undefined;

  const sucessoParam = searchParams.get("sucesso");
  const sucesso = sucessoParam === "true" ? true : sucessoParam === "false" ? false : undefined;

  const pagina = Math.max(1, Number(searchParams.get("pagina")) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(searchParams.get("porPagina")) || 25));

  try {
    const resultado = await listarNotificacoesEmailChamados({
      chamadoNumero,
      evento,
      sucesso,
      pagina,
      porPagina,
    });

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    console.error("Erro ao listar notificações de e-mail de chamados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as notificações de e-mail." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/chamados/notificacoes-email", handleGET);
