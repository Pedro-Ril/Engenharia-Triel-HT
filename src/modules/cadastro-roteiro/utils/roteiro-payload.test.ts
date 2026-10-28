import { describe, expect, it } from "vitest";

import type { RoteiroItem } from "../types/cadastroRoteiro.types";
import { alternativoParaNumero, mudancasAlemDaRevisao, roteiroExistenteParaPayload } from "./roteiro-payload";

describe("roteiroExistenteParaPayload", () => {
  const roteiro: RoteiroItem = {
    COD_ITEM: "264248",
    ALTERNATIVO: "Alternativo 2",
    SEQ: 10,
    COD_OPERACAO: 120,
    COD_CENTRO_TRAB: " 0301 ",
    COD_UNID_MED: "HR",
    DT_INICIO: "01/01/1900",
    DT_FIM: "31/12/2999",
    APONTAMENTO: 1,
    OBRIGATORIO: 0,
    TEMPO: 0.5,
    OBSERVACAO: null,
    RECURSOS: [{ COD_RECURSO: "M1" } as never],
  };

  it("mantém a operação como está e só troca a revisão (sem recursos e consumos: o ERP conserva)", () => {
    expect(roteiroExistenteParaPayload(roteiro, "B")).toEqual({
      alternativo: 2,
      seq: 10,
      cod_operacao: "120",
      cod_centro_trab: "0301",
      cod_unid_med: "HR",
      dt_inicio: "01/01/1900",
      dt_fim: "31/12/2999",
      apontamento: "1",
      obrigatorio: "0",
      tempo: 0.5,
      observacao: null,
      revisao: "B",
    });
  });

  it("alternativo: padrão vira 0", () => {
    expect(alternativoParaNumero("Roteiro padrão")).toBe(0);
    expect(alternativoParaNumero(null)).toBe(0);
    expect(alternativoParaNumero("ALTERNATIVO 3")).toBe(3);
  });
});

describe("mudancasAlemDaRevisao", () => {
  it("só a revisão mudando: nada a apontar", () => {
    expect(
      mudancasAlemDaRevisao({
        success: true,
        detalhes: [{ alternativo: 0, seq: 10, camposAlterados: [{ campo: "REVISAO", de: null, para: "B" }] }],
      })
    ).toEqual([]);
  });

  it("aponta exclusão, outro campo, máquinas/consumos perdidos e desligamento", () => {
    const mudancas = mudancasAlemDaRevisao({
      success: true,
      excluidos: [{ alternativo: 0, seq: 30 }],
      detalhes: [
        { alternativo: 0, seq: 10, camposAlterados: [{ campo: "TEMPO", de: 1, para: 2 }] },
        { alternativo: 1, seq: 20, removidos: { consumos: 2 } },
        { alternativo: 0, seq: 40, desligados: { roteirosMrp: 1 } },
      ],
    });
    expect(mudancas).toHaveLength(4);
    expect(mudancas[0]).toMatch(/operação 30 seria excluída/);
    expect(mudancas[1]).toMatch(/TEMPO/);
    expect(mudancas[2]).toMatch(/alternativo 1/);
  });
});
