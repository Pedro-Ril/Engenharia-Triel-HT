import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { ehAmbiente } from "@/lib/plugins-3dx/plugins-3dx";
import {
  carregarDadosRelatorio,
  enviarRelatorio,
  listarEnviosRelatorio,
  nomeArquivoRelatorio,
  TIPO_PDF,
  TIPO_XLSX,
  validarDataRelatorio,
} from "@/lib/plugins-3dx/relatorio-diario";
import { gerarExcel, gerarPdf } from "@/lib/plugins-3dx/relatorio-diario-arquivos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Relatório diário dos Plugins 3DX (o envio automático fica em src/lib/plugins-3dx/relatorio-diario.ts).
 *  GET ?formato=pdf|xlsx&data=AAAA-MM-DD[&ambiente=] -> o arquivo, para conferir ou baixar um dia qualquer;
 *  GET (sem formato)                                 -> os últimos envios automáticos;
 *  POST { data, ambiente? }                          -> manda o relatório só para o e-mail de quem pediu.
 */
async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const formato = url.searchParams.get("formato");

  try {
    if (!formato) {
      return NextResponse.json({ ok: true, data: await listarEnviosRelatorio() });
    }
    if (formato !== "pdf" && formato !== "xlsx") throw new ValidationError("Formato inválido.");

    const data = validarDataRelatorio(url.searchParams.get("data"));
    const ambienteParam = url.searchParams.get("ambiente");
    const ambiente = ehAmbiente(ambienteParam) ? ambienteParam : null;
    const dados = await carregarDadosRelatorio(data, ambiente);
    const conteudo = formato === "pdf" ? gerarPdf(dados) : gerarExcel(dados);

    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "Content-Type": formato === "pdf" ? TIPO_PDF : TIPO_XLSX,
        "Content-Disposition": `attachment; filename="${nomeArquivoRelatorio(data, ambiente, formato)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro no relatório diário dos Plugins 3DX:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível gerar o relatório (a migração 0176 foi aplicada?)." },
      { status: 500 }
    );
  }
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json().catch(() => null);
    if (!isObject(corpo)) throw new ValidationError("Requisição inválida.");
    const data = validarDataRelatorio(corpo.data);
    const ambiente = ehAmbiente(corpo.ambiente) ? corpo.ambiente : null;
    const email = acesso.usuario.email?.trim();
    if (!email) throw new ValidationError("Seu usuário não tem e-mail cadastrado — não há para onde mandar.");

    const total = await enviarRelatorio(data, ambiente, [email]);
    return NextResponse.json({
      ok: true,
      message: `Relatório enviado para ${email} (${total} execução(ões) no dia).`,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao enviar o relatório diário dos Plugins 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível enviar o relatório." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/plugins-3dx/relatorio-diario", handleGET);
export const POST = comMetricasApi("admin/plugins-3dx/relatorio-diario", handlePOST);
