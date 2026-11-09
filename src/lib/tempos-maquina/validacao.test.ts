import { describe, expect, it } from "vitest";

import { corteCncParaForm, formParaCorteCnc, formParaTabela, tabelaParaForm } from "@/modules/tempos-maquina/utils/perfil-form";

import { identificarMaterial } from "./materiais";
import { PERFIS_REFERENCIA_PLANILHAS as REF } from "./referencia-planilhas";
import type { PerfilTempo } from "./tipos";
import { validarParametrosPerfil } from "./validacao";

const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("validarParametrosPerfil", () => {
  it("aceita os perfis de referência sem mudar nada", () => {
    for (const { perfil } of Object.values(REF)) {
      expect(validarParametrosPerfil(perfil.metodo, copia(perfil))).toEqual(
        perfil.metodo === "corte_cnc"
          ? { ...perfil, linhas: [...perfil.linhas].sort((a, b) => a.variante.localeCompare(b.variante) || a.espessuraMm - b.espessuraMm) }
          : perfil
      );
    }
  });

  it("recusa variante que não existe, espessura repetida e velocidade zero", () => {
    const base = copia(REF.plasmaOxipira.perfil);

    expect(() => validarParametrosPerfil("corte_cnc", { ...base, linhas: [{ ...base.linhas[0], variante: "999A" }] })).toThrow("Variante inválida");
    expect(() => validarParametrosPerfil("corte_cnc", { ...base, linhas: [base.linhas[0], base.linhas[0]] })).toThrow("repetida");
    expect(() => validarParametrosPerfil("corte_cnc", { ...base, linhas: [{ ...base.linhas[0], velocidadeMmMin: 0 }] })).toThrow("maior que zero");
  });

  it("recusa matriz do tamanho errado e degraus fora de ordem", () => {
    const base = copia(REF.guilhotina.perfil);
    const faixa = base.faixas[0];

    expect(() => validarParametrosPerfil("tabela_dimensao", { ...base, faixas: [{ ...faixa, tempos: faixa.tempos.slice(1) }] })).toThrow("uma linha de tempos por largura");
    expect(() => validarParametrosPerfil("tabela_dimensao", { ...base, faixas: [{ ...faixa, larguras: [...faixa.larguras].reverse() }] })).toThrow("crescentes");
  });

  it("aceita número com vírgula e gera a chave pelo nome", () => {
    const base = copia(REF.laserByspeed.perfil);
    const perfil = validarParametrosPerfil("corte_cnc", {
      ...base,
      entradaSaidaMm: "4,5",
      temposPorChapa: [{ rotulo: "Retirar peças", minutos: "0,12" }],
    }) as Extract<PerfilTempo, { metodo: "corte_cnc" }>;

    expect(perfil.entradaSaidaMm).toBe(4.5);
    expect(perfil.temposPorChapa).toEqual([{ chave: "retirar_pecas", rotulo: "Retirar peças", minutos: 0.12 }]);
  });

  it("método desconhecido não passa", () => {
    expect(() => validarParametrosPerfil("outro", {})).toThrow("Método de cálculo inválido");
  });
});

describe("formulário do editor (ida e volta)", () => {
  it("os perfis de referência voltam iguais depois de passar pelo formulário", () => {
    for (const { perfil } of Object.values(REF)) {
      const volta = validarParametrosPerfil(
        perfil.metodo,
        perfil.metodo === "corte_cnc" ? formParaCorteCnc(corteCncParaForm(perfil)) : formParaTabela(tabelaParaForm(perfil))
      );
      const original = validarParametrosPerfil(perfil.metodo, copia(perfil));

      /* Pierce/espera passam por segundos com 4 casas: compara com tolerância. */
      expect(JSON.stringify(volta, (_, v) => (typeof v === "number" ? Number(v.toFixed(9)) : v))).toBe(
        JSON.stringify(original, (_, v) => (typeof v === "number" ? Number(v.toFixed(9)) : v))
      );
    }
  });
});

describe("identificarMaterial", () => {
  const materiais = [
    { nome: "Aço inox", termos: "INOX", ativo: true, ordem: 10 },
    { nome: "Alumínio", termos: "ALUMINIO, ALUM", ativo: true, ordem: 20 },
    { nome: "Aço carbono", termos: "ACO, ASTM, SAE, CARBONO", ativo: true, ordem: 40 },
    { nome: "Desligado", termos: "CHAPA", ativo: false, ordem: 1 },
  ];

  it("vale o primeiro na ordem, sem acento e pelo começo da palavra", () => {
    expect(identificarMaterial("CHAPA DE AÇO INOX 304  4,00 X 1500 X 3000 MM", materiais)?.nome).toBe("Aço inox");
    expect(identificarMaterial("CHAPA DE ALUMINIO LISO 5052-O 3,00 X 1500", materiais)?.nome).toBe("Alumínio");
    expect(identificarMaterial("CHAPA DE ACO ASTM A 36  4,76 X 1500 X 3000 MM", materiais)?.nome).toBe("Aço carbono");
  });

  it("não reconhece pedaço no meio da palavra nem material inativo", () => {
    expect(identificarMaterial("CHAPA POLYSTONE P COPOLYMER", materiais)).toBeNull();
    expect(identificarMaterial("TRIACO", materiais)).toBeNull();
  });
});
