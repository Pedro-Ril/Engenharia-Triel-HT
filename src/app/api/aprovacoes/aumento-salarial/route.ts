import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import {
  criarSolicitacaoAumentoSalarial,
  type ItemCriarSolicitacaoParams,
} from "@/lib/aprovacoes/aprovacoes";
import { buscarEscopoUsuario, validarEscopoOuFalhar } from "@/lib/aprovacoes/escopo-colaboradores";
import { notificarDirecaoNovaSolicitacao } from "@/lib/aprovacoes/notificacoes-email";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "aprovacoes-solicitar-aumento";

function requiredNumber(value: unknown, fieldName: string): number {
  const numero = typeof value === "number" ? value : Number(value);

  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) {
    throw new ValidationError(`Informe o campo ${fieldName}.`);
  }

  if (!Number.isFinite(numero)) {
    throw new ValidationError(`O campo ${fieldName} deve ser um número válido.`);
  }

  return numero;
}

function parseItem(valor: unknown, indice: number): ItemCriarSolicitacaoParams {
  if (!isObject(valor)) {
    throw new ValidationError(`O colaborador na posição ${indice + 1} está com formato inválido.`);
  }

  return {
    funcionarioCodigo: requiredText(valor.funcionarioCodigo, `colaborador (posição ${indice + 1})`, 30),
    funcionarioNome: requiredText(valor.funcionarioNome, `nome do colaborador (posição ${indice + 1})`, 200),
    funcionarioCpf: optionalText(valor.funcionarioCpf, "CPF", 14),
    departamento: optionalText(valor.departamento, "departamento", 200),
    setor: optionalText(valor.setor, "setor", 200),
    salarioAtual: requiredNumber(valor.salarioAtual, "salário atual"),
    valorReajuste: requiredNumber(valor.valorReajuste, "valor do reajuste"),
    percentualReajuste: requiredNumber(valor.percentualReajuste, "percentual do reajuste"),
    observacao: optionalText(valor.observacao, "observação do colaborador", 2000),
  };
}

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    if (!Array.isArray(body.itens) || body.itens.length === 0) {
      throw new ValidationError("Adicione ao menos um colaborador à solicitação.");
    }

    const params = {
      observacao: optionalText(body.observacao, "observação", 2000),
      itens: body.itens.map(parseItem),
    };

    const escopo = await buscarEscopoUsuario(usuario.id);
    for (const item of params.itens) {
      validarEscopoOuFalhar(
        { codigo: item.funcionarioCodigo, departamento: item.departamento, setor: item.setor, nome: item.funcionarioNome },
        escopo
      );
    }

    const lote = await criarSolicitacaoAumentoSalarial(params, usuario);

    await registrarLog({
      nivel: "info",
      origem: "aprovacoes/aumento-salarial",
      mensagem: `${usuario.nomeExibicao} criou a solicitação #${lote.numero} de reajuste salarial para ${lote.itens.length} colaborador(es).`,
      detalhes: JSON.stringify({ aprovacaoId: lote.id, numero: lote.numero, ...params }),
      metodo: "POST",
      caminho: "/api/aprovacoes/aumento-salarial",
      ipOrigem: extrairIpOrigem(request),
    });

    const origem = new URL(request.url).origin;
    await notificarDirecaoNovaSolicitacao(lote, origem);

    return NextResponse.json(
      { ok: true, message: "Solicitação enviada para aprovação.", data: lote },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao criar solicitação de reajuste salarial:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível criar a solicitação." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("aprovacoes/aumento-salarial", handlePOST);
