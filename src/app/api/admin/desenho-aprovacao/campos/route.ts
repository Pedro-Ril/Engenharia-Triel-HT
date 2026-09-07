import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import {
  criarCampoDinamico,
  listarCamposDinamicos,
  type CategoriaCampo,
  type TipoDadoCampo,
} from "@/lib/desenho-aprovacao/templates";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIAS_VALIDAS = [
  "identificacao",
  "cliente",
  "produto",
  "dimensoes",
  "capacidade",
  "cargas",
  "revisao",
  "auditoria",
  "outro",
];

const TIPOS_DADO_VALIDOS = ["texto", "numero", "booleano", "data"];

const chavePattern = /^[a-zA-Z][a-zA-Z0-9]*$/;

interface CreateCampoBody {
  chave?: unknown;
  rotulo?: unknown;
  categoria?: unknown;
  tipoDado?: unknown;
  unidadePadrao?: unknown;
  valorExemplo?: unknown;
  descricao?: unknown;
}

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const campos = await listarCamposDinamicos();
    return NextResponse.json({ ok: true, data: campos });
  } catch (error) {
    console.error("Erro ao listar campos dinâmicos:", error);

    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os campos dinâmicos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/desenho-aprovacao/campos", handleGET);

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: CreateCampoBody;

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
    const chave = requiredText(body.chave, "chave", 100);

    if (!chavePattern.test(chave)) {
      throw new ValidationError(
        'O campo chave deve começar com uma letra e conter apenas letras e números (ex: "quantidadeAves").'
      );
    }

    const rotulo = requiredText(body.rotulo, "rotulo", 300);

    if (typeof body.categoria !== "string" || !CATEGORIAS_VALIDAS.includes(body.categoria)) {
      throw new ValidationError(`O campo categoria deve ser um dos valores: ${CATEGORIAS_VALIDAS.join(", ")}.`);
    }

    const categoria = body.categoria as CategoriaCampo;

    if (typeof body.tipoDado !== "string" || !TIPOS_DADO_VALIDOS.includes(body.tipoDado)) {
      throw new ValidationError(`O campo tipoDado deve ser um dos valores: ${TIPOS_DADO_VALIDOS.join(", ")}.`);
    }

    const tipoDado = body.tipoDado as TipoDadoCampo;

    const unidadePadrao = optionalText(body.unidadePadrao, "unidadePadrao", 30);
    const valorExemplo = optionalText(body.valorExemplo, "valorExemplo", 600);
    const descricao = optionalText(body.descricao, "descricao", 2000);

    const campo = await criarCampoDinamico(
      { chave, rotulo, categoria, tipoDado, unidadePadrao, valorExemplo, descricao },
      acesso.usuario.samAccountName
    );

    return NextResponse.json({ ok: true, message: "Campo dinâmico criado.", data: campo }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar campo dinâmico:", error);

    return NextResponse.json({ ok: false, message: "Não foi possível criar o campo dinâmico." }, { status: 500 });
  }
}

export const POST = comMetricasApi("admin/desenho-aprovacao/campos", handlePOST);
