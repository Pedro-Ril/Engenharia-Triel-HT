import { ValidationError } from "./errors";

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredText(
  value: unknown,
  fieldName: string,
  maxLength: number
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`Informe o campo ${fieldName}.`);
  }

  const texto = value.trim();

  if (texto.length > maxLength) {
    throw new ValidationError(
      `O campo ${fieldName} deve possuir no máximo ${maxLength} caracteres.`
    );
  }

  return texto;
}

export function optionalText(
  value: unknown,
  fieldName: string,
  maxLength: number
): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requiredText(value, fieldName, maxLength);
}

export function optionalBoolean(
  value: unknown,
  fieldName: string,
  defaultValue: boolean
): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new ValidationError(`O campo ${fieldName} deve ser verdadeiro ou falso.`);
  }

  return value;
}

export function optionalInteger(
  value: unknown,
  fieldName: string,
  defaultValue: number
): number {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const numero = Number(value);

  if (!Number.isFinite(numero) || !Number.isInteger(numero)) {
    throw new ValidationError(`O campo ${fieldName} deve ser um número inteiro.`);
  }

  return numero;
}

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requiredUuidArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`Selecione ao menos um valor para ${fieldName}.`);
  }

  return value.map((item) => {
    if (typeof item !== "string" || !uniqueIdentifierPattern.test(item)) {
      throw new ValidationError(`O campo ${fieldName} contém um valor inválido.`);
    }

    return item;
  });
}

const chavePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function requiredChave(value: unknown, fieldName: string): string {
  const texto = requiredText(value, fieldName, 60).toLowerCase();

  if (!chavePattern.test(texto)) {
    throw new ValidationError(
      `O campo ${fieldName} deve conter apenas letras minúsculas, números e hífen (ex: "meu-modulo").`
    );
  }

  return texto;
}
