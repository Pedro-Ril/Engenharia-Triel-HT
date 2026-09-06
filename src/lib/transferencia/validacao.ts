import { ValidationError } from "@/lib/auth/errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * Aceita vários e-mails separados por ";" (pedido explícito — enviar
 * o mesmo link pra mais de uma pessoa de uma vez). Devolve a lista já
 * validada; lança ValidationError citando o endereço exato que falhou,
 * pra não obrigar o usuário a adivinhar qual dos vários está errado.
 */
export function validarEParsearDestinatarios(valor: string): string[] {
  const emails = valor
    .split(";")
    .map((email) => email.trim())
    .filter(Boolean);

  if (emails.length === 0) {
    throw new ValidationError("Informe ao menos um e-mail de destinatário válido.");
  }

  for (const email of emails) {
    if (!EMAIL_PATTERN.test(email)) {
      throw new ValidationError(`"${email}" não é um e-mail válido.`);
    }
  }

  return emails;
}
