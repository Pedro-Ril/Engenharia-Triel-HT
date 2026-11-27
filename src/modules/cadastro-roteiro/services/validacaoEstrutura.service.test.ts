import { describe, expect, it } from "vitest";

import type { EstruturaApiItem } from "@/modules/consulta-estrutura/types/estruturaProduto.types";

import type { RoteiroTreeNode } from "../types/cadastroRoteiro.types";
import { compararEstrutura } from "./validacaoEstrutura.service";

let proximoId = 0;

function no(codigo: string, tipoint: string, children: RoteiroTreeNode[] = [], quantidade?: number): RoteiroTreeNode {
  proximoId += 1;
  return {
    id: `n${proximoId}`,
    codigo,
    codigoNormalizado: codigo,
    descricao: `Item ${codigo}`,
    descricaoNormalizada: `Item ${codigo}`,
    tipoint,
    quantidade,
    children,
  } as unknown as RoteiroTreeNode;
}

function linha(ordem: string, pai: string, filho: string, qtde: number, status = "VALIDO"): EstruturaApiItem {
  return { ORDEM_HIERARQUICA: ordem, COD_ITEM_PAI: pai, COD_ITEM_FILHO: filho, QTDE: qtde, STATUS_VALIDADE: status };
}

describe("compararEstrutura: quantidade", () => {
  it("acusa o filho que aparece mais vezes no 3DX do que a QTDE do ERP (caso 283185 > 283181)", () => {
    const fixadores = [no("283181", "Fabricado"), no("283181", "Fabricado"), no("283181", "Fabricado")];
    const arvore = no("283185", "Fabricado", [no("49401", "Fabricado"), ...fixadores]);
    const erp = [linha("1", "283185", "49401", 1), linha("2", "283185", "283181", 1)];

    const resultado = compararEstrutura(arvore, erp);

    expect(resultado.divergencias).toEqual([
      expect.objectContaining({ codigoPai: "283185", codigoFilho: "283181", tipo: "quantidade", qtde3dx: 3, qtdeErp: 1 }),
    ]);
    /* As três instâncias recebem a badge; o 49401 (1 x 1) não. */
    for (const f of fixadores) expect(resultado.porNo.get(f.id)).toEqual({ tipo: "quantidade", qtde3dx: 3, qtdeErp: 1 });
    expect(resultado.porNo.size).toBe(3);
  });

  it("não soma o pai repetido na explosão do ERP (a mesma ligação aparece uma vez por ocorrência do pai)", () => {
    const arvore = no("1000", "Fabricado", [
      no("2000", "Fabricado", [no("3000", "Comprado"), no("3000", "Comprado")]),
      no("2000", "Fabricado", [no("3000", "Comprado"), no("3000", "Comprado")]),
    ]);
    const erp = [
      linha("1", "1000", "2000", 2),
      linha("1.1", "2000", "3000", 2),
      /* segunda ocorrência do 2000 em outro ramo da explosão */
      linha("2", "1000", "9000", 1),
      linha("2.1", "9000", "2000", 1),
      linha("2.1.1", "2000", "3000", 2),
    ];

    expect(compararEstrutura(arvore, erp).divergencias).toEqual([]);
  });

  it("soma linhas válidas do mesmo filho na mesma ocorrência e ignora as vencidas", () => {
    const arvore = no("1000", "Fabricado", [no("3000", "Comprado"), no("3000", "Comprado"), no("3000", "Comprado")]);
    const erp = [linha("1", "1000", "3000", 2), linha("2", "1000", "3000", 1), linha("3", "1000", "3000", 5, "INVALIDO")];

    expect(compararEstrutura(arvore, erp).divergencias).toEqual([]);
  });

  it("não confere QTDE fracionada (peça em metro, kg...)", () => {
    const arvore = no("1000", "Fabricado", [no("4000", "Fabricado")]);
    expect(compararEstrutura(arvore, [linha("1", "1000", "4000", 2.5)]).divergencias).toEqual([]);
  });

  it("nó vindo do ERP conta pela quantidade que traz, não como uma peça", () => {
    const arvore = no("1000", "Fabricado", [no("3000", "Comprado", [], 4)]);
    expect(compararEstrutura(arvore, [linha("1", "1000", "3000", 4)]).divergencias).toEqual([]);
  });

  it("ligação ausente continua como 'ausente', sem divergência de quantidade junto", () => {
    const filho = no("5000", "Fabricado");
    const resultado = compararEstrutura(no("1000", "Fabricado", [filho]), []);
    expect(resultado.porNo.get(filho.id)).toEqual({ tipo: "ausente" });
    expect(resultado.divergencias).toHaveLength(1);
  });
});
