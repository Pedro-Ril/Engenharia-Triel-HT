import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { criarDePara, listarDeParasPorEmpresa } from "@/lib/depara-materia-prima/depara-materia-prima";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function semCodigoEmpresa() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Seu usuário não tem um código de empresa configurado. Peça para um administrador preencher esse campo em Administração > Usuários.",
    },
    { status: 400 }
  );
}

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("depara-materia-prima");
  if (acesso.negado) return acesso.negado;

  const codEmpresa = acesso.usuario.codigoEmpresa;
  if (!codEmpresa) return semCodigoEmpresa();

  try {
    const deParas = await listarDeParasPorEmpresa(codEmpresa);
    return NextResponse.json({ ok: true, data: deParas });
  } catch (error) {
    console.error("Erro ao listar de-paras de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os de-paras." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("depara-materia-prima", handleGET);

interface CreateDeParaBody {
  codItemOrigem?: unknown;
  descItemOrigem?: unknown;
  codItemDestino?: unknown;
  descItemDestino?: unknown;
  observacao?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("depara-materia-prima");
  if (acesso.negado) return acesso.negado;

  const codEmpresa = acesso.usuario.codigoEmpresa;
  if (!codEmpresa) return semCodigoEmpresa();

  let body: CreateDeParaBody;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    body = parsedBody;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  try {
    const codItemOrigem = requiredText(body.codItemOrigem, "MP de origem", 30);
    const codItemDestino = requiredText(body.codItemDestino, "MP de destino", 30);
    const descItemOrigem = optionalText(body.descItemOrigem, "descrição da MP de origem", 200);
    const descItemDestino = optionalText(body.descItemDestino, "descrição da MP de destino", 200);
    const observacao = requiredText(body.observacao, "observação", 500);

    const dePara = await criarDePara({
      codEmpresa,
      codItemOrigem,
      descItemOrigem,
      codItemDestino,
      descItemDestino,
      observacao,
      criadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json(
      { ok: true, message: "De-para criado.", data: dePara },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar de-para de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar o de-para." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("depara-materia-prima", handlePOST);
