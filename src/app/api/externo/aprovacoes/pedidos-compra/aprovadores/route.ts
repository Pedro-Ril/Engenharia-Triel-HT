import { NextResponse } from "next/server";

import { autenticarSistemaExterno } from "@/lib/aprovacoes/pedidos-compra";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * DESCONTINUADO: quem decide o pedido de compra agora é a alçada da
 * empresa (Administração → Diretoria → Alçadas), não um diretor
 * escolhido no envio. Continua respondendo -- sempre lista vazia -- para
 * a tela do SupriConnect esconder a escolha sem quebrar.
 */
async function handleGET(request: Request) {
  const negado = await autenticarSistemaExterno(request);
  if (negado) return negado;

  return NextResponse.json({ ok: true, data: [] });
}

export const GET = comMetricasApi("externo/aprovacoes/pedidos-compra/aprovadores", handleGET);
