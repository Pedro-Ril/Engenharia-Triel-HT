import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Acompanhamento das rodadas no servidor (acompanharRodadasAbertas) e o
 * job que o 3DX perdeu (404): com banco e API do 3DX trocados por mocks.
 */

const mocks = vi.hoisted(() => ({
  queries: [] as { texto: string; inputs: Record<string, unknown> }[],
  abertas: [] as Record<string, unknown>[],
  rodadas: new Map<string, Record<string, unknown>>(),
  fetch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/sql-server", () => ({
  sql: { UniqueIdentifier: "uid", Bit: "bit", Int: "int", NVarChar: () => "nvarchar", VarChar: () => "varchar", MAX: -1 },
  getSqlServerPool: async () => ({
    request: () => {
      const inputs: Record<string, unknown> = {};
      const req = {
        input: (nome: string, _tipo: unknown, valor: unknown) => {
          inputs[nome] = valor;
          return req;
        },
        query: async (texto: string) => {
          mocks.queries.push({ texto, inputs: { ...inputs } });
          if (texto.includes("AS [parada]")) return { recordset: mocks.abertas };
          if (texto.includes("FROM dbo.portal_3dx_liberacoes AS r WHERE r.[id] = @id")) {
            const linha = mocks.rodadas.get(String(inputs.id));
            return { recordset: linha ? [linha] : [] };
          }
          if (texto.includes("FROM dbo.portal_3dx_liberacoes_desenhos WHERE [liberacao_id] = @id")) return { recordset: [] };
          return { recordset: [], rowsAffected: [1] };
        },
      };
      return req;
    },
  }),
}));

vi.stubGlobal("fetch", mocks.fetch);

import { acompanharRodadasAbertas, buscarRodada } from "./liberacao-desenhos";

const SIM = "11111111-1111-1111-1111-111111111111";
const LIB = "22222222-2222-2222-2222-222222222222";

function linha(id: string, campos: Record<string, unknown>) {
  return {
    id,
    codigo_pai: "294441",
    dry_run: true,
    simulacao_id: null,
    status: "processando",
    job_id: "job-1",
    total_itens: 1,
    total_desenhos: 1,
    total_em_trabalho: 1,
    total_liberados: null,
    total_erros: null,
    mensagem: null,
    usuario_nome: "Fulano",
    executado_como: null,
    criado_em: "2026-11-25T10:00:00",
    finalizado_em: null,
    liberacao_id: null,
    automatica: false,
    agendada_para: null,
    segundos_para_inicio: null,
    notificado_em: null,
    ...campos,
  };
}

function respostaJob(status: number, corpo: unknown) {
  return { ok: status < 400, status, json: async () => corpo };
}

function atualizacoesDaRodada(id: string) {
  return mocks.queries.filter((q) => q.texto.startsWith("UPDATE dbo.portal_3dx_liberacoes SET") && q.inputs.id === id);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries = [];
  mocks.abertas = [];
  mocks.rodadas.clear();
});

describe("job que o 3DX perdeu (404)", () => {
  it("simulação: fecha com erro pedindo para simular de novo", async () => {
    mocks.rodadas.set(SIM, linha(SIM, {}));
    mocks.fetch.mockResolvedValue(respostaJob(404, { success: false, message: "Job não encontrado (inexistente ou expirado)." }));

    await buscarRodada(SIM);
    const [update] = atualizacoesDaRodada(SIM);
    expect(update.inputs.status).toBe("erro");
    expect(String(update.inputs.mensagem)).toMatch(/Simule de novo/);
  });

  it("liberação: desenhos sem resultado ficam 'sem confirmação' e a rodada fecha com erro", async () => {
    mocks.rodadas.set(LIB, linha(LIB, { dry_run: false }));
    mocks.fetch.mockResolvedValue(respostaJob(404, { success: false, message: "Job não encontrado." }));

    await buscarRodada(LIB);
    expect(mocks.queries.some((q) => q.texto.includes("Sem confirmação do 3DX") && q.inputs.liberacaoId === LIB)).toBe(true);
    const [update] = atualizacoesDaRodada(LIB);
    expect(update.inputs.status).toBe("erro");
    expect(String(update.inputs.mensagem)).toMatch(/confira no 3DEXPERIENCE/);
  });

  it("3DX fora do ar (500): não mexe na rodada, tenta de novo depois", async () => {
    mocks.rodadas.set(SIM, linha(SIM, {}));
    mocks.fetch.mockResolvedValue(respostaJob(500, { message: "erro" }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await buscarRodada(SIM);
    expect(atualizacoesDaRodada(SIM)).toHaveLength(0);
  });
});

describe("acompanharRodadasAbertas", () => {
  it("rodada processando sem ninguém na tela: pergunta ao 3DX e grava o resultado", async () => {
    mocks.abertas = [{ id: SIM, status: "processando", parada: 0 }];
    mocks.rodadas.set(SIM, linha(SIM, {}));
    mocks.fetch.mockResolvedValue(
      respostaJob(200, { status: "done", resultados: [{ physicalId: "D1", acao: "seria_liberado", statusAntes: "IN_WORK" }] })
    );

    await acompanharRodadasAbertas();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("/desenhos/liberar/job/job-1"), expect.anything());
    const [update] = atualizacoesDaRodada(SIM);
    expect(update.inputs.status).toBe("concluida");
  });

  it("explosão parada além do prazo (Portal reiniciado no meio): fecha com erro", async () => {
    mocks.abertas = [{ id: SIM, status: "explodindo", parada: 1 }];

    await acompanharRodadasAbertas();
    const [update] = atualizacoesDaRodada(SIM);
    expect(update.inputs.status).toBe("erro");
    expect(String(update.inputs.mensagem)).toMatch(/parou no meio/);
  });

  it("explosão ainda dentro do prazo: não mexe", async () => {
    mocks.abertas = [{ id: SIM, status: "buscando_desenhos", parada: 0 }];

    await acompanharRodadasAbertas();
    expect(atualizacoesDaRodada(SIM)).toHaveLength(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
