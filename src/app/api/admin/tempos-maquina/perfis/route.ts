import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { criarPerfil, listarPerfis } from "@/lib/tempos-maquina/cadastro";

import { lerCorpo, respostaDeErro } from "../respostas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarPerfis() });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível listar os perfis de tempo");
  }
}

export const GET = comMetricasApi("admin/tempos-maquina/perfis", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const corpo = await lerCorpo(request);
    const perfil = await criarPerfil(
      {
        nome: requiredText(corpo.nome, "nome", 150),
        metodo: corpo.metodo,
        parametros: corpo.parametros,
        observacao: optionalText(corpo.observacao, "observação", 1000),
      },
      acesso.usuario.nomeExibicao
    );
    return NextResponse.json({ ok: true, message: "Perfil criado (inativo).", data: perfil }, { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "Não foi possível criar o perfil de tempo");
  }
}

export const POST = comMetricasApi("admin/tempos-maquina/perfis", handlePOST);
