import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { ValidationError } from "@/lib/auth/errors";
import { optionalText, requiredText } from "@/lib/auth/validation";
import { criarChamado } from "@/lib/chamados/chamados";
import { parseAnexosFormData, requiredPrioridade } from "@/lib/chamados/validacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Pública: qualquer pessoa abre um chamado, logada ou não. Se
 * houver sessão, o solicitante é identificado por ela (nome/
 * usuário não podem ser forjados pelo corpo da requisição); sem
 * sessão, o nome é obrigatório no formulário.
 */
async function handlePOST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição deve ser multipart/form-data." },
      { status: 400 }
    );
  }

  try {
    const usuario = await getUsuarioAutenticado();

    const setorId = requiredText(formData.get("setorId"), "setor", 60);
    const categoriaId = requiredText(formData.get("categoriaId"), "categoria", 60);
    const prioridade = requiredPrioridade(formData.get("prioridade"));
    const titulo = requiredText(formData.get("titulo"), "título", 200);
    const descricao = requiredText(formData.get("descricao"), "descrição", 4000);

    const solicitanteNome = usuario
      ? usuario.nomeExibicao
      : requiredText(formData.get("nome"), "nome", 200);

    const solicitanteContato = usuario
      ? optionalText(formData.get("contato"), "contato", 200) ?? usuario.email
      : optionalText(formData.get("contato"), "contato", 200);

    const anexos = await parseAnexosFormData(formData, "anexos");

    const { numero } = await criarChamado({
      setorId,
      categoriaId,
      prioridade,
      titulo,
      descricao,
      solicitanteUsuarioId: usuario?.id ?? null,
      solicitanteNome,
      solicitanteContato,
      empresa: usuario?.codigoEmpresa ?? null,
      solicitanteDepartamento: usuario?.departamento ?? null,
      ipOrigem: extrairIpOrigem(request),
      anexos,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Chamado aberto com sucesso.",
        data: { numero },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao abrir chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível abrir o chamado." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("chamados", handlePOST);
