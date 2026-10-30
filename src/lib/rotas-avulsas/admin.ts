import "server-only";

import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalText, requiredText } from "@/lib/auth/validation";

import { buscarRotaCatalogo, type RotaAvulsaCatalogo } from "./catalogo";
import { FAIXAS_CONFIG_IMPRESSAO, type ConfigImpressao } from "./impressao/config";
import type { DadosImpressora } from "./impressao/impressao";
import { normalizarImpressaoDigital } from "./impressao/ipp";
import type { EscopoToken } from "./rotas-avulsas";

/* Validações e respostas comuns das rotas de administração das rotas avulsas. */

export function rotaDoCatalogo(chave: string): RotaAvulsaCatalogo {
  const rota = buscarRotaCatalogo(chave);
  if (!rota) throw new ValidationError("Rota avulsa desconhecida.");
  return rota;
}

export function inteiroEntre(valor: unknown, campo: string, min: number, max: number): number {
  const numero = typeof valor === "string" && valor.trim() ? Number(valor) : valor;
  if (typeof numero !== "number" || !Number.isInteger(numero) || numero < min || numero > max) {
    throw new ValidationError(`O campo ${campo} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return numero;
}

export async function lerCorpoJson(request: Request): Promise<Record<string, unknown>> {
  const corpo: unknown = await request.json().catch(() => null);
  if (!isObject(corpo)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
  return corpo;
}

/* Configuração específica de cada rota (a coluna `config`). */
export function validarConfigEspecifica(chave: string, valor: unknown): Record<string, unknown> {
  if (chave === "impressao-pdf") {
    if (!isObject(valor)) throw new ValidationError("Informe a configuração da impressão.");
    const config: ConfigImpressao = {
      tamanhoMaxMb: inteiroEntre(valor.tamanhoMaxMb, "tamanho máximo (MB)", FAIXAS_CONFIG_IMPRESSAO.tamanhoMaxMb.min, FAIXAS_CONFIG_IMPRESSAO.tamanhoMaxMb.max),
      paginasMax: inteiroEntre(valor.paginasMax, "máximo de páginas", FAIXAS_CONFIG_IMPRESSAO.paginasMax.min, FAIXAS_CONFIG_IMPRESSAO.paginasMax.max),
      copiasMax: inteiroEntre(valor.copiasMax, "máximo de cópias", FAIXAS_CONFIG_IMPRESSAO.copiasMax.min, FAIXAS_CONFIG_IMPRESSAO.copiasMax.max),
    };
    return { ...config };
  }
  return isObject(valor) ? valor : {};
}

const FORMATO_CODIGO_IMPRESSORA = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;

export function normalizarCodigoImpressora(valor: unknown, campo = "código"): string {
  const codigo = requiredText(valor, campo, 40).toUpperCase();
  if (!FORMATO_CODIGO_IMPRESSORA.test(codigo)) {
    throw new ValidationError("O código da impressora aceita só letras, números, hífen e sublinhado (ex: EXPEDICAO).");
  }
  return codigo;
}

/* Escopo do token: para a impressão, a lista de impressoras liberadas (vazia = todas). */
export function validarEscopoToken(chave: string, valor: unknown): EscopoToken {
  if (chave !== "impressao-pdf" || valor === undefined || valor === null) return {};
  if (!isObject(valor)) throw new ValidationError("Escopo do token inválido.");
  const lista = valor.impressoras ?? [];
  if (!Array.isArray(lista)) throw new ValidationError("A lista de impressoras do token é inválida.");
  const codigos = [...new Set(lista.map((c) => normalizarCodigoImpressora(c, "impressora")))];
  if (codigos.length > 50) throw new ValidationError("Impressoras demais no token.");
  return codigos.length ? { impressoras: codigos } : {};
}

/* Data AAAA-MM-DD; o "até o fim do dia" é montado no SQL Server (ver FIM_DO_DIA em rotas-avulsas.ts). */
export function lerExpiracao(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const partes = typeof valor === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor) : null;
  const data = partes ? new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])) : null;
  if (!partes || !data || data.getDate() !== Number(partes[3]) || data.getMonth() !== Number(partes[2]) - 1) {
    throw new ValidationError("A validade deve ser uma data válida (AAAA-MM-DD).");
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (data <= hoje) throw new ValidationError("A validade precisa ser uma data futura.");
  return valor as string;
}

const FORMATO_ENDERECO = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}))*)$/;

export function validarEndereco(valor: unknown): string {
  const endereco = requiredText(valor, "endereço", 255);
  if (!FORMATO_ENDERECO.test(endereco)) {
    throw new ValidationError("Informe só o IP ou o nome da impressora (ex: 192.168.1.158), sem http:// nem porta.");
  }
  return endereco;
}

export function validarDadosImpressora(corpo: Record<string, unknown>): DadosImpressora {
  const usarTls = optionalBoolean(corpo.usarTls, "usar TLS", true);
  const certificado = optionalText(corpo.certificadoSha256, "certificado", 100);
  const certificadoNormalizado = certificado ? normalizarImpressaoDigital(certificado) : null;

  if (certificadoNormalizado && certificadoNormalizado.length !== 64) {
    throw new ValidationError("A impressão digital do certificado deve ter 64 dígitos hexadecimais (SHA-256).");
  }
  if (usarTls && !certificadoNormalizado) {
    throw new ValidationError("Com TLS ligado, leia e fixe o certificado da impressora antes de salvar.");
  }

  const caminhoIpp = optionalText(corpo.caminhoIpp, "caminho IPP", 100) ?? "/ipp/print";
  if (!/^\/[A-Za-z0-9/_.-]*$/.test(caminhoIpp)) {
    throw new ValidationError("O caminho IPP deve começar com / (ex: /ipp/print).");
  }

  return {
    codigo: normalizarCodigoImpressora(corpo.codigo),
    nome: requiredText(corpo.nome, "nome", 120),
    endereco: validarEndereco(corpo.endereco),
    porta: inteiroEntre(corpo.porta ?? 631, "porta", 1, 65535),
    caminhoIpp,
    usarTls,
    /* Guardado no formato do Node (AA:BB:...), o mesmo que aparece na tela. */
    certificadoSha256: certificadoNormalizado ? certificadoNormalizado.match(/.{2}/g)!.join(":") : null,
    frenteVersoPadrao: optionalBoolean(corpo.frenteVersoPadrao, "frente e verso", false),
    ativo: optionalBoolean(corpo.ativo, "ativa", true),
  };
}

/* ValidationError -> 400; o resto vira 500 com mensagem genérica (e console.error). */
export function respostaDeErro(erro: unknown, contexto: string, mensagem: string): NextResponse {
  if (erro instanceof ValidationError) {
    return NextResponse.json({ ok: false, message: erro.message }, { status: 400 });
  }
  console.error(`Erro ao ${contexto}:`, erro);
  return NextResponse.json({ ok: false, message: mensagem }, { status: 500 });
}
