import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;

function getChaveCriptografia(): Buffer {
  const chaveBase64 = process.env.AD_CONFIG_ENCRYPTION_KEY;

  if (!chaveBase64) {
    throw new Error(
      "A variável de ambiente AD_CONFIG_ENCRYPTION_KEY não foi configurada."
    );
  }

  const chave = Buffer.from(chaveBase64, "base64");

  if (chave.length !== 32) {
    throw new Error(
      "AD_CONFIG_ENCRYPTION_KEY deve ser uma chave de 32 bytes (256 bits) codificada em base64."
    );
  }

  return chave;
}

/*
 * Layout do valor armazenado: [IV de 12 bytes][tag de
 * autenticação GCM de 16 bytes][texto cifrado]. Um IV novo
 * é gerado a cada chamada — nunca reaproveitar IV com a
 * mesma chave em AES-GCM.
 */
export function criptografarSegredo(textoPlano: string): Buffer {
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, getChaveCriptografia(), iv);

  const textoCifrado = Buffer.concat([
    cipher.update(textoPlano, "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), textoCifrado]);
}

export function descriptografarSegredo(valorArmazenado: Buffer): string {
  const iv = valorArmazenado.subarray(0, TAMANHO_IV);
  const tag = valorArmazenado.subarray(TAMANHO_IV, TAMANHO_IV + TAMANHO_TAG);
  const textoCifrado = valorArmazenado.subarray(TAMANHO_IV + TAMANHO_TAG);

  const decipher = createDecipheriv(ALGORITMO, getChaveCriptografia(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(textoCifrado),
    decipher.final(),
  ]).toString("utf8");
}
