import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { agendarReinicioAplicacao } from "@/lib/database/configuracao-db";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Não há supervisor de processo (PM2/serviço) neste ambiente — ver
 * agendarReinicioAplicacao. O processo é encerrado e alguém precisa
 * subir a aplicação de novo manualmente no servidor; isto NUNCA
 * deve ser chamado esperando um restart automático.
 */
async function handlePOST() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  console.log(
    `Encerramento da aplicação solicitado por ${acesso.usuario.samAccountName} via Administração → Configurações.`
  );

  agendarReinicioAplicacao();

  return NextResponse.json({
    ok: true,
    message:
      "Processo encerrado. Inicie a aplicação novamente no servidor para o portal voltar ao ar.",
  });
}

export const POST = comMetricasApi("admin/configuracao-db/reiniciar", handlePOST);
