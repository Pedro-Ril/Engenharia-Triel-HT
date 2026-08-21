import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";

import type { SalvarAtualizacaoParams, TipoAtualizacaoItem } from "./atualizacoes";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tiposValidos: TipoAtualizacaoItem[] = ["novo", "melhoria", "correcao"];

/*
 * Aceita "AAAA-MM-DDTHH:mm" (o que o formulário envia, data +
 * hora combinadas) e também com segundos, para robustez.
 */
export function requiredDataHoraIso(value: unknown, fieldName: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)
  ) {
    throw new ValidationError(
      `Informe o campo ${fieldName} no formato AAAA-MM-DDTHH:mm.`
    );
  }

  return value.length === 16 ? `${value}:00` : value;
}

export function requiredTagIds(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`O campo ${fieldName} deve ser uma lista.`);
  }

  return value.map((item) => {
    if (typeof item !== "string" || !uniqueIdentifierPattern.test(item)) {
      throw new ValidationError(`O campo ${fieldName} contém um valor inválido.`);
    }
    return item;
  });
}

export function requiredItens(
  value: unknown,
  fieldName: string
): { tipo: TipoAtualizacaoItem; texto: string }[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`Adicione ao menos um item em ${fieldName}.`);
  }

  return value.map((item) => {
    if (!isObject(item)) {
      throw new ValidationError(`O campo ${fieldName} contém um item inválido.`);
    }

    const tipo = requiredText(item.tipo, "tipo do item", 20);

    if (!tiposValidos.includes(tipo as TipoAtualizacaoItem)) {
      throw new ValidationError(
        'O tipo do item deve ser "novo", "melhoria" ou "correcao".'
      );
    }

    const texto = requiredText(item.texto, "texto do item", 500);

    return { tipo: tipo as TipoAtualizacaoItem, texto };
  });
}

export function parseCorpoAtualizacao(
  body: Record<string, unknown>
): SalvarAtualizacaoParams {
  return {
    versao: requiredText(body.versao, "versão", 30),
    titulo: requiredText(body.titulo, "título", 200),
    descricao: requiredText(body.descricao, "descrição", 4000),
    publicadoEm: requiredDataHoraIso(body.publicadoEm, "data de publicação"),
    publicado: requiredBoolean(body.publicado, "publicado"),
    ordem: requiredOrdem(body.ordem),
    tagIds: requiredTagIds(body.tagIds, "tags"),
    itens: requiredItens(body.itens, "itens"),
  };
}

function requiredBoolean(value: unknown, fieldName: string): boolean {
  if (value === undefined || value === null) return true;

  if (typeof value !== "boolean") {
    throw new ValidationError(`O campo ${fieldName} deve ser verdadeiro ou falso.`);
  }

  return value;
}

function requiredOrdem(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;

  const numero = Number(value);

  if (!Number.isFinite(numero) || !Number.isInteger(numero)) {
    throw new ValidationError("O campo ordem deve ser um número inteiro.");
  }

  return numero;
}
