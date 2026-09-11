import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, optionalText } from "@/lib/auth/validation";
import {
  buscarConfigErpEstoqueUsados,
  salvarConfigErpEstoqueUsados,
} from "@/lib/estoque-equipamentos-usados/erp-integracao";
import {
  CHAVE_MASCARA_NUMERO_SEQUENCIAL,
  OPCOES_CAMPO_MASCARA_NF,
} from "@/modules/estoque-equipamentos-usados/constants";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const urlPattern = /^https?:\/\//i;

function validarUrl(valor: string | null, campo: string): string | null {
  if (!valor) return null;
  if (!urlPattern.test(valor)) {
    throw new ValidationError(`${campo} deve começar com http:// ou https://.`);
  }
  return valor.replace(/\/+$/, "");
}

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await buscarConfigErpEstoqueUsados();
    return NextResponse.json({ ok: true, data: config });
  } catch (error) {
    console.error("Erro ao buscar configuração do ERP de estoque de equipamentos usados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a configuração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/estoque-equipamentos-usados/config", handleGET);

interface ConfigBody {
  urlValidarItem?: unknown;
  urlValidarItemTeste?: unknown;
  urlClientes?: unknown;
  urlClientesTeste?: unknown;
  usarAmbienteTeste?: unknown;
  chaveApi?: unknown;
  urlNfEntrada?: unknown;
  urlNfEntradaTeste?: unknown;
  urlNfSaida?: unknown;
  urlNfSaidaTeste?: unknown;
  intervaloVerificacaoNfMinutos?: unknown;
  campoMascaraChave?: unknown;
}

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  let body: ConfigBody;

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
    const urlValidarItem = validarUrl(
      optionalText(body.urlValidarItem, "URL de validação de item", 300),
      "A URL de validação de item"
    );
    const urlValidarItemTeste = validarUrl(
      optionalText(body.urlValidarItemTeste, "URL de validação de item (teste)", 300),
      "A URL de validação de item (teste)"
    );
    const urlClientes = validarUrl(
      optionalText(body.urlClientes, "URL de clientes", 300),
      "A URL de clientes"
    );
    const urlClientesTeste = validarUrl(
      optionalText(body.urlClientesTeste, "URL de clientes (teste)", 300),
      "A URL de clientes (teste)"
    );
    const chaveApi = optionalText(body.chaveApi, "chave de API", 200);
    const urlNfEntrada = validarUrl(
      optionalText(body.urlNfEntrada, "URL de NF de entrada", 300),
      "A URL de NF de entrada"
    );
    const urlNfEntradaTeste = validarUrl(
      optionalText(body.urlNfEntradaTeste, "URL de NF de entrada (teste)", 300),
      "A URL de NF de entrada (teste)"
    );
    const urlNfSaida = validarUrl(
      optionalText(body.urlNfSaida, "URL de NF de saída", 300),
      "A URL de NF de saída"
    );
    const urlNfSaidaTeste = validarUrl(
      optionalText(body.urlNfSaidaTeste, "URL de NF de saída (teste)", 300),
      "A URL de NF de saída (teste)"
    );
    const intervaloVerificacaoNfMinutos =
      optionalInteger(body.intervaloVerificacaoNfMinutos, "intervalo de verificação de NF", 0) || null;

    if (intervaloVerificacaoNfMinutos !== null && intervaloVerificacaoNfMinutos < 0) {
      throw new ValidationError("O intervalo de verificação de NF não pode ser negativo.");
    }

    const campoMascaraChave = optionalText(body.campoMascaraChave, "campo mapeado como mascara", 50);
    if (campoMascaraChave && !OPCOES_CAMPO_MASCARA_NF.some((opcao) => opcao.chave === campoMascaraChave)) {
      throw new ValidationError("Campo mapeado como mascara inválido.");
    }

    if (typeof body.usarAmbienteTeste !== "boolean") {
      throw new ValidationError("O campo usarAmbienteTeste deve ser verdadeiro ou falso.");
    }

    const config = await salvarConfigErpEstoqueUsados({
      urlValidarItem,
      urlValidarItemTeste,
      urlClientes,
      urlClientesTeste,
      usarAmbienteTeste: body.usarAmbienteTeste,
      chaveApi,
      urlNfEntrada,
      urlNfEntradaTeste,
      urlNfSaida,
      urlNfSaidaTeste,
      intervaloVerificacaoNfMinutos,
      campoMascaraChave: campoMascaraChave || CHAVE_MASCARA_NUMERO_SEQUENCIAL,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao salvar configuração do ERP de estoque de equipamentos usados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar a configuração." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/estoque-equipamentos-usados/config", handlePATCH);
