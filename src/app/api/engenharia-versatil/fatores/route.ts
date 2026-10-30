import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { ErroGravacaoFatores, gravarFatores, listarGravacoesFator } from "@/lib/engenharia-versatil/fator-conversao";
import { lerPlanilhaEnviada } from "@/lib/engenharia-versatil/planilha-enviada";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Os códigos marcados na tela (campo "marcados" do multipart, JSON de strings). */
function lerMarcados(valor: FormDataEntryValue | null): string[] {
  let lista: unknown;
  try {
    lista = JSON.parse(typeof valor === "string" ? valor : "[]");
  } catch {
    throw new ValidationError("Lista de itens marcados inválida.");
  }
  if (!Array.isArray(lista) || lista.some((c) => typeof c !== "string" || !c.trim() || c.length > 50)) {
    throw new ValidationError("Lista de itens marcados inválida.");
  }
  return [...new Set(lista.map((c: string) => c.trim()))];
}

/*
 * GRAVA no ERP (ambiente da administração) os fatores de conversão para
 * KG dos itens marcados: refaz a conferência, simula no ERP e inclui/
 * altera. A tela confirma antes de chamar.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("engenharia-versatil");
  if (acesso.negado) return acesso.negado;

  try {
    const { conteudo, nome, form } = await lerPlanilhaEnviada(request);
    const resultado = await gravarFatores(conteudo, nome, lerMarcados(form.get("marcados")), acesso.usuario);

    await registrarLog({
      nivel: resultado.erro ? "aviso" : "info",
      origem: "engenharia-versatil/fatores",
      mensagem: `${acesso.usuario.nomeExibicao} gravou fatores de conversão de "${nome}" no ERP (${resultado.ambiente}): ${resultado.incluidos} incluído(s), ${resultado.alterados} alterado(s).`,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    });

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    /* Recusa do ERP: devolve também as chamadas (enviado + resposta) para a tela mostrar o JSON. */
    if (error instanceof ErroGravacaoFatores) {
      return NextResponse.json({ ok: false, message: error.message, data: { chamadas: error.chamadas } }, { status: 400 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao gravar os fatores de conversão:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível gravar os fatores no ERP." }, { status: 500 });
  }
}

export const POST = comMetricasApi("engenharia-versatil/fatores", handlePOST);

/*
 * Histórico das gravações de fator e dos ajustes de peso. Query: pagina,
 * porPagina, projeto, codigo (item), usuario, ambiente (teste | producao),
 * tipo (fator | peso).
 */
async function handleGET(request: Request) {
  const acesso = await verificarAcessoModuloApi("engenharia-versatil");
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const texto = (nome: string, max: number) => (url.searchParams.get(nome) ?? "").trim().slice(0, max) || null;
  const ambiente = url.searchParams.get("ambiente");
  const tipo = url.searchParams.get("tipo");

  try {
    const data = await listarGravacoesFator({
      pagina: Math.max(1, Number(url.searchParams.get("pagina")) || 1),
      porPagina: Math.min(100, Math.max(1, Number(url.searchParams.get("porPagina")) || 20)),
      projeto: texto("projeto", 30),
      codigo: texto("codigo", 50),
      usuario: texto("usuario", 200),
      ambiente: ambiente === "teste" || ambiente === "producao" ? ambiente : null,
      tipo: tipo === "fator" || tipo === "peso" ? tipo : null,
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Erro ao listar o histórico de fatores:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível listar o histórico de fatores." }, { status: 500 });
  }
}

export const GET = comMetricasApi("engenharia-versatil/fatores", handleGET);
