import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigPedidosCompra } from "./pedidos-compra-admin";

/* Rede e banco trocados por mocks: só a lógica da consulta é testada. */
const fetchMonitorado = vi.fn();
const buscarConfigPedidosCompra = vi.fn();

vi.mock("@/lib/monitoramento/integracao-externa", () => ({
  fetchMonitorado: (...args: unknown[]) => fetchMonitorado(...args),
}));

vi.mock("./pedidos-compra-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pedidos-compra-admin")>()),
  buscarConfigPedidosCompra: () => buscarConfigPedidosCompra(),
}));

const { consultarPedidoCompraErp, ErroConsultaErp, normalizarPedidoErp } = await import("./pedido-compra-erp");

/* Recorte do JSON real do pedido 2/104718 (API do ERP, 26/10/2026). */
const PEDIDO_REAL = {
  numero: 104718,
  empresa: { codigo: 2, razaoSocial: "TRIEL-HT INDUSTRIAL E PARTICIPACOES S/A MATRIZ" },
  dataEmissao: "21/10/2026",
  situacao: "PENDENTE",
  tipo: { codigo: "OCL", descricao: "Ordem de Compra Liberada" },
  fornecedor: { codigo: 79644, nome: "INGA VEICULOS LTDA", cnpj: "01994951001834", cpf: null },
  contato: "EMERSON/NERI",
  comprador: { codigo: "6587", nome: "CRISLEY ANE FERREIRA" },
  moeda: null,
  frete: { tipo: { codigo: "F", descricao: "Fob-Contrat." }, tipoValor: null, valor: null, transportadora: null },
  pagamento: {
    quantidadeParcelas: 1,
    parcelas: [{ parcela: 1, dias: 30, vencimento: null, percentual: 100, percentualInformado: false, valorEstimado: 2070.03 }],
  },
  valores: { bruto: 2070.03, descontos: 0, acrescimos: 0, liquido: 2070.03, liquidoComIpi: 2070.03, frete: null, total: 2070.03 },
  impostos: { ipi: 12.5, icms: 30, icmsSt: null },
  observacao: null,
  itens: [
    {
      sequencia: 1,
      item: { codigo: "58555", descricao: "SERVICO X", descricaoNoPedido: "SERVICO DE HABILITACAO", mascara: null },
      unidade: "UN",
      situacao: "PENDENTE",
      quantidades: { pedida: 1, atendida: 0, cancelada: 0, saldo: 1 },
      precoUnitario: 0.1,
      percentualIpi: 0,
      valores: { total: 0.1 },
      datas: { entrega: "21/10/2026" },
      centroCusto: { codigo: 9090582, descricao: "ABTS - MARICA OF 2972" },
      observacao: null,
    },
  ],
};

function config(parcial: Partial<ConfigPedidosCompra> = {}): ConfigPedidosCompra {
  return {
    urlPedido: "http://erp:1000/api/pedido-compra",
    urlPedidoTeste: "http://erp:1000/api/pedido-compra?ambiente=teste",
    usarAmbienteTeste: false,
    chaveApiErp: null,
    chaveExternaConfigurada: false,
    chaveExternaFinal: null,
    chaveExternaGeradaEm: null,
    chaveExternaGeradaPor: null,
    atualizadoEm: null,
    atualizadoPor: null,
    ...parcial,
  };
}

function resposta(status: number, corpo: string, tipo = "application/json") {
  return new Response(corpo, { status, headers: { "content-type": tipo } });
}

describe("normalizarPedidoErp", () => {
  it("mapeia o JSON real do ERP", () => {
    const pedido = normalizarPedidoErp(PEDIDO_REAL);

    expect(pedido).not.toBeNull();
    expect(pedido!.numero).toBe(104718);
    expect(pedido!.empresa).toEqual({ codigo: 2, nome: "TRIEL-HT INDUSTRIAL E PARTICIPACOES S/A MATRIZ" });
    expect(pedido!.situacao).toBe("pendente");
    expect(pedido!.tipo).toBe("Ordem de Compra Liberada");
    expect(pedido!.fornecedor).toEqual({ codigo: 79644, nome: "INGA VEICULOS LTDA", documento: "01994951001834" });
    expect(pedido!.comprador).toBe("CRISLEY ANE FERREIRA");
    expect(pedido!.moeda).toBeNull();
    expect(pedido!.frete).toEqual({ tipo: "Fob-Contrat.", valor: null, transportadora: null });
    expect(pedido!.valores.total).toBe(2070.03);
    expect(pedido!.parcelas[0]).toMatchObject({ dias: 30, percentual: 100, percentualInformado: false });
  });

  it("lê IPI e ICMS do bloco impostos quando valores não traz", () => {
    const pedido = normalizarPedidoErp(PEDIDO_REAL)!;
    expect(pedido.valores.ipi).toBe(12.5);
    expect(pedido.valores.icms).toBe(30);
    expect(pedido.valores.icmsSt).toBe(0);
  });

  it("usa a descrição do item no pedido, com o código e o centro de custo", () => {
    const [item] = normalizarPedidoErp(PEDIDO_REAL)!.itens;
    expect(item).toMatchObject({
      sequencia: 1,
      codigo: "58555",
      descricao: "SERVICO DE HABILITACAO",
      quantidade: 1,
      saldo: 1,
      total: 0.1,
      entrega: "21/10/2026",
      centroCusto: "ABTS - MARICA OF 2972",
    });
  });

  it("aceita a capa dentro de data.capa", () => {
    const { numero, empresa, dataEmissao, situacao, ...resto } = PEDIDO_REAL;
    const pedido = normalizarPedidoErp({ capa: { numero, empresa, dataEmissao, situacao }, ...resto });
    expect(pedido?.numero).toBe(104718);
    expect(pedido?.situacao).toBe("pendente");
  });

  it("devolve null sem número do pedido ou com corpo inválido", () => {
    expect(normalizarPedidoErp({ ...PEDIDO_REAL, numero: null })).toBeNull();
    expect(normalizarPedidoErp(null)).toBeNull();
    expect(normalizarPedidoErp([])).toBeNull();
  });

  it("tolera blocos ausentes sem quebrar", () => {
    const pedido = normalizarPedidoErp({ numero: 5 });
    expect(pedido).toMatchObject({
      numero: 5,
      fornecedor: { codigo: null, nome: "(fornecedor sem nome)", documento: null },
      parcelas: [],
      itens: [],
      frete: null,
    });
    expect(pedido!.valores.total).toBe(0);
  });

  it("CPF entra como documento quando não há CNPJ", () => {
    const pedido = normalizarPedidoErp({ ...PEDIDO_REAL, fornecedor: { codigo: 1, nome: "PESSOA", cnpj: null, cpf: "12345678901" } });
    expect(pedido!.fornecedor.documento).toBe("12345678901");
  });

  it("descreve a moeda estrangeira", () => {
    const pedido = normalizarPedidoErp({ ...PEDIDO_REAL, moeda: { codigo: "EUR", descricao: "EURO" } });
    expect(pedido!.moeda).toBe("EURO");
  });
});

describe("consultarPedidoCompraErp", () => {
  beforeEach(() => {
    fetchMonitorado.mockReset();
    buscarConfigPedidosCompra.mockReset();
    buscarConfigPedidosCompra.mockResolvedValue(config());
  });

  it("monta a URL /empresa/numero e devolve o pedido", async () => {
    fetchMonitorado.mockResolvedValue(resposta(200, JSON.stringify({ success: true, data: PEDIDO_REAL })));

    const pedido = await consultarPedidoCompraErp(2, 104718);

    expect(pedido?.numero).toBe(104718);
    expect(fetchMonitorado.mock.calls[0][0]).toBe("http://erp:1000/api/pedido-compra/2/104718");
  });

  it("usa a URL de teste e mantém o ?ambiente=teste", async () => {
    buscarConfigPedidosCompra.mockResolvedValue(config({ usarAmbienteTeste: true }));
    fetchMonitorado.mockResolvedValue(resposta(200, JSON.stringify({ data: PEDIDO_REAL })));

    await consultarPedidoCompraErp(2, 104718);

    expect(fetchMonitorado.mock.calls[0][0]).toBe("http://erp:1000/api/pedido-compra/2/104718?ambiente=teste");
  });

  it("manda o Bearer só quando há chave do ERP", async () => {
    buscarConfigPedidosCompra.mockResolvedValue(config({ chaveApiErp: "segredo" }));
    fetchMonitorado.mockResolvedValue(resposta(200, JSON.stringify({ data: PEDIDO_REAL })));

    await consultarPedidoCompraErp(2, 1);

    expect(fetchMonitorado.mock.calls[0][1].headers.Authorization).toBe("Bearer segredo");
  });

  it("404 em JSON = pedido não existe (null)", async () => {
    fetchMonitorado.mockResolvedValue(resposta(404, JSON.stringify({ success: false, message: "não encontrado" })));
    await expect(consultarPedidoCompraErp(2, 999)).resolves.toBeNull();
  });

  it("404 em HTML = rota não publicada (erro, não 'pedido inexistente')", async () => {
    fetchMonitorado.mockResolvedValue(resposta(404, "<pre>Cannot GET /api/pedido-compra/2/1</pre>", "text/html"));
    await expect(consultarPedidoCompraErp(2, 1)).rejects.toBeInstanceOf(ErroConsultaErp);
  });

  it("erro HTTP do ERP vira ErroConsultaErp com a mensagem dele", async () => {
    fetchMonitorado.mockResolvedValue(resposta(500, JSON.stringify({ message: "ORA-12541" })));
    await expect(consultarPedidoCompraErp(2, 1)).rejects.toThrow(/ORA-12541/);
  });

  it("ERP fora do ar vira ErroConsultaErp", async () => {
    fetchMonitorado.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(consultarPedidoCompraErp(2, 1)).rejects.toBeInstanceOf(ErroConsultaErp);
  });

  it("resposta 200 fora do formato vira ErroConsultaErp", async () => {
    fetchMonitorado.mockResolvedValue(resposta(200, JSON.stringify({ data: { sem: "numero" } })));
    await expect(consultarPedidoCompraErp(2, 1)).rejects.toBeInstanceOf(ErroConsultaErp);
  });

  it("sem URL configurada não chama a rede", async () => {
    buscarConfigPedidosCompra.mockResolvedValue(config({ urlPedido: null }));
    await expect(consultarPedidoCompraErp(2, 1)).rejects.toThrow(/não está configurada/);
    expect(fetchMonitorado).not.toHaveBeenCalled();
  });
});
