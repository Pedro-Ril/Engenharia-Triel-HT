import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { agendarReinicioAplicacao } from "@/lib/database/configuracao-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Não há supervisor de processo (PM2/serviço) neste ambiente — ver
 * agendarReinicioAplicacao. O processo é encerrado e alguém precisa
 * subir a aplicação de novo manualmente no servidor; isto NUNCA
 * deve ser chamado esperando um restart automático.
 */
export async function POST() {
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
