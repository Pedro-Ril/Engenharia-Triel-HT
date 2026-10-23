import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  listarUltimasValidacoes,
  registrarValidacao,
} from "@/lib/validacao-xml-nfe/validacoes";
import type { SituacaoRegistro } from "@/modules/validacao-xml-nfe/types/validacaoXmlNfe.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO = "validacao-xml-nfe";

/* Um XML de NF-e tem dezenas de KB; 5 MB é folga de sobra. */
const LIMITE_XML = 5_000_000;
const SITUACOES: SituacaoRegistro[] = ["valido", "invalido", "falha"];

function lerApontamentos(valor: unknown): string[] {
  if (valor === undefined || valor === null) return [];

  if (!Array.isArray(valor)) {
    throw new ValidationError("Os apontamentos devem ser uma lista.");
  }

  return valor.slice(0, 100).map((item) => String(item ?? "").slice(0, 1000));
}

function lerContagem(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isInteger(numero) && numero >= 0 ? numero : 0;
}

/* Lista compartilhada: quem tem acesso ao módulo vê as validações de todos. */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi(MODULO);
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarUltimasValidacoes() });
  } catch (error) {
    console.error("Erro ao listar validações de XML de NF-e:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as últimas validações." },
      { status: 500 }
    );
  }
}

/*
 * Grava o resultado que o navegador concluiu. O XML vai junto e é o que
 * vale: dá para baixar e conferir de novo a qualquer momento.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi(MODULO);
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json().catch(() => null);

    if (!isObject(corpo)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const xml = typeof corpo.xml === "string" ? corpo.xml : "";

    if (!xml.trim()) {
      throw new ValidationError("Informe o XML validado.");
    }

    if (xml.length > LIMITE_XML) {
      throw new ValidationError("O XML passa do limite de 5 MB.");
    }

    const situacao = corpo.situacao as SituacaoRegistro;

    if (!SITUACOES.includes(situacao)) {
      throw new ValidationError("Situação da validação inválida.");
    }

    const registro = await registrarValidacao({
      usuarioId: acesso.usuario.id,
      usuarioNome: acesso.usuario.nomeExibicao,
      arquivo: requiredText(corpo.arquivo, "arquivo", 260),
      numeroNota: optionalText(corpo.numeroNota, "número da nota", 20),
      serie: optionalText(corpo.serie, "série", 10),
      chaveAcesso: optionalText(corpo.chaveAcesso, "chave de acesso", 44),
      destinatario: optionalText(
        typeof corpo.destinatario === "string" ? corpo.destinatario.slice(0, 200) : corpo.destinatario,
        "destinatário",
        200
      ),
      situacao,
      qtdErros: lerContagem(corpo.qtdErros),
      qtdAvisos: lerContagem(corpo.qtdAvisos),
      apontamentos: lerApontamentos(corpo.apontamentos),
      xml,
    });

    return NextResponse.json({ ok: true, data: registro });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao registrar validação de XML de NF-e:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar a validação." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("validacao-xml-nfe/validacoes", handleGET);
export const POST = comMetricasApi("validacao-xml-nfe/validacoes", handlePOST);
