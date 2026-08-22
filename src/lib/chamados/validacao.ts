import { ValidationError } from "@/lib/auth/errors";

import {
  MAXIMO_ANEXOS_POR_MENSAGEM,
  TAMANHO_MAXIMO_ANEXO_BYTES,
  type NovoAnexo,
  type PrioridadeChamado,
} from "./chamados";

const prioridadesValidas: PrioridadeChamado[] = ["baixa", "media", "alta", "urgente"];

export function requiredPrioridade(value: unknown): PrioridadeChamado {
  if (
    typeof value !== "string" ||
    !prioridadesValidas.includes(value as PrioridadeChamado)
  ) {
    throw new ValidationError(
      'O campo prioridade deve ser "baixa", "media", "alta" ou "urgente".'
    );
  }

  return value as PrioridadeChamado;
}

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function optionalUuid(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !uniqueIdentifierPattern.test(value)) {
    throw new ValidationError(`O campo ${fieldName} contém um valor inválido.`);
  }

  return value;
}

/*
 * Formulários de chamado chegam como multipart/form-data (não
 * JSON) para permitir anexos junto dos campos de texto — sem
 * precisar de nenhuma lib de upload nova, `request.formData()`
 * já resolve isso nativamente no Route Handler.
 */
export async function parseAnexosFormData(
  formData: FormData,
  fieldName: string
): Promise<NovoAnexo[]> {
  const arquivos = formData.getAll(fieldName).filter((item): item is File => item instanceof File && item.size > 0);

  if (arquivos.length > MAXIMO_ANEXOS_POR_MENSAGEM) {
    throw new ValidationError(
      `Envie no máximo ${MAXIMO_ANEXOS_POR_MENSAGEM} arquivos por vez.`
    );
  }

  const anexos: NovoAnexo[] = [];

  for (const arquivo of arquivos) {
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO_BYTES) {
      throw new ValidationError(
        `O arquivo "${arquivo.name}" excede o limite de ${TAMANHO_MAXIMO_ANEXO_BYTES / (1024 * 1024)} MB.`
      );
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());

    anexos.push({
      nomeArquivo: arquivo.name.slice(0, 260),
      tipoMime: arquivo.type || "application/octet-stream",
      tamanhoBytes: arquivo.size,
      conteudo: buffer,
    });
  }

  return anexos;
}
