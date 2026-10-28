import { beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/lib/auth/errors";
import type { PedidoCompraErp } from "@/modules/aprovacoes/types/aprovacoes.types";

/* ERP e log trocados por mocks: aqui só entram as regras do portal. */
const consultarPedidoCompraErp = vi.fn();
const registrarLog = vi.fn();

vi.mock("./pedido-compra-erp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pedido-compra-erp")>()),
  consultarPedidoCompraErp: (...args: unknown[]) => consultarPedidoCompraErp(...args),
}));

vi.mock("@/lib/monitoramento/logs", () => ({
  registrarLog: (...args: unknown[]) => registrarLog(...args),
}));

/* Banco falso: guarda o SQL e os parâmetros de cada consulta. */
const consultas: { sql: string; parametros: Record<string, unknown> }[] = [];

function requestFalso() {
  const parametros: Record<string, unknown> = {};
  const request = {
    input(nome: string, _tipo: unknown, valor: unknown) {
      parametros[nome] = valor;
      return request;
    },
    async query(sql: string) {
      consultas.push({ sql, parametros });
      return { recordset: [] };
    },
  };
  return request;
}

vi.mock("@/lib/database/sql-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/sql-server")>()),
  getSqlServerPool: async () => ({ request: requestFalso }),
}));

const {
  centrosCustoDosItens,
  completarFotosFaltantes,
  conferirNoErp,
  dataIso,
  lerChavePedido,
  lerDesde,
  lerEnvioPedidos,
  MAXIMO_PEDIDOS_POR_ENVIO,
  primeiraEntrega,
  resumirPagamento,
} = await import("./pedidos-compra");
const { ErroConsultaErp } = await import("./pedido-compra-erp");

function pedidoErp(numero: number, parcial: Partial<PedidoCompraErp> = {}): PedidoCompraErp {
  return {
    numero,
    empresa: { codigo: 2, nome: null },
    dataEmissao: "21/10/2026",
    situacao: "pendente",
    tipo: null,
    fornecedor: { codigo: 1, nome: "FORNECEDOR", documento: null },
    comprador: null,
    contato: null,
    moeda: null,
    frete: null,
    parcelas: [],
    valores: { bruto: 0, descontos: 0, acrescimos: 0, ipi: 0, icms: 0, icmsSt: 0, frete: 0, total: 100 },
    observacao: null,
    itens: [],
    ...parcial,
  };
}

describe("lerChavePedido", () => {
  it("aceita número e texto numérico (com espaços)", () => {
    expect(lerChavePedido(2, 104718)).toEqual({ empresa: 2, numero: 104718 });
    expect(lerChavePedido("30", " 3645 ")).toEqual({ empresa: 30, numero: 3645 });
  });

  it.each([
    ["zero", 0],
    ["negativo", -1],
    ["decimal", 1.5],
    ["texto", "abc"],
    ["texto decimal", "12.5"],
    ["vazio", ""],
    ["nulo", null],
    ["maior que o inteiro seguro", "99999999999999999999"],
  ])("recusa número %s", (_nome, valor) => {
    expect(() => lerChavePedido(2, valor)).toThrow(ValidationError);
  });

  it("a mensagem diz qual campo está errado", () => {
    expect(() => lerChavePedido("x", 1)).toThrow(/empresa/);
    expect(() => lerChavePedido(2, "x")).toThrow(/numero/);
  });
});

describe("lerEnvioPedidos", () => {
  it("lê o corpo completo", () => {
    expect(
      lerEnvioPedidos({
        enviadoPor: " Crisley ",
        observacao: "urgente",
        aprovador: "Fulano.Silva",
        pedidos: [{ empresa: 2, numero: 1 }, { empresa: "30", numero: "2", aprovador: "Outro.Diretor" }],
      })
    ).toEqual({
      enviadoPor: "Crisley",
      observacao: "urgente",
      pedidos: [
        { empresa: 2, numero: 1, aprovador: "fulano.silva" },
        { empresa: 30, numero: 2, aprovador: "outro.diretor" },
      ],
    });
  });

  it("aprovador vazio no pedido cai no do envio", () => {
    const envio = lerEnvioPedidos({ aprovador: "dir", pedidos: [{ empresa: 2, numero: 1, aprovador: "" }] });
    expect(envio.pedidos[0].aprovador).toBe("dir");
  });

  it("sem aprovador nenhum fica null", () => {
    const envio = lerEnvioPedidos({ pedidos: [{ empresa: 2, numero: 1 }] });
    expect(envio).toEqual({ enviadoPor: null, observacao: null, pedidos: [{ empresa: 2, numero: 1, aprovador: null }] });
  });

  it("o mesmo pedido duas vezes conta uma vez (vale o primeiro)", () => {
    const envio = lerEnvioPedidos({
      pedidos: [
        { empresa: 2, numero: 1, aprovador: "a" },
        { empresa: "2", numero: "1", aprovador: "b" },
      ],
    });
    expect(envio.pedidos).toEqual([{ empresa: 2, numero: 1, aprovador: "a" }]);
  });

  it("o limite conta depois de tirar as duplicatas", () => {
    const repetidos = Array.from({ length: MAXIMO_PEDIDOS_POR_ENVIO + 50 }, () => ({ empresa: 2, numero: 1 }));
    expect(lerEnvioPedidos({ pedidos: repetidos }).pedidos).toHaveLength(1);

    const demais = Array.from({ length: MAXIMO_PEDIDOS_POR_ENVIO + 1 }, (_, i) => ({ empresa: 2, numero: i + 1 }));
    expect(() => lerEnvioPedidos({ pedidos: demais })).toThrow(/no máximo/);
  });

  it.each([
    ["corpo que não é objeto", "texto"],
    ["corpo nulo", null],
    ["sem pedidos", {}],
    ["pedidos vazio", { pedidos: [] }],
    ["pedidos não é lista", { pedidos: { empresa: 2, numero: 1 } }],
    ["item que não é objeto", { pedidos: [5] }],
  ])("recusa %s", (_nome, corpo) => {
    expect(() => lerEnvioPedidos(corpo)).toThrow(ValidationError);
  });

  it("aponta a posição do item inválido", () => {
    expect(() => lerEnvioPedidos({ pedidos: [{ empresa: 2, numero: 1 }, "x"] })).toThrow(/posição 2/);
  });

  it("recusa enviadoPor que não é texto com mensagem clara", () => {
    expect(() => lerEnvioPedidos({ enviadoPor: 123, pedidos: [{ empresa: 2, numero: 1 }] })).toThrow(/enviadoPor/);
  });
});

describe("lerDesde", () => {
  it("aceita o formato que o próprio portal devolve", () => {
    expect(lerDesde("2026-10-26T08:45:41.2632645")).toBe("2026-10-26T08:45:41.2632645");
    expect(lerDesde("2026-10-26")).toBe("2026-10-26");
    expect(lerDesde("2026-10-26T08:45")).toBe("2026-10-26T08:45");
  });

  it("vazio = sem filtro", () => {
    expect(lerDesde(null)).toBeNull();
    expect(lerDesde("  ")).toBeNull();
  });

  it("recusa texto que não é data", () => {
    expect(() => lerDesde("ontem")).toThrow(ValidationError);
    expect(() => lerDesde("26/10/2026")).toThrow(ValidationError);
  });

  it("recusa data com formato certo mas inexistente (senão o SQL Server dá 500)", () => {
    expect(() => lerDesde("2026-13-45")).toThrow(ValidationError);
    expect(() => lerDesde("2026-02-30T10:00:00")).toThrow(ValidationError);
    expect(() => lerDesde("2026-10-26T25:00:00")).toThrow(ValidationError);
  });
});

describe("dataIso", () => {
  it("converte dd/mm/aaaa do ERP", () => {
    expect(dataIso("21/10/2026")).toBe("2026-10-21");
    expect(dataIso(" 01/02/2026 ")).toBe("2026-02-01");
  });

  it("devolve null fora do formato", () => {
    expect(dataIso(null)).toBeNull();
    expect(dataIso("2026-10-21")).toBeNull();
    expect(dataIso("1/2/2026")).toBeNull();
  });

  it("devolve null para data inexistente (senão a gravação inteira falha)", () => {
    expect(dataIso("31/02/2026")).toBeNull();
    expect(dataIso("00/10/2026")).toBeNull();
    expect(dataIso("15/13/2026")).toBeNull();
  });
});

describe("resumirPagamento", () => {
  const parcela = (dias: number | null) => ({
    parcela: 1,
    dias,
    vencimento: null,
    percentual: null,
    percentualInformado: true,
    valorEstimado: null,
  });

  it("junta os prazos das parcelas", () => {
    expect(resumirPagamento({ parcelas: [parcela(30), parcela(60), parcela(90)] })).toBe("30/60/90 dias");
    expect(resumirPagamento({ parcelas: [parcela(30)] })).toBe("30 dias");
  });

  it("parcela única em 0 dias é à vista", () => {
    expect(resumirPagamento({ parcelas: [parcela(0)] })).toBe("À vista");
  });

  it("entrada + parcelas não vira '0/30 dias'", () => {
    expect(resumirPagamento({ parcelas: [parcela(0), parcela(30)] })).toBe("Entrada + 30 dias");
  });

  it("sem parcelas (ou sem prazo) fica null", () => {
    expect(resumirPagamento({ parcelas: [] })).toBeNull();
    expect(resumirPagamento({ parcelas: [parcela(null)] })).toBeNull();
  });
});

describe("primeiraEntrega", () => {
  const item = (entrega: string | null) => ({
    sequencia: 1,
    codigo: "1",
    descricao: "",
    unidade: null,
    situacao: null,
    quantidade: 1,
    atendida: 0,
    saldo: 1,
    precoUnitario: 0,
    percentualIpi: null,
    total: 0,
    entrega,
    centroCusto: null,
    centroCustoCodigo: null,
    observacao: null,
  });

  it("pega a data mais cedo, comparando como data e não como texto", () => {
    expect(primeiraEntrega({ itens: [item("05/12/2026"), item("20/11/2026"), item("01/01/2027")] })).toBe("2026-11-20");
  });

  it("ignora itens sem data ou com data inválida", () => {
    expect(primeiraEntrega({ itens: [item(null), item("31/02/2026"), item("10/11/2026")] })).toBe("2026-11-10");
    expect(primeiraEntrega({ itens: [] })).toBeNull();
  });
});

describe("centrosCustoDosItens", () => {
  const item = (centroCustoCodigo: string | null) => ({ centroCustoCodigo }) as PedidoCompraErp["itens"][number];

  it("um código por item, na ordem, vazio para item sem centro de custo", () => {
    expect(centrosCustoDosItens({ itens: [item("9002204"), item(null), item("9002204")] })).toBe("9002204,,9002204");
    expect(centrosCustoDosItens({ itens: [] })).toBe("");
  });
});

describe("conferirNoErp", () => {
  beforeEach(() => {
    consultarPedidoCompraErp.mockReset();
    registrarLog.mockReset();
  });

  const enviado = (numero: number) => ({ empresa: 2, numero, aprovador: null });

  it("devolve a foto de cada pedido", async () => {
    consultarPedidoCompraErp.mockImplementation(async (_e: number, n: number) => pedidoErp(n));
    const fotos = await conferirNoErp([enviado(1), enviado(2)]);
    expect([...fotos.keys()]).toEqual(["2-1", "2-2"]);
  });

  it("recusa o envio quando um pedido não existe no Focco, com o número na mensagem", async () => {
    consultarPedidoCompraErp.mockImplementation(async (_e: number, n: number) => (n === 2 ? null : pedidoErp(n)));
    await expect(conferirNoErp([enviado(1), enviado(2)])).rejects.toThrow(/não encontrado.*2 \(Triel-HT\)/);
  });

  it("recusa pedido cancelado no Focco", async () => {
    consultarPedidoCompraErp.mockResolvedValue(pedidoErp(7, { situacao: "cancelado" }));
    await expect(conferirNoErp([enviado(7)])).rejects.toThrow(/cancelado/);
  });

  it("aceita pedido parcialmente atendido", async () => {
    consultarPedidoCompraErp.mockResolvedValue(pedidoErp(7, { situacao: "parcial" }));
    await expect(conferirNoErp([enviado(7)])).resolves.toHaveProperty("size", 1);
  });

  it("ERP fora do ar: o envio segue sem foto e fica no log", async () => {
    consultarPedidoCompraErp.mockRejectedValue(new ErroConsultaErp("ERP fora"));
    const fotos = await conferirNoErp([enviado(1)]);
    expect(fotos.size).toBe(0);
    expect(registrarLog).toHaveBeenCalledOnce();
  });

  it("um pedido com timeout não descarta a foto dos que responderam", async () => {
    consultarPedidoCompraErp.mockImplementation(async (_e: number, n: number) => {
      if (n === 2) throw new ErroConsultaErp("timeout");
      return pedidoErp(n);
    });
    const fotos = await conferirNoErp([enviado(1), enviado(2), enviado(3)]);
    expect([...fotos.keys()].sort()).toEqual(["2-1", "2-3"]);
  });

  it("erro inesperado (bug) não é engolido como 'ERP fora do ar'", async () => {
    consultarPedidoCompraErp.mockRejectedValue(new TypeError("bug"));
    await expect(conferirNoErp([enviado(1)])).rejects.toThrow(TypeError);
  });
});

describe("completarFotosFaltantes", () => {
  beforeEach(() => {
    consultarPedidoCompraErp.mockReset();
    consultas.length = 0;
  });

  const semFoto = (numero: number, podeCompletarFoto = true) => ({
    id: `00000000-0000-0000-0000-${String(numero).padStart(12, "0")}`,
    empresa: 2,
    numero,
    podeCompletarFoto,
    temFoto: false,
  });

  const atualizacoesDeFoto = () => consultas.filter((c) => c.sql.includes("[snapshot_em] = SYSDATETIME()"));
  const marcacoesDeTentativa = () => consultas.filter((c) => c.sql.includes("[foto_tentativa_em] = SYSDATETIME()"));

  it("não consulta o ERP para quem tentou há pouco (ou já tem foto)", async () => {
    await expect(completarFotosFaltantes([semFoto(1, false)])).resolves.toBe(0);
    expect(consultarPedidoCompraErp).not.toHaveBeenCalled();
    expect(consultas).toHaveLength(0);
  });

  it("grava a foto de quem o ERP devolveu", async () => {
    consultarPedidoCompraErp.mockImplementation(async (_e: number, n: number) => pedidoErp(n));
    await expect(completarFotosFaltantes([semFoto(1), semFoto(2)])).resolves.toBe(2);
    expect(atualizacoesDeFoto()).toHaveLength(2);
    expect(marcacoesDeTentativa()).toHaveLength(0);
  });

  it("pedido que não existe no ERP fica marcado para não consultar de novo a cada carga", async () => {
    consultarPedidoCompraErp.mockImplementation(async (_e: number, n: number) => (n === 2 ? null : pedidoErp(n)));
    await expect(completarFotosFaltantes([semFoto(1), semFoto(2)])).resolves.toBe(1);

    const [marcacao] = marcacoesDeTentativa();
    expect(Object.values(marcacao.parametros)).toEqual([semFoto(2).id]);
  });

  it("ERP fora do ar marca todos de uma vez, inclusive os que nem chegaram a ser consultados", async () => {
    consultarPedidoCompraErp.mockRejectedValue(new ErroConsultaErp("fora do ar"));
    const pedidos = Array.from({ length: 10 }, (_, i) => semFoto(i + 1));

    await expect(completarFotosFaltantes(pedidos)).resolves.toBe(0);

    /* Parou no primeiro bloco: não esperou o tempo limite dos outros. */
    expect(consultarPedidoCompraErp.mock.calls.length).toBeLessThan(10);
    const [marcacao] = marcacoesDeTentativa();
    expect(Object.values(marcacao.parametros)).toHaveLength(10);
  });

  it("limita quantos completa por carga", async () => {
    consultarPedidoCompraErp.mockImplementation(async (_e: number, n: number) => pedidoErp(n));
    const pedidos = Array.from({ length: 50 }, (_, i) => semFoto(i + 1));

    await expect(completarFotosFaltantes(pedidos)).resolves.toBe(30);
  });

  it("pedido que já tem foto ganha só os centros de custo (a foto do envio não muda)", async () => {
    consultarPedidoCompraErp.mockImplementation(async (_e: number, n: number) => pedidoErp(n));

    await expect(completarFotosFaltantes([{ ...semFoto(1), temFoto: true }])).resolves.toBe(1);

    expect(atualizacoesDeFoto()).toHaveLength(0);
    const centros = consultas.filter((c) => c.sql.includes("SET [centros_custo_itens] = @centros"));
    expect(centros).toHaveLength(1);
  });
});
