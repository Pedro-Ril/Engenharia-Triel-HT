import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarVerificacaoAmbiente3dx, verificarAmbiente3dx } from "@/lib/plugins-3dx/ambiente-3dx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEM_MIGRACAO = "Não foi possível carregar a verificação do ambiente (a migração 0175 foi aplicada?).";

/* Estado atual da verificação do ambiente 3DX (versão do 3DSpace e padrão de visualização por nó). */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await buscarVerificacaoAmbiente3dx() });
  } catch (error) {
    console.error("Erro ao carregar a verificação do ambiente 3DX:", error);
    return NextResponse.json({ ok: false, message: SEM_MIGRACAO }, { status: 500 });
  }
}

/* "Verificar agora": roda a verificação (a mesma do agendador, com avisos) e devolve o estado novo. */
async function handlePOST() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const resultado = await verificarAmbiente3dx();
    const message =
      resultado.mudancas === 0
        ? "Verificação concluída: nada mudou."
        : `Verificação concluída: ${resultado.mudancas} mudança(s) registrada(s).`;
    return NextResponse.json({ ok: true, message, data: await buscarVerificacaoAmbiente3dx() });
  } catch (error) {
    console.error("Erro ao verificar o ambiente 3DX:", error);
    return NextResponse.json({ ok: false, message: SEM_MIGRACAO }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/plugins-3dx/ambiente", handleGET);
export const POST = comMetricasApi("admin/plugins-3dx/ambiente", handlePOST);
