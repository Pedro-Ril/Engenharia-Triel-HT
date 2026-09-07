import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarAcessosTransferencia } from "@/lib/transferencia/transferencia-acessos";
import { buscarTransferenciaPorId } from "@/lib/transferencia/transferencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/* Botão "Informações" em Minhas transferências — mesma checagem de posse de editar/excluir/reenviar. */
async function handleGET(_request: Request, { params }: RouteParams) {
  const acesso = await verificarAcessoModuloApi("transferencia-arquivos");
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { id } = await params;

  const transferencia = await buscarTransferenciaPorId(id);
  if (!transferencia) {
    return NextResponse.json({ ok: false, message: "Transferência não encontrada." }, { status: 404 });
  }

  if (transferencia.enviadoPorUsuarioId !== usuario.id && !usuario.ehAdministrador) {
    return NextResponse.json(
      { ok: false, message: "Você não tem permissão para ver essas informações." },
      { status: 403 }
    );
  }

  try {
    const resumo = await listarAcessosTransferencia(id);
    return NextResponse.json({ ok: true, data: resumo });
  } catch (error) {
    console.error("Erro ao listar acessos de transferência:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar as informações de acesso." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("transferencia-arquivos/minhas/[id]/acessos", handleGET);
