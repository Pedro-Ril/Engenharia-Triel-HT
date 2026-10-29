import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { executarSeparacao, listarSeparacoes } from "@/lib/engenharia-versatil/separacao";
import { lerPlanilhaEnviada } from "@/lib/engenharia-versatil/planilha-enviada";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Histórico das separações (pagina, porPagina). */
async function handleGET(request: Request) {
  const acesso = await verificarAcessoModuloApi("engenharia-versatil");
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(url.searchParams.get("porPagina")) || 20));

  try {
    return NextResponse.json({ ok: true, data: await listarSeparacoes({ pagina, porPagina }) });
  } catch (error) {
    console.error("Erro ao listar as separações da Engenharia Versátil:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível listar as separações." }, { status: 500 });
  }
}

export const GET = comMetricasApi("engenharia-versatil/separacao", handleGET);

/*
 * EXECUTA a separação: refaz a análise na hora, cria as pastas que faltam
 * e copia os arquivos para a pasta do projeto na rede. Nunca sobrescreve
 * nem apaga nada no destino. A tela confirma antes de chamar.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("engenharia-versatil");
  if (acesso.negado) return acesso.negado;

  try {
    const { conteudo, nome } = await lerPlanilhaEnviada(request);
    const id = await executarSeparacao(conteudo, nome, acesso.usuario);

    await registrarLog({
      nivel: "info",
      origem: "engenharia-versatil/separacao",
      mensagem: `${acesso.usuario.nomeExibicao} separou a engenharia de "${nome}".`,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    });

    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao executar a separação da Engenharia Versátil:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível concluir a separação. Veja o histórico." }, { status: 500 });
  }
}

export const POST = comMetricasApi("engenharia-versatil/separacao", handlePOST);
