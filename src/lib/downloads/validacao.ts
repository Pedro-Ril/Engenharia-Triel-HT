import { ValidationError } from "@/lib/auth/errors";

export const TAMANHO_MAXIMO_ARQUIVO_BYTES = 200 * 1024 * 1024;

export interface NovoArquivoDownload {
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  conteudo: Buffer;
}

/*
 * Formulário de download chega como multipart/form-data (não
 * JSON) para permitir o arquivo junto dos campos de texto —
 * mesmo padrão já usado pelos anexos de chamados.
 */
export async function parseArquivoFormData(
  formData: FormData,
  fieldName: string
): Promise<NovoArquivoDownload | null> {
  const arquivo = formData.get(fieldName);

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return null;
  }

  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_BYTES) {
    throw new ValidationError(
      `O arquivo excede o limite de ${TAMANHO_MAXIMO_ARQUIVO_BYTES / (1024 * 1024)} MB.`
    );
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());

  return {
    nomeArquivo: arquivo.name.slice(0, 260),
    tipoMime: arquivo.type || "application/octet-stream",
    tamanhoBytes: arquivo.size,
    conteudo: buffer,
  };
}

/* Instruções/funcionamento chegam como um campo de texto com um array JSON de strings. */
export function parseListaTextoFormData(formData: FormData, fieldName: string): string[] {
  const valor = formData.get(fieldName);

  if (typeof valor !== "string" || !valor.trim()) {
    return [];
  }

  try {
    const lista: unknown = JSON.parse(valor);

    if (!Array.isArray(lista) || !lista.every((item) => typeof item === "string")) {
      throw new ValidationError(`O campo ${fieldName} deve ser uma lista de textos.`);
    }

    return lista.map((item) => item.trim()).filter(Boolean);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`O campo ${fieldName} contém um valor inválido.`);
  }
}
