import { describe, expect, it } from "vitest";

import { ErroMultipart, lerMultipart } from "./multipart";

function requisicao(form: FormData): Request {
  return new Request("http://localhost/api/externo/impressao/pdf", { method: "POST", body: form });
}

describe("lerMultipart", () => {
  it("lê o arquivo e os campos", async () => {
    const form = new FormData();
    form.set("impressora", "EXPEDICAO");
    form.set("copias", "2");
    form.set("arquivo", new Blob([Buffer.from("%PDF-conteudo")], { type: "application/pdf" }), "Ordem ação.pdf");
    const r = await lerMultipart(requisicao(form), 1024);
    expect(r.campos).toEqual({ impressora: "EXPEDICAO", copias: "2" });
    expect(r.arquivo?.nome).toBe("Ordem ação.pdf");
    expect(r.arquivo?.dados.toString()).toBe("%PDF-conteudo");
  });

  it("para com 413 quando o arquivo passa do limite", async () => {
    const form = new FormData();
    form.set("arquivo", new Blob([Buffer.alloc(5000, 1)]), "grande.pdf");
    const erro = await lerMultipart(requisicao(form), 1024).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroMultipart);
    expect(erro.status).toBe(413);
  });

  it("recusa campo de arquivo com outro nome", async () => {
    const form = new FormData();
    form.set("documento", new Blob([Buffer.from("x")]), "a.pdf");
    const erro = await lerMultipart(requisicao(form), 1024).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroMultipart);
    expect(erro.status).toBe(400);
  });

  it("recusa mais de um arquivo", async () => {
    const form = new FormData();
    form.append("arquivo", new Blob([Buffer.from("a")]), "a.pdf");
    form.append("arquivo", new Blob([Buffer.from("b")]), "b.pdf");
    const erro = await lerMultipart(requisicao(form), 1024).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroMultipart);
    expect(erro.message).toContain("único arquivo");
  });

  it("recusa campo de texto longo demais", async () => {
    const form = new FormData();
    form.set("impressora", "X".repeat(2000));
    const erro = await lerMultipart(requisicao(form), 1024).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroMultipart);
  });
});
