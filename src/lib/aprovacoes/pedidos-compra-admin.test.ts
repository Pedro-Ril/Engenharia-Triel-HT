import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/lib/auth/errors";

/*
 * Banco trocado por um falso: cada `request().input(...).query()` devolve
 * o recordset da vez e guarda o SQL e os parâmetros para conferência.
 */
const consultas: { sql: string; parametros: Record<string, unknown> }[] = [];
let proximoRecordset: unknown[] = [];

function requestFalso() {
  const parametros: Record<string, unknown> = {};
  const request = {
    input(nome: string, _tipo: unknown, valor: unknown) {
      parametros[nome] = valor;
      return request;
    },
    async query(sql: string) {
      consultas.push({ sql, parametros });
      return { recordset: proximoRecordset };
    },
  };
  return request;
}

vi.mock("@/lib/database/sql-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/database/sql-server")>()),
  getSqlServerPool: async () => ({ request: requestFalso }),
}));

vi.mock("@/lib/monitoramento/integracao-externa", () => ({ fetchMonitorado: vi.fn() }));

const { conferirChaveExterna, definirEmpresasAprovador, montarUrlPedido, salvarConfigPedidosCompra } = await import(
  "./pedidos-compra-admin"
);

const sha256 = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");

beforeEach(() => {
  consultas.length = 0;
  proximoRecordset = [];
});

describe("montarUrlPedido", () => {
  it("acrescenta /empresa/numero", () => {
    expect(montarUrlPedido("http://erp:1000/api/pedido-compra", 2, 104718)).toBe(
      "http://erp:1000/api/pedido-compra/2/104718"
    );
  });

  it("não duplica a barra final", () => {
    expect(montarUrlPedido("http://erp:1000/api/pedido-compra/", 30, 1)).toBe("http://erp:1000/api/pedido-compra/30/1");
  });

  it("mantém a query da URL configurada", () => {
    expect(montarUrlPedido("http://erp:1000/api/pedido-compra?ambiente=teste", 2, 5)).toBe(
      "http://erp:1000/api/pedido-compra/2/5?ambiente=teste"
    );
  });
});

describe("conferirChaveExterna", () => {
  it("sem chave gerada = integração desligada", async () => {
    proximoRecordset = [{ chave_externa_hash: null }];
    await expect(conferirChaveExterna("qualquer")).resolves.toBe("nao_configurada");
  });

  it("sem linha de configuração = integração desligada", async () => {
    proximoRecordset = [];
    await expect(conferirChaveExterna("qualquer")).resolves.toBe("nao_configurada");
  });

  it("chave certa confere pelo hash", async () => {
    proximoRecordset = [{ chave_externa_hash: sha256("abc123") }];
    await expect(conferirChaveExterna("abc123")).resolves.toBe("valida");
  });

  it("chave errada ou vazia não confere", async () => {
    proximoRecordset = [{ chave_externa_hash: sha256("abc123") }];
    await expect(conferirChaveExterna("abc124")).resolves.toBe("invalida");
    await expect(conferirChaveExterna("")).resolves.toBe("invalida");
  });

  it("hash gravado em maiúsculas (CHAR(64) editado à mão) ainda confere", async () => {
    proximoRecordset = [{ chave_externa_hash: sha256("abc123").toUpperCase() }];
    await expect(conferirChaveExterna("abc123")).resolves.toBe("valida");
  });
});

describe("definirEmpresasAprovador", () => {
  const usuarioId = "11111111-1111-1111-1111-111111111111";

  it("recusa empresa que não é do Focco sem tocar no banco", async () => {
    await expect(definirEmpresasAprovador({ usuarioId, empresas: [2, 99], alteradoPor: "x" })).rejects.toThrow(
      ValidationError
    );
    expect(consultas).toHaveLength(0);
  });

  it("recusa marcar empresa para quem não é aprovador de pedido de compra", async () => {
    proximoRecordset = [];
    await expect(definirEmpresasAprovador({ usuarioId, empresas: [2], alteradoPor: "x" })).rejects.toThrow(
      /aprovador de Pedidos de Compra/
    );
  });
});

describe("salvarConfigPedidosCompra", () => {
  it.each(["ftp://erp/api", "erp:1000/api", "não é url"])("recusa URL inválida: %s", async (url) => {
    await expect(
      salvarConfigPedidosCompra({ urlPedido: url, urlPedidoTeste: null, usarAmbienteTeste: false, chaveApiErp: null }, "x")
    ).rejects.toThrow(ValidationError);
    expect(consultas).toHaveLength(0);
  });
});
