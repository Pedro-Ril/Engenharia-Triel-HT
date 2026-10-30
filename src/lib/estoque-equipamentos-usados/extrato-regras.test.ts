import { describe, expect, it } from "vitest";

import {
  decidirStatus,
  normalizarNumeroNf,
  ordenarMovimentos,
  regraDoTipo,
  statusSegundoErp,
  type MovimentoErp,
} from "./extrato-regras";

function mov(data: string, tipo: string, id = `${tipo}:${data}`): MovimentoErp {
  return { idMovimentacao: id, data, tipo };
}

/* Extratos reais do ERP (resumidos), dos equipamentos 814, 784, 918 e 889. */
const E814 = [
  mov("2023-04-14", "COMPRA"),
  mov("2023-05-04", "EMPRESTIMO_REMESSA"),
  mov("2023-10-02", "EMPRESTIMO_RETORNO"),
  mov("2023-10-02", "EMPRESTIMO_REMESSA", "b"),
  mov("2025-02-26", "EMPRESTIMO_RETORNO", "c"),
  mov("2025-02-28", "CONSIGNACAO_REMESSA"),
  mov("2025-12-31", "AJUSTE_VALOR"),
  mov("2026-01-01", "AJUSTE_VALOR", "d"),
  mov("2026-05-18", "CONSIGNACAO_RETORNO"),
  mov("2026-05-18", "VENDA"),
];

const E784 = [
  mov("2020-04-27", "COMPRA"),
  mov("2020-04-27", "TRANSFERENCIA_EMPRESA_SAIDA"),
  mov("2020-04-27", "TRANSFERENCIA_EMPRESA_ENTRADA"),
  mov("2020-11-05", "EMPRESTIMO_REMESSA"),
  mov("2020-11-16", "EMPRESTIMO_RETORNO"),
  mov("2020-11-16", "INDUSTRIALIZACAO_REMESSA"),
];

describe("statusSegundoErp", () => {
  it("889: compra e remessa em consignação -> consignado", () => {
    const r = statusSegundoErp([mov("2024-11-22", "COMPRA"), mov("2025-02-28", "CONSIGNACAO_REMESSA")]);
    expect(r.status).toBe("consignado");
    expect(r.movimento?.tipo).toBe("CONSIGNACAO_REMESSA");
  });

  it("814: ignora ajuste de valor e termina vendido (retorno e venda no mesmo dia, na ordem do ERP)", () => {
    expect(statusSegundoErp(E814).status).toBe("baixado");
  });

  it("918: venda em consignação -> baixado", () => {
    const r = statusSegundoErp([
      mov("2025-09-26", "COMPRA"),
      mov("2025-10-13", "CONSIGNACAO_REMESSA"),
      mov("2025-12-15", "CONSIGNACAO_RETORNO"),
      mov("2025-12-16", "CONSIGNACAO_VENDA"),
    ]);
    expect(r.status).toBe("baixado");
  });

  it("784: transferência entre empresas não mexe no status; reforma -> em_reforma", () => {
    expect(statusSegundoErp(E784).status).toBe("em_reforma");
    expect(statusSegundoErp(E784.slice(0, 2)).status).toBe("em_estoque");
  });

  it("sem movimento que defina status -> null", () => {
    expect(statusSegundoErp([mov("2026-01-01", "AJUSTE_VALOR"), mov("2026-01-02", "REQUISICAO")]).status).toBeNull();
  });
});

describe("ordenarMovimentos", () => {
  it("ordena por data e mantém a ordem do ERP no mesmo dia", () => {
    const fora = [mov("2026-05-18", "VENDA"), mov("2025-02-28", "CONSIGNACAO_REMESSA"), mov("2026-05-18", "X")];
    expect(ordenarMovimentos(fora).map((m) => m.tipo)).toEqual(["CONSIGNACAO_REMESSA", "VENDA", "X"]);
  });
});

describe("regraDoTipo", () => {
  it("mapeia para a ação do Portal", () => {
    expect(regraDoTipo("CONSERTO_REMESSA")).toEqual({ acao: "reforma", status: "em_reforma" });
    expect(regraDoTipo("DEVOLUCAO_VENDA")).toEqual({ acao: "retorno", status: "em_estoque" });
    expect(regraDoTipo("TRANSFERENCIA_EMPRESA_SAIDA")).toEqual({ acao: "transferencia", status: null });
    expect(regraDoTipo("TIPO_NOVO_DESCONHECIDO")).toEqual({ acao: null, status: null });
  });
});

describe("normalizarNumeroNf", () => {
  it("compara só os dígitos do número, sem série nem zeros à esquerda", () => {
    expect(normalizarNumeroNf("000069501")).toBe("69501");
    expect(normalizarNumeroNf("69501/55")).toBe("69501");
    expect(normalizarNumeroNf(69501)).toBe("69501");
    expect(normalizarNumeroNf("69.501")).toBe("69501");
    expect(normalizarNumeroNf("")).toBeNull();
    expect(normalizarNumeroNf(null)).toBeNull();
  });
});

describe("decidirStatus", () => {
  const base = { hoje: "2026-10-30", dataMovimentoErp: "2025-02-28" };

  it("segue o ERP quando diverge", () => {
    const r = decidirStatus({ ...base, statusPortal: "em_estoque", statusErp: "consignado", manualPendente: null });
    expect(r).toMatchObject({ mudar: true, novoStatus: "consignado" });
  });

  it("não muda quando já está igual ou o ERP não diz nada", () => {
    expect(decidirStatus({ ...base, statusPortal: "consignado", statusErp: "consignado", manualPendente: null }).mudar).toBe(false);
    expect(decidirStatus({ ...base, statusPortal: "em_estoque", statusErp: null, manualPendente: null }).mudar).toBe(false);
  });

  it("respeita a movimentação manual recente que ainda espera a NF", () => {
    const r = decidirStatus({
      ...base,
      statusPortal: "emprestado",
      statusErp: "em_estoque",
      manualPendente: { tipoAcao: "emprestimo", dataAcao: "2026-10-25" },
    });
    expect(r.mudar).toBe(false);
  });

  it("passado o prazo, vale o ERP", () => {
    const r = decidirStatus({
      ...base,
      statusPortal: "emprestado",
      statusErp: "em_estoque",
      manualPendente: { tipoAcao: "emprestimo", dataAcao: "2026-09-01" },
    });
    expect(r).toMatchObject({ mudar: true, novoStatus: "em_estoque" });
  });

  it("manual mais antiga que o último movimento do ERP não segura nada", () => {
    const r = decidirStatus({
      hoje: "2026-10-30",
      dataMovimentoErp: "2026-10-28",
      statusPortal: "emprestado",
      statusErp: "em_estoque",
      manualPendente: { tipoAcao: "emprestimo", dataAcao: "2026-10-20" },
    });
    expect(r.mudar).toBe(true);
  });
});
