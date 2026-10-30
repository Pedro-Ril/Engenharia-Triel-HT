import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { inteiroEntre, lerCorpoJson, respostaDeErro, validarEndereco } from "@/lib/rotas-avulsas/admin";
import { ErroIpp, lerCertificado } from "@/lib/rotas-avulsas/impressao/ipp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Lê o certificado TLS que a impressora apresenta, para o admin conferir e
 * fixar no cadastro. Só faz o handshake; não envia nada à impressora.
 */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const corpo = await lerCorpoJson(request);
    const endereco = validarEndereco(corpo.endereco);
    const porta = inteiroEntre(corpo.porta ?? 631, "porta", 1, 65535);

    try {
      return NextResponse.json({ ok: true, data: await lerCertificado(endereco, porta) });
    } catch (erro) {
      if (erro instanceof ErroIpp) return NextResponse.json({ ok: false, message: erro.message }, { status: 502 });
      throw erro;
    }
  } catch (erro) {
    return respostaDeErro(erro, "ler certificado da impressora", "Não foi possível ler o certificado.");
  }
}

export const POST = comMetricasApi("admin/impressao/certificado", handlePOST);
