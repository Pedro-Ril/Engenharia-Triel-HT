import "server-only";

import { ValidationError } from "@/lib/auth/errors";

const LIMITE_MB = 10;

/*
 * A planilha do projeto enviada como multipart (campo "planilha"). O
 * `form` volta junto para quem precisa de outros campos (ex.: os marcados).
 */
export async function lerPlanilhaEnviada(request: Request): Promise<{ conteudo: Buffer; nome: string; form: FormData }> {
  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("planilha");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    throw new ValidationError("Envie a planilha do projeto (.xls ou .xlsx).");
  }
  if (!/\.xlsx?$/i.test(arquivo.name)) {
    throw new ValidationError("A planilha precisa ser .xls ou .xlsx.");
  }
  if (arquivo.size > LIMITE_MB * 1024 * 1024) {
    throw new ValidationError(`A planilha passa de ${LIMITE_MB} MB.`);
  }
  return { conteudo: Buffer.from(await arquivo.arrayBuffer()), nome: arquivo.name, form: form! };
}
