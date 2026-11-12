import { describe, expect, it } from "vitest";

import type { PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import {
  SEM_DEPARTAMENTO,
  executarEmLotes,
  filtrarUsuarios,
  listarDepartamentos,
  usuarioCombinaBusca,
} from "./permissoesFiltros";

function usuario(id: string, nome: string, departamento: string | null, login = id): PortalUsuarioAdmin {
  return {
    id,
    samAccountName: login,
    nomeExibicao: nome,
    email: `${login}@empresa.com`,
    codigoEmpresa: null,
    departamento,
    ehAdministrador: false,
    ativo: true,
    sessaoInvalidadaEm: null,
    ultimoLoginEm: null,
    ultimaAtividadeEm: null,
  };
}

const joao = usuario("1", "João Ávila", "Engenharia Agro", "joao.avila");
const maria = usuario("2", "Maria Souza", "PCP Agro", "maria.souza");
const ana = usuario("3", "Ana Lima", null, "ana.lima");
const todos = [joao, maria, ana];

describe("usuarioCombinaBusca", () => {
  it("ignora acento e maiúscula", () => {
    expect(usuarioCombinaBusca(joao, "JOAO avila")).toBe(true);
  });

  it("exige todas as palavras, em qualquer campo", () => {
    expect(usuarioCombinaBusca(joao, "joao eng")).toBe(true);
    expect(usuarioCombinaBusca(joao, "joao pcp")).toBe(false);
  });

  it("acha pelo login e pelo e-mail", () => {
    expect(usuarioCombinaBusca(maria, "maria.souza")).toBe(true);
    expect(usuarioCombinaBusca(maria, "@empresa")).toBe(true);
  });

  it("busca vazia combina com todos", () => {
    expect(usuarioCombinaBusca(ana, "   ")).toBe(true);
  });
});

describe("listarDepartamentos", () => {
  it("ordena e deixa 'sem departamento' por último", () => {
    expect(listarDepartamentos(todos)).toEqual(["Engenharia Agro", "PCP Agro", SEM_DEPARTAMENTO]);
  });
});

describe("filtrarUsuarios", () => {
  const totalPorUsuario = new Map([["1", 3]]);

  it("filtra por departamento, incluindo quem não tem", () => {
    expect(filtrarUsuarios(todos, { busca: "", departamento: "PCP Agro", acesso: "todos", totalPorUsuario })).toEqual([maria]);
    expect(filtrarUsuarios(todos, { busca: "", departamento: SEM_DEPARTAMENTO, acesso: "todos", totalPorUsuario })).toEqual([ana]);
  });

  it("filtra por ter ou não algum acesso", () => {
    expect(filtrarUsuarios(todos, { busca: "", departamento: "", acesso: "com", totalPorUsuario })).toEqual([joao]);
    expect(filtrarUsuarios(todos, { busca: "", departamento: "", acesso: "sem", totalPorUsuario })).toEqual([maria, ana]);
  });

  it("combina busca e filtros", () => {
    expect(filtrarUsuarios(todos, { busca: "agro", departamento: "", acesso: "sem", totalPorUsuario })).toEqual([maria]);
  });
});

describe("executarEmLotes", () => {
  it("respeita o limite de paralelismo e mantém a ordem", async () => {
    let emAndamento = 0;
    let maximo = 0;

    const resultados = await executarEmLotes([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      emAndamento++;
      maximo = Math.max(maximo, emAndamento);
      await new Promise((resolve) => setTimeout(resolve, 5 * (8 - n)));
      emAndamento--;
      return n * 10;
    });

    expect(resultados).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(maximo).toBe(3);
  });

  it("lista vazia não roda nada", async () => {
    expect(await executarEmLotes([], 4, async () => 1)).toEqual([]);
  });
});
