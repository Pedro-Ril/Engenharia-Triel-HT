import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, optionalText } from "@/lib/auth/validation";
import {
  buscarConfigEngenhariaVersatil,
  salvarConfigEngenhariaVersatil,
} from "@/lib/engenharia-versatil/separacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await buscarConfigEngenhariaVersatil() });
  } catch (error) {
    console.error("Erro ao buscar configuração da Engenharia Versátil:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível buscar a configuração." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/engenharia-versatil/config", handleGET);

/* Lista de nomes de aba: array de texto, um por item; vazios e repetidos saem. */
function listaDeAbas(valor: unknown, campo: string): string[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || valor.some((v) => typeof v !== "string")) {
    throw new ValidationError(`O campo ${campo} deve ser uma lista de nomes de aba.`);
  }
  const nomes = [...new Set(valor.map((v: string) => v.trim()).filter(Boolean))];
  if (nomes.some((n) => n.length > 100)) throw new ValidationError(`Há nome de aba muito longo em ${campo}.`);
  if (nomes.join("\n").length > 2000) throw new ValidationError(`A lista ${campo} passou do tamanho permitido.`);
  return nomes;
}

async function handlePATCH(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json().catch(() => null);
    if (!isObject(corpo)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    const erpApiUrl = optionalText(corpo.erpApiUrl, "API do ERP", 300);
    if (erpApiUrl && !/^https?:\/\/[^\s]+$/i.test(erpApiUrl)) {
      throw new ValidationError("A API do ERP deve ser um endereço http(s), ex.: http://proserver.trielht.com.br:1000");
    }
    const erpCodEmpresa = optionalInteger(corpo.erpCodEmpresa, "Empresa do ERP", 0) || null;
    if (corpo.erpAmbiente !== "teste" && corpo.erpAmbiente !== "producao") {
      throw new ValidationError("Escolha o ambiente do ERP: teste ou produção.");
    }

    const config = await salvarConfigEngenhariaVersatil({
      pastaProjetos: optionalText(corpo.pastaProjetos, "Pasta dos projetos", 300),
      pastaPdf: optionalText(corpo.pastaPdf, "Pasta de PDF", 300),
      pastaDxf: optionalText(corpo.pastaDxf, "Pasta de DXF", 300),
      abasBlacklist: listaDeAbas(corpo.abasBlacklist, "Abas ignoradas"),
      abasComDxf: listaDeAbas(corpo.abasComDxf, "Abas com DXF"),
      abasFator: listaDeAbas(corpo.abasFator, "Abas do fator de conversão"),
      erpApiUrl: erpApiUrl ? erpApiUrl.replace(/\/+$/, "") : null,
      erpCodEmpresa,
      erpAmbiente: corpo.erpAmbiente,
      atualizadoPor: acesso.usuario.samAccountName,
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao salvar configuração da Engenharia Versátil:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível salvar a configuração." }, { status: 500 });
  }
}

export const PATCH = comMetricasApi("admin/engenharia-versatil/config", handlePATCH);
