import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { criarAcaoManual, ehAmbiente } from "@/lib/plugins-3dx/plugins-3dx";
import type { AcaoManual3dx } from "@/modules/plugins-3dx/types/plugins3dx.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Ação manual: vira um trabalho 'pendente' na mesma fila dos plugins (portal_3dx_plugins_execucoes); o próximo nó
 * livre do 3DSpace pega em segundos. Substitui a página JSP temporária que existia no servidor de teste.
 */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    /* O ambiente decide qual 3DSpace processa: só os nós daquele ambiente pegam o trabalho. */
    const ambiente = body.ambiente;
    if (!ehAmbiente(ambiente)) throw new ValidationError("Escolha o ambiente (Produção ou Teste).");

    let acao: AcaoManual3dx;
    if (body.plugin === "drawing-config-link" && body.acao === "varredura") {
      const limite = optionalInteger(body.limite, "limite", 0);
      if (limite < 0) throw new ValidationError("O limite não pode ser negativo.");
      acao = { ambiente, plugin: "drawing-config-link", acao: "varredura", limite };
    } else if (
      (body.plugin === "replace-revision" || body.plugin === "drawing-config-link") &&
      body.acao === "reprocessar"
    ) {
      acao = { ambiente, plugin: body.plugin, acao: "reprocessar", nome: requiredText(body.nome, "nome", 200) };
    } else {
      throw new ValidationError("Ação inválida.");
    }

    const id = await criarAcaoManual(acao, acesso.usuario);
    return NextResponse.json({
      ok: true,
      message: "Trabalho enviado para a fila. Acompanhe em Execuções.",
      data: { id },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao criar ação manual dos Plugins 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível enviar a ação." }, { status: 500 });
  }
}

export const POST = comMetricasApi("admin/plugins-3dx/acoes", handlePOST);
