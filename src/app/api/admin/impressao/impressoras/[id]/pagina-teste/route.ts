import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { requiredUuidArray } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { respostaDeErro } from "@/lib/rotas-avulsas/admin";
import {
  buscarImpressora,
  destinoDaImpressora,
  naFilaDaImpressora,
  ROTA_IMPRESSAO,
  type Impressora,
} from "@/lib/rotas-avulsas/impressao/impressao";
import { descreverStatus, ErroIpp, imprimirPdf, statusOk } from "@/lib/rotas-avulsas/impressao/ipp";
import { registrarLogRotaAvulsa } from "@/lib/rotas-avulsas/rotas-avulsas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/* Uma página A4 simples, gerada na hora, pelo mesmo caminho (IPP) que a rota usa. */
async function gerarPaginaTeste(impressora: Impressora, usuario: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([595.28, 841.89]);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cinza = rgb(0.35, 0.35, 0.35);

  pagina.drawText("Portal Triel-HT", { x: 56, y: 760, size: 22, font: negrito, color: rgb(0.75, 0.1, 0.12) });
  pagina.drawText("Página de teste da rota avulsa de impressão", { x: 56, y: 730, size: 14, font: negrito });

  const linhas = [
    `Impressora: ${impressora.codigo} - ${impressora.nome}`,
    `Endereço: ${impressora.usarTls ? "ipps" : "ipp"}://${impressora.endereco}:${impressora.porta}${impressora.caminhoIpp}`,
    `Frente e verso padrão: ${impressora.frenteVersoPadrao ? "sim" : "não"}`,
    `Enviada por: ${usuario}`,
    `Data: ${new Date().toLocaleString("pt-BR")}`,
  ];
  linhas.forEach((linha, i) => pagina.drawText(linha, { x: 56, y: 690 - i * 20, size: 11, font: fonte, color: cinza }));

  pagina.drawText("Se esta página saiu, o Portal está imprimindo direto na impressora, sem passar pelo Windows.", {
    x: 56,
    y: 560,
    size: 10,
    font: fonte,
  });

  return Buffer.from(await pdf.save());
}

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const inicio = Date.now();
  try {
    const { id } = await context.params;
    const impressora = await buscarImpressora(requiredUuidArray([id], "impressora")[0]);
    if (!impressora) return NextResponse.json({ ok: false, message: "Impressora não encontrada." }, { status: 404 });

    const usuario = acesso.usuario.samAccountName;
    const pdf = await gerarPaginaTeste(impressora, usuario);
    const log = {
      rotaChave: ROTA_IMPRESSAO,
      tokenId: null,
      tokenNome: `Administração (${usuario})`,
      ipOrigem: null,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    };

    try {
      const resposta = await naFilaDaImpressora(impressora.id, () =>
        imprimirPdf(destinoDaImpressora(impressora), {
          pdf,
          usuario: `Portal (${usuario})`,
          nomeTrabalho: "Página de teste do Portal",
          copias: 1,
          frenteVerso: false,
        })
      );
      const jobId = resposta.atributos["job-id"]?.[0] ?? null;
      const ok = statusOk(resposta.status);

      await registrarLogRotaAvulsa({
        ...log,
        statusHttp: ok ? 201 : 502,
        resultado: ok ? "aceito" : "erro",
        motivo: ok ? "Página de teste enviada pela administração." : `Página de teste recusada: ${descreverStatus(resposta.status)}.`,
        detalhes: { impressora: impressora.codigo, paginaTeste: true, jobId, statusIpp: resposta.status },
        duracaoMs: Date.now() - inicio,
      });

      return ok
        ? NextResponse.json({ ok: true, message: `Página de teste enviada (trabalho ${jobId ?? "sem número"} na impressora).` })
        : NextResponse.json({ ok: false, message: `A impressora recusou: ${descreverStatus(resposta.status)}.` }, { status: 502 });
    } catch (erro) {
      if (!(erro instanceof ErroIpp)) throw erro;
      await registrarLogRotaAvulsa({
        ...log,
        statusHttp: 502,
        resultado: "erro",
        motivo: `Página de teste: ${erro.message}`,
        detalhes: { impressora: impressora.codigo, paginaTeste: true },
        duracaoMs: Date.now() - inicio,
      });
      return NextResponse.json({ ok: false, message: erro.message }, { status: 502 });
    }
  } catch (erro) {
    return respostaDeErro(erro, "imprimir página de teste", "Não foi possível imprimir a página de teste.");
  }
}

export const POST = comMetricasApi("admin/impressao/impressoras/[id]/pagina-teste", handlePOST);
