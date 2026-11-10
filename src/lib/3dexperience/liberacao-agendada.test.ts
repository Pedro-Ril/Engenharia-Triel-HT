import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * O agendador da liberação agendada, com banco, 3DX, AD e e-mail trocados
 * por mocks: cada passada (processarLiberacoesAgendadas) tem que levar o
 * fluxo para a etapa certa, liberar só o que deve, nunca sem senha, e
 * mandar o e-mail final uma vez só.
 */

const mocks = vi.hoisted(() => ({
  fluxos: [] as Record<string, unknown>[],
  aviso: { jaAvisado: false },
  queries: [] as string[],
  buscarRodada: vi.fn(),
  executarSimulacao: vi.fn(),
  iniciarLiberacao: vi.fn(),
  rodadaEmAndamento: vi.fn(),
  buscarUsuarioPorId: vi.fn(),
  enviarEmail: vi.fn(),
}));

vi.mock("@/lib/database/sql-server", () => ({
  sql: { UniqueIdentifier: "uid", Bit: "bit", Int: "int", NVarChar: () => "nvarchar", VarChar: () => "varchar" },
  getSqlServerPool: async () => ({
    request: () => {
      const req = {
        input: () => req,
        query: async (texto: string) => {
          mocks.queries.push(texto);
          if (texto.includes("r.[automatica] = 1")) return { recordset: mocks.fluxos };
          if (texto.includes("[notificado_em] = SYSDATETIME()")) {
            const ok = !mocks.aviso.jaAvisado;
            mocks.aviso.jaAvisado = true;
            return { rowsAffected: [ok ? 1 : 0] };
          }
          return { rowsAffected: [1], recordset: [] };
        },
      };
      return req;
    },
  }),
}));

vi.mock("./liberacao-desenhos", () => ({
  buscarRodada: mocks.buscarRodada,
  executarSimulacao: mocks.executarSimulacao,
  iniciarLiberacao: mocks.iniciarLiberacao,
  rodadaEmAndamento: mocks.rodadaEmAndamento,
}));
vi.mock("@/lib/auth/usuarios", () => ({ buscarUsuarioPorId: mocks.buscarUsuarioPorId }));
vi.mock("@/lib/chamados/chamados-config", () => ({ buscarConfigChamados: async () => ({ urlPublica: "http://portal" }) }));
vi.mock("@/lib/monitoramento/logs", () => ({ registrarLog: async () => {} }));
vi.mock("@/lib/smtp/enviar-email", () => ({ enviarEmail: mocks.enviarEmail }));

import { descartarSenhaAgendada, guardarSenhaAgendada, processarLiberacoesAgendadas } from "./liberacao-agendada";

const SIM = "11111111-1111-1111-1111-111111111111";
const LIB = "22222222-2222-2222-2222-222222222222";
const USUARIO = { id: "u1", samAccountName: "fulano", nomeExibicao: "Fulano", email: "fulano@x", ehAdministrador: false, ativo: true };

function fluxo(campos: Record<string, unknown>) {
  return { id: SIM, codigo_pai: "300419", status: "agendada", usuario_id: "u1", liberacao_id: null, na_hora: 1, minutos_desde_inicio: 0, ...campos };
}

function rodada(campos: Record<string, unknown> = {}) {
  return {
    rodada: { id: SIM, codigoPai: "300419", dryRun: true, status: "concluida", mensagem: null, automatica: true, notificadoEm: null, liberacaoId: null, ...campos },
    desenhos: [
      { desenhoPhysicalId: "D1", itemCodigo: "311", desenhoTitulo: "311", acao: "seria_liberado", itemRevisao: "A", desenhoRevisao: "A", mensagem: null },
      { desenhoPhysicalId: "D2", itemCodigo: "310", desenhoTitulo: "310", acao: "ja_liberado", itemRevisao: "A", desenhoRevisao: "A", mensagem: null },
      { desenhoPhysicalId: "D3", itemCodigo: "307748", desenhoTitulo: "F0298804_novo", acao: "seria_liberado", itemRevisao: "A", desenhoRevisao: "A", mensagem: null },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fluxos = [];
  mocks.aviso.jaAvisado = false;
  mocks.queries = [];
  mocks.rodadaEmAndamento.mockResolvedValue(null);
  mocks.buscarUsuarioPorId.mockResolvedValue(USUARIO);
  mocks.enviarEmail.mockResolvedValue(undefined);
  mocks.iniciarLiberacao.mockResolvedValue(LIB);
  descartarSenhaAgendada(SIM);
});

describe("liberação agendada: agendador", () => {
  it("antes da hora não faz nada; na hora começa a simulação (uma por vez)", async () => {
    mocks.fluxos = [fluxo({ na_hora: 0 })];
    await processarLiberacoesAgendadas();
    expect(mocks.executarSimulacao).not.toHaveBeenCalled();

    mocks.fluxos = [fluxo({}), fluxo({ id: "outra", codigo_pai: "300420" })];
    await processarLiberacoesAgendadas();
    expect(mocks.executarSimulacao).toHaveBeenCalledTimes(1);
    expect(mocks.executarSimulacao).toHaveBeenCalledWith(SIM, "300419");
  });

  it("espera a vez se o 3DX estiver ocupado", async () => {
    mocks.rodadaEmAndamento.mockResolvedValue({ codigo_pai: "999", usuario_nome: "Outro" });
    mocks.fluxos = [fluxo({})];
    await processarLiberacoesAgendadas();
    expect(mocks.executarSimulacao).not.toHaveBeenCalled();
    expect(mocks.enviarEmail).not.toHaveBeenCalled();
  });

  it("simulação pronta: libera tudo menos título diferente, com a senha guardada (e apaga a senha)", async () => {
    guardarSenhaAgendada(SIM, "segredo");
    mocks.fluxos = [fluxo({ status: "processando" })];
    mocks.buscarRodada.mockResolvedValue(rodada());

    await processarLiberacoesAgendadas();
    expect(mocks.iniciarLiberacao).toHaveBeenCalledWith(SIM, ["D1"], USUARIO, "segredo", { automatica: true });

    /* A senha serviu para uma tentativa só: na próxima não há mais. */
    mocks.iniciarLiberacao.mockClear();
    mocks.fluxos = [fluxo({ status: "concluida" })];
    await processarLiberacoesAgendadas();
    expect(mocks.iniciarLiberacao).not.toHaveBeenCalled();
    expect(mocks.enviarEmail).toHaveBeenCalledTimes(1);
    expect(mocks.enviarEmail.mock.calls[0][0].assunto).toMatch(/nada foi liberado/);
  });

  it("sem senha na memória (servidor reiniciado): não libera e avisa", async () => {
    mocks.fluxos = [fluxo({ status: "concluida" })];
    mocks.buscarRodada.mockResolvedValue(rodada());

    await processarLiberacoesAgendadas();
    expect(mocks.iniciarLiberacao).not.toHaveBeenCalled();
    const email = mocks.enviarEmail.mock.calls[0][0];
    expect(email.destinatario).toBe("fulano@x");
    expect(email.corpoTexto).toMatch(/senha não estava mais/);
    /* Nada foi liberado: não lista "ficaram de fora" (tudo ficou). */
    expect(email.corpoTexto).not.toMatch(/F0298804_novo/);
  });

  it("só título diferente em trabalho: avisa e lista quais", async () => {
    guardarSenhaAgendada(SIM, "segredo");
    mocks.fluxos = [fluxo({ status: "concluida" })];
    const soDiferente = rodada();
    soDiferente.desenhos = soDiferente.desenhos.filter((x) => x.desenhoPhysicalId !== "D1");
    mocks.buscarRodada.mockResolvedValue(soDiferente);

    await processarLiberacoesAgendadas();
    expect(mocks.iniciarLiberacao).not.toHaveBeenCalled();
    expect(mocks.enviarEmail.mock.calls[0][0].corpoTexto).toMatch(/F0298804_novo/);
  });

  it("administrador do Portal libera sem senha", async () => {
    mocks.buscarUsuarioPorId.mockResolvedValue({ ...USUARIO, ehAdministrador: true });
    mocks.fluxos = [fluxo({ status: "concluida" })];
    mocks.buscarRodada.mockResolvedValue(rodada());

    await processarLiberacoesAgendadas();
    expect(mocks.iniciarLiberacao).toHaveBeenCalledWith(SIM, ["D1"], expect.objectContaining({ ehAdministrador: true }), null, { automatica: true });
  });

  it("erro na busca de desenhos trava a liberação", async () => {
    guardarSenhaAgendada(SIM, "segredo");
    mocks.fluxos = [fluxo({ status: "concluida" })];
    mocks.buscarRodada.mockResolvedValue(rodada({ mensagem: "Itens com erro na busca de desenhos: X" }));

    await processarLiberacoesAgendadas();
    expect(mocks.iniciarLiberacao).not.toHaveBeenCalled();
    expect(mocks.enviarEmail.mock.calls[0][0].corpoTexto).toMatch(/busca de desenhos deu erro/);
  });

  it("3DX recusa o login: avisa com o motivo, sem liberar", async () => {
    const { ValidationError } = await import("@/lib/auth/errors");
    guardarSenhaAgendada(SIM, "segredo");
    mocks.iniciarLiberacao.mockRejectedValue(new ValidationError("O 3DEXPERIENCE recusou o login: senha incorreta?"));
    mocks.fluxos = [fluxo({ status: "concluida" })];
    mocks.buscarRodada.mockResolvedValue(rodada());

    await processarLiberacoesAgendadas();
    expect(mocks.enviarEmail.mock.calls[0][0].corpoTexto).toMatch(/recusou o login/);
  });

  it("liberação terminada: e-mail com o resultado, uma vez só", async () => {
    mocks.fluxos = [fluxo({ status: "concluida", liberacao_id: LIB })];
    mocks.buscarRodada.mockImplementation(async (id: string) =>
      id === LIB
        ? {
            rodada: { id: LIB, codigoPai: "300419", dryRun: false, status: "concluida", mensagem: null },
            desenhos: [{ desenhoPhysicalId: "D1", itemCodigo: "311", desenhoTitulo: "311", acao: "liberado", mensagem: null }],
          }
        : rodada({ liberacaoId: LIB })
    );

    await processarLiberacoesAgendadas();
    await processarLiberacoesAgendadas();
    expect(mocks.enviarEmail).toHaveBeenCalledTimes(1);
    const email = mocks.enviarEmail.mock.calls[0][0];
    expect(email.assunto).toMatch(/1 desenho\(s\) liberado\(s\)/);
    expect(email.corpoTexto).toContain(`rodada=${LIB}`);
  });

  it("liberação ainda no 3DX: espera, sem e-mail", async () => {
    mocks.fluxos = [fluxo({ status: "concluida", liberacao_id: LIB, minutos_desde_inicio: 10 })];
    mocks.buscarRodada.mockImplementation(async (id: string) =>
      id === LIB ? { rodada: { id: LIB, status: "processando" }, desenhos: [] } : rodada({ liberacaoId: LIB })
    );
    await processarLiberacoesAgendadas();
    expect(mocks.enviarEmail).not.toHaveBeenCalled();
  });
});
