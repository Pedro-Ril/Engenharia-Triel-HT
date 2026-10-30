import { describe, expect, it } from "vitest";

import {
  ErroIpp,
  consultarImpressoraIpp,
  imprimirPdf,
  lerCertificado,
  statusOk,
  type DestinoIpp,
} from "./ipp";

/*
 * Contra uma impressora de verdade, SÓ LEITURA: lê o certificado, o estado
 * (Get-Printer-Attributes) e valida um trabalho (Validate-Job, que nunca
 * imprime). Só roda com IMPRESSORA_TESTE_IP definido, ex.:
 *   IMPRESSORA_TESTE_IP=192.168.1.158 npm run test:integracao -- ipp
 */
const ip = process.env.IMPRESSORA_TESTE_IP;

describe.skipIf(!ip)("IPP ao vivo (sem imprimir)", () => {
  const base = { endereco: ip ?? "", porta: 631, caminho: "/ipp/print" };

  it("fala IPPS com o certificado fixado e valida um PDF sem imprimir", async () => {
    const cert = await lerCertificado(base.endereco, base.porta);
    const destino: DestinoIpp = { ...base, usarTls: true, certificadoSha256: cert.sha256 };

    const atributos = (await consultarImpressoraIpp(destino)).atributos;
    expect(atributos["document-format-supported"]).toContain("application/pdf");

    const validacao = await imprimirPdf(destino, {
      pdf: Buffer.alloc(0),
      usuario: "Teste automatizado",
      nomeTrabalho: "Validação",
      copias: 1,
      frenteVerso: true,
      validarSomente: true,
    });
    expect(statusOk(validacao.status)).toBe(true);
  });

  it("recusa conectar se o certificado não bate (nada é enviado)", async () => {
    const destino: DestinoIpp = { ...base, usarTls: true, certificadoSha256: "00".repeat(32) };
    const erro = await consultarImpressoraIpp(destino).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroIpp);
    expect(erro.codigo).toBe("certificado");
  });
});
