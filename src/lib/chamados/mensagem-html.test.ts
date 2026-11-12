import { describe, expect, it } from "vitest";

import {
  htmlMensagemParaEmail,
  htmlParaTexto,
  lerMensagemFormData,
  limparHtmlMensagem,
} from "./mensagem-html";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function png(nome = "image.png", bytes = 10): File {
  return new File([new Uint8Array(bytes)], nome, { type: "image/png" });
}

describe("limparHtmlMensagem", () => {
  it("tira script, eventos, estilos e links javascript", () => {
    const sujo =
      '<p onclick="x()" style="color:red">Oi<script>alert(1)</script></p>' +
      '<a href="javascript:alert(1)">a</a><a href="https://site.com">b</a>' +
      '<iframe src="https://x"></iframe><style>p{}</style><svg onload="x()"></svg>';
    const limpo = limparHtmlMensagem(sujo);

    expect(limpo).not.toMatch(/script|onclick|style|javascript|iframe|svg|onload/i);
    expect(limpo).toContain("<p>Oi</p>");
    expect(limpo).toContain('<a href="https://site.com" target="_blank" rel="noopener noreferrer">b</a>');
  });

  it("na leitura só mantém imagem que aponta para anexo de chamado", () => {
    const html =
      `<img src="/api/chamados/anexos/${ID}">` +
      '<img src="https://externo.com/x.png"><img src="data:image/png;base64,AAAA">' +
      '<img src="/api/chamados/anexos/nao-e-uuid"><img src="x" onerror="alert(1)">';

    expect(limparHtmlMensagem(html)).toBe(`<img src="/api/chamados/anexos/${ID}" alt="Imagem colada" />`);
  });

  it("mantém tabela com colspan válido e descarta o resto dos atributos", () => {
    const html =
      '<table style="min-width:75px"><colgroup><col style="min-width:25px"></colgroup><tbody>' +
      '<tr><th colspan="1" rowspan="1"><p>Item</p></th><th colspan="2"><p>Qtd</p></th></tr>' +
      '<tr><td colspan="abc" class="x"><p>79376</p></td><td rowspan="999">20</td></tr></tbody></table>';

    expect(limparHtmlMensagem(html)).toBe(
      "<table><tbody><tr><th><p>Item</p></th><th colspan=\"2\"><p>Qtd</p></th></tr>" +
        "<tr><td><p>79376</p></td><td>20</td></tr></tbody></table>"
    );
  });

  it("da célula, só sobra o alinhamento", () => {
    const html =
      '<table><tbody><tr><td style="background: url(javascript:alert(1)); text-align: RIGHT; color: red">20</td>' +
      '<td style="text-align: expression(alert(1))">x</td><td style="text-align:center">y</td></tr></tbody></table>';

    expect(limparHtmlMensagem(html)).toBe(
      '<table><tbody><tr><td style="text-align:right">20</td><td>x</td><td style="text-align:center">y</td></tr></tbody></table>'
    );
  });
});

describe("htmlParaTexto", () => {
  it("vira linhas, com as células separadas por tabulação", () => {
    const html =
      "<p>Segue a lista &amp; os valores:</p><table><tbody>" +
      "<tr><th><p>Item</p></th><th><p>Qtd</p></th></tr>" +
      "<tr><td><p>79376</p></td><td><p>20</p></td></tr></tbody></table>" +
      `<p><img src="/api/chamados/anexos/${ID}" alt="Imagem colada" /></p><p>Obrigado</p>`;

    expect(htmlParaTexto(html)).toBe("Segue a lista & os valores:\nItem\tQtd\n79376\t20\n\nObrigado");
  });
});

describe("htmlMensagemParaEmail", () => {
  it("põe estilo inline na tabela e troca a imagem por um aviso", () => {
    const email = htmlMensagemParaEmail(
      `<table><tbody><tr><th colspan="2"><p>A</p></th></tr><tr><td style="text-align:right"><p>1</p></td></tr></tbody></table><p><img src="/api/chamados/anexos/${ID}" alt="Imagem colada" /></p>`
    );

    expect(email).toMatch(/<table cellpadding="0" cellspacing="0" style="border-collapse/);
    expect(email).toMatch(/<th colspan="2" style="border: 1px solid[^"]*font-weight: 700;">A<\/th>/);
    expect(email).toMatch(/<td style="border: 1px solid[^"]*text-align: left;[^"]* text-align:right;">1<\/td>/);
    expect(email).toContain("[imagem: veja nos anexos]");
    expect(email).not.toContain("<img");
  });
});

describe("lerMensagemFormData", () => {
  it("sem formato=html continua texto puro", async () => {
    const form = new FormData();
    form.append("texto", "  linha 1\n<b>não é tag</b>  ");

    expect(await lerMensagemFormData(form, "texto", "mensagem")).toEqual({
      texto: "linha 1\n<b>não é tag</b>",
      formato: "texto",
      imagens: [],
    });
  });

  it("troca o marcador pelo anexo e só grava as imagens usadas no texto", async () => {
    const form = new FormData();
    form.append("formato", "html");
    form.append(
      "texto",
      '<p>Erro:</p><img src="imagem-colada:1"><img src="imagem-colada:1"><img src="imagem-colada:7">'
    );
    form.append("imagensColadas", png("a.png"));
    form.append("imagensColadas", png("b.png", 20));

    const lida = await lerMensagemFormData(form, "texto", "mensagem");

    expect(lida.formato).toBe("html");
    expect(lida.imagens).toHaveLength(1);
    expect(lida.imagens[0]).toMatchObject({ nomeArquivo: "imagem-colada-1.png", tipoMime: "image/png", tamanhoBytes: 20 });
    const src = `/api/chamados/anexos/${lida.imagens[0].id}`;
    expect(lida.texto).toBe(`<p>Erro:</p><img src="${src}" alt="Imagem colada" /><img src="${src}" alt="Imagem colada" />`);
  });

  it("só imagem, sem texto, vale como mensagem", async () => {
    const form = new FormData();
    form.append("formato", "html");
    form.append("texto", '<p><img src="imagem-colada:0"></p>');
    form.append("imagensColadas", png());

    const lida = await lerMensagemFormData(form, "texto", "mensagem");
    expect(lida.imagens).toHaveLength(1);
  });

  it("recusa vazio, texto longo demais e imagem que não é imagem", async () => {
    const vazio = new FormData();
    vazio.append("formato", "html");
    vazio.append("texto", "<p></p><p>  </p>");
    await expect(lerMensagemFormData(vazio, "texto", "mensagem")).rejects.toThrow("Informe o campo mensagem.");

    const longo = new FormData();
    longo.append("formato", "html");
    longo.append("texto", `<p>${"a".repeat(4001)}</p>`);
    await expect(lerMensagemFormData(longo, "texto", "mensagem")).rejects.toThrow("no máximo 4000");

    const svg = new FormData();
    svg.append("formato", "html");
    svg.append("texto", '<p>x</p><img src="imagem-colada:0">');
    svg.append("imagensColadas", new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    await expect(lerMensagemFormData(svg, "texto", "mensagem")).rejects.toThrow("PNG, JPG, GIF ou WEBP");
  });
});
