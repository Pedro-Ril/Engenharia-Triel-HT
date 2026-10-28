import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { TipoAprovacao } from "../tipos-aprovacao";
import {
  buscarDirecionamentosDaVez,
  decidirEtapa,
  iniciarFluxo,
  resolverAlcada,
  sqlNaVezDoUsuario,
  sqlParticipaDaCadeia,
} from "./fluxo";

/*
 * Teste de integração do motor contra o SQL Server de verdade
 * (npm run test:integracao). Tudo roda dentro de UMA transação que é
 * desfeita no fim: nada fica gravado. Usa um tipo fictício para não
 * cruzar com as alçadas reais.
 */

const TIPO = "teste_alcada" as TipoAprovacao;
const ITEM = "AAAAAAAA-0000-0000-0000-000000000001";

let transacao: sql.Transaction;
let gerente: { id: string; nome: string };
let diretor: { id: string; nome: string };
let intruso: { id: string; nome: string };
let nivelDiretoria40: string;

beforeAll(async () => {
  const pool = await getSqlServerPool();
  transacao = new sql.Transaction(pool);
  await transacao.begin();

  const usuarios = await new sql.Request(transacao).query<{ id: string; nome: string }>(`
    SELECT TOP 3 CONVERT(VARCHAR(36), [id]) AS [id], [nome_exibicao] AS [nome]
    FROM dbo.portal_usuarios WHERE [ativo] = 1 ORDER BY [nome_exibicao];
  `);
  [gerente, diretor, intruso] = usuarios.recordset;

  /* Alçada padrão do tipo (2 níveis) e uma específica da empresa 30 (1 nível). */
  const criar = async (empresa: number | null, niveis: { nome: string; usuario: string }[]) => {
    const alcada = await new sql.Request(transacao)
      .input("tipo", sql.VarChar(40), TIPO)
      .input("empresa", sql.Int, empresa)
      .query<{ id: string }>(`
        INSERT INTO dbo.portal_alcadas ([tipo], [empresa]) OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        VALUES (@tipo, @empresa);
      `);
    for (const [i, nivel] of niveis.entries()) {
      const criado = await new sql.Request(transacao)
        .input("alcadaId", sql.UniqueIdentifier, alcada.recordset[0].id)
        .input("ordem", sql.Int, i + 1)
        .input("nome", sql.NVarChar(100), nivel.nome)
        .query<{ id: string }>(`
          INSERT INTO dbo.portal_alcadas_niveis ([alcada_id], [ordem], [nome]) OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
          VALUES (@alcadaId, @ordem, @nome);
        `);
      await new sql.Request(transacao)
        .input("nivelId", sql.UniqueIdentifier, criado.recordset[0].id)
        .input("usuarioId", sql.UniqueIdentifier, nivel.usuario)
        .query(`INSERT INTO dbo.portal_alcadas_niveis_usuarios ([nivel_id], [usuario_id]) VALUES (@nivelId, @usuarioId);`);
    }
  };

  await criar(null, [
    { nome: "Gerente", usuario: gerente.id },
    { nome: "Diretor", usuario: diretor.id },
  ]);
  await criar(30, [{ nome: "Diretor Usitec", usuario: diretor.id }]);

  /* Empresa 40: Nível 2 com duas pessoas, para o direcionamento. */
  const alcada40 = await new sql.Request(transacao)
    .input("tipo", sql.VarChar(40), TIPO)
    .query<{ id: string }>(`
      INSERT INTO dbo.portal_alcadas ([tipo], [empresa]) OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id] VALUES (@tipo, 40);
    `);
  for (const [ordem, nome, pessoas] of [
    [1, "Gerência 40", [gerente.id]],
    [2, "Diretoria 40", [diretor.id, intruso.id]],
  ] as const) {
    const nivel = await new sql.Request(transacao)
      .input("alcadaId", sql.UniqueIdentifier, alcada40.recordset[0].id)
      .input("ordem", sql.Int, ordem)
      .input("nome", sql.NVarChar(100), nome)
      .query<{ id: string }>(`
        INSERT INTO dbo.portal_alcadas_niveis ([alcada_id], [ordem], [nome]) OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        VALUES (@alcadaId, @ordem, @nome);
      `);
    if (ordem === 2) nivelDiretoria40 = nivel.recordset[0].id;
    for (const pessoa of pessoas) {
      await new sql.Request(transacao)
        .input("nivelId", sql.UniqueIdentifier, nivel.recordset[0].id)
        .input("usuarioId", sql.UniqueIdentifier, pessoa)
        .query(`INSERT INTO dbo.portal_alcadas_niveis_usuarios ([nivel_id], [usuario_id]) VALUES (@nivelId, @usuarioId);`);
    }
  }
});

afterAll(async () => {
  await transacao?.rollback();
});

async function etapas(item: string) {
  const r = await new sql.Request(transacao)
    .input("item", sql.UniqueIdentifier, item)
    .query<{ ciclo: number; ordem: number; nivel_nome: string; status: string }>(`
      SELECT [ciclo], [ordem], [nivel_nome], [status] FROM dbo.portal_aprovacoes_etapas
      WHERE [item_id] = @item ORDER BY [ciclo], [ordem];
    `);
  return r.recordset.map((e) => `${e.ciclo}.${e.ordem} ${e.nivel_nome}: ${e.status}`);
}

async function historico(item: string) {
  const r = await new sql.Request(transacao)
    .input("item", sql.UniqueIdentifier, item)
    .query<{ acao: string; nivel_nome: string | null }>(`
      SELECT [acao], [nivel_nome] FROM dbo.portal_aprovacoes_historico WHERE [item_id] = @item ORDER BY [criado_em], [acao];
    `);
  return r.recordset.map((h) => (h.nivel_nome ? `${h.acao} (${h.nivel_nome})` : h.acao));
}

describe("motor de alçadas no banco real", () => {
  it("escolhe a alçada específica da empresa e cai na padrão para as outras", async () => {
    expect((await resolverAlcada(transacao, TIPO, { empresa: 30, setor: null }))?.niveis.map((n) => n.nome)).toEqual([
      "Diretor Usitec",
    ]);
    expect((await resolverAlcada(transacao, TIPO, { empresa: 2, setor: null }))?.niveis.map((n) => n.nome)).toEqual([
      "Gerente",
      "Diretor",
    ]);
  });

  it("cadeia completa: envio, nível 1, nível 2, aprovado", async () => {
    await iniciarFluxo(transacao, {
      tipo: TIPO,
      itemId: ITEM,
      contexto: { empresa: 2, setor: null },
      usuario: { id: null, nome: "TESTE" },
    });
    expect(await etapas(ITEM)).toEqual(["1.1 Gerente: pendente", "1.2 Diretor: aguardando"]);

    /* O diretor não decide antes do gerente. */
    await expect(
      decidirEtapa(transacao, { tipo: TIPO, itemId: ITEM, usuario: diretor, acao: "aprovar", comentario: null })
    ).rejects.toThrow(/nível "Gerente"/);

    const n1 = await decidirEtapa(transacao, { tipo: TIPO, itemId: ITEM, usuario: gerente, acao: "aprovar", comentario: "ok" });
    expect(n1).toMatchObject({ resultado: "avancou", nivelNome: "Gerente", proximoNivel: "Diretor" });

    const n2 = await decidirEtapa(transacao, { tipo: TIPO, itemId: ITEM, usuario: diretor, acao: "aprovar", comentario: null });
    expect(n2).toMatchObject({ resultado: "aprovado", nivelNome: "Diretor", proximoNivel: null });

    expect(await etapas(ITEM)).toEqual(["1.1 Gerente: aprovado", "1.2 Diretor: aprovado"]);
    /* Os dois registros do último nível saem no mesmo instante: compara sem depender da ordem entre eles. */
    expect((await historico(ITEM)).sort()).toEqual(
      ["enviado", "aprovado_nivel (Gerente)", "aprovado_nivel (Diretor)", "aprovado (Diretor)"].sort()
    );

    /* Terminou: não há mais o que decidir. */
    await expect(
      decidirEtapa(transacao, { tipo: TIPO, itemId: ITEM, usuario: diretor, acao: "aprovar", comentario: null })
    ).rejects.toThrow(ValidationError);
  });

  it("devolução encerra o ciclo e o reenvio recomeça do nível 1", async () => {
    const item = "AAAAAAAA-0000-0000-0000-000000000002";
    await iniciarFluxo(transacao, { tipo: TIPO, itemId: item, contexto: { empresa: 2, setor: null }, usuario: { id: null, nome: "TESTE" } });
    await decidirEtapa(transacao, { tipo: TIPO, itemId: item, usuario: gerente, acao: "aprovar", comentario: null });
    const dev = await decidirEtapa(transacao, { tipo: TIPO, itemId: item, usuario: diretor, acao: "devolver", comentario: "ajustar" });
    expect(dev.resultado).toBe("devolvido");

    const reenvio = await iniciarFluxo(transacao, {
      tipo: TIPO,
      itemId: item,
      contexto: { empresa: 2, setor: null },
      usuario: { id: null, nome: "TESTE" },
    });
    expect(reenvio.ciclo).toBe(2);
    expect(await etapas(item)).toEqual([
      "1.1 Gerente: aprovado",
      "1.2 Diretor: devolvido",
      "2.1 Gerente: pendente",
      "2.2 Diretor: aguardando",
    ]);
  });

  it("quem não está no nível não decide", async () => {
    const item = "AAAAAAAA-0000-0000-0000-000000000003";
    await iniciarFluxo(transacao, { tipo: TIPO, itemId: item, contexto: { empresa: 2, setor: null }, usuario: { id: null, nome: "TESTE" } });
    await expect(
      decidirEtapa(transacao, { tipo: TIPO, itemId: item, usuario: intruso, acao: "aprovar", comentario: null })
    ).rejects.toThrow(/não faz parte/);
  });

  it("sem alçada que case, o envio é recusado", async () => {
    await expect(
      iniciarFluxo(transacao, {
        tipo: "outro_tipo" as TipoAprovacao,
        itemId: "AAAAAAAA-0000-0000-0000-000000000004",
        contexto: { empresa: 2, setor: null },
        usuario: { id: null, nome: "TESTE" },
      })
    ).rejects.toThrow(/Não há alçada/);
  });

  it("o nível 2 só vê o item depois que o nível 1 aprova", async () => {
    const item = "AAAAAAAA-0000-0000-0000-000000000005";
    await iniciarFluxo(transacao, { tipo: TIPO, itemId: item, contexto: { empresa: 2, setor: null }, usuario: { id: null, nome: "TESTE" } });

    const enxerga = async (usuarioId: string) => {
      const r = await new sql.Request(transacao)
        .input("usuarioId", sql.UniqueIdentifier, usuarioId)
        .input("item", sql.UniqueIdentifier, item)
        .query<{ na_vez: number; historico: number }>(`
          SELECT
            CASE WHEN ${sqlNaVezDoUsuario("@item")} THEN 1 ELSE 0 END AS [na_vez],
            CASE WHEN ${sqlParticipaDaCadeia("@item")} THEN 1 ELSE 0 END AS [historico];
        `);
      return r.recordset[0];
    };

    /* Parado no nível 1: o gerente vê como pendente; o diretor não vê nem no histórico. */
    expect(await enxerga(gerente.id)).toEqual({ na_vez: 1, historico: 1 });
    expect(await enxerga(diretor.id)).toEqual({ na_vez: 0, historico: 0 });

    await decidirEtapa(transacao, { tipo: TIPO, itemId: item, usuario: gerente, acao: "aprovar", comentario: null });

    /* Subiu: sai da fila do gerente (fica no histórico dele) e entra na do diretor. */
    expect(await enxerga(gerente.id)).toEqual({ na_vez: 0, historico: 1 });
    expect(await enxerga(diretor.id)).toEqual({ na_vez: 1, historico: 1 });

    /* Devolvido no nível 1 de outro item: o diretor nunca chega a vê-lo. */
    const outro = "AAAAAAAA-0000-0000-0000-000000000006";
    await iniciarFluxo(transacao, { tipo: TIPO, itemId: outro, contexto: { empresa: 2, setor: null }, usuario: { id: null, nome: "TESTE" } });
    await decidirEtapa(transacao, { tipo: TIPO, itemId: outro, usuario: gerente, acao: "devolver", comentario: "ajustar" });
    const diretorVeOutro = await new sql.Request(transacao)
      .input("usuarioId", sql.UniqueIdentifier, diretor.id)
      .input("item", sql.UniqueIdentifier, outro)
      .query<{ v: number }>(`SELECT CASE WHEN ${sqlParticipaDaCadeia("@item")} THEN 1 ELSE 0 END AS [v];`);
    expect(diretorVeOutro.recordset[0].v).toBe(0);
  });

  it("sugestão de direcionamento: regra por centro de custo e por empresa, só para quem está na vez", async () => {
    const item = "AAAAAAAA-0000-0000-0000-000000000008";
    await iniciarFluxo(transacao, { tipo: TIPO, itemId: item, contexto: { empresa: 40, setor: null }, usuario: { id: null, nome: "TESTE" } });

    const alcada40 = await new sql.Request(transacao)
      .input("nivelId", sql.UniqueIdentifier, nivelDiretoria40)
      .query<{ id: string }>(`SELECT CONVERT(VARCHAR(36), [alcada_id]) AS [id] FROM dbo.portal_alcadas_niveis WHERE [id] = @nivelId;`);
    for (const [ordem, centros, pessoa] of [
      [1, "90.02, 90.90", diretor.id],
      [2, null, null],
    ] as const) {
      await new sql.Request(transacao)
        .input("alcadaId", sql.UniqueIdentifier, alcada40.recordset[0].id)
        .input("nivelId", sql.UniqueIdentifier, nivelDiretoria40)
        .input("centros", sql.NVarChar(400), centros)
        .input("usuarioId", sql.UniqueIdentifier, pessoa)
        .input("ordem", sql.Int, ordem)
        .query(`
          INSERT INTO dbo.portal_alcadas_sugestoes ([alcada_id], [nivel_id], [empresa], [centros_custo], [usuario_id], [ordem])
          VALUES (@alcadaId, @nivelId, 40, @centros, @usuarioId, @ordem);
        `);
    }

    const sugerir = (usuarioId: string, centrosCustoItens: string[]) =>
      buscarDirecionamentosDaVez(
        { usuarioId, contextos: new Map([[item, { empresa: 40, centrosCustoItens }]]) },
        transacao
      );

    /* Maioria dos itens em 90.02/90.90: o diretor; as opções são as pessoas do Nível 2. */
    const [comCentro] = await sugerir(gerente.id, ["9002204", "9090582", "5500"]);
    expect(comCentro.proximoNivel).toBe("Diretoria 40");
    expect(comCentro.sugestao?.id).toBe(diretor.id);
    expect(comCentro.opcoes.map((o) => o.id).sort()).toEqual([diretor.id, intruso.id].sort());

    /* Sem a maioria: a regra só da empresa, "todos do nível". */
    const [semCentro] = await sugerir(gerente.id, ["9002204", "5500"]);
    expect(semCentro.sugestao).toBeNull();

    /* Quem não está na vez (o Nível 2, antes do Nível 1 aprovar) não tem o que direcionar. */
    expect(await sugerir(diretor.id, ["9002204"])).toEqual([]);

    /* Aprovando com a sugestão, só o diretor fica com o item. */
    const n1 = await decidirEtapa(transacao, {
      tipo: TIPO,
      itemId: item,
      usuario: gerente,
      acao: "aprovar",
      comentario: null,
      direcionarPara: comCentro.sugestao!.id,
    });
    expect(n1.direcionadoPara).toBe(diretor.nome);

    /* No último nível não há próximo: nada a direcionar. */
    expect(await sugerir(diretor.id, ["9002204"])).toEqual([]);
  });

  it("direcionado: só o escolhido vê e decide; saindo do nível, volta para todos", async () => {
    const item = "AAAAAAAA-0000-0000-0000-000000000007";
    await iniciarFluxo(transacao, { tipo: TIPO, itemId: item, contexto: { empresa: 40, setor: null }, usuario: { id: null, nome: "TESTE" } });

    /* Direcionar para quem não é do Nível 2 é recusado. */
    await expect(
      decidirEtapa(transacao, { tipo: TIPO, itemId: item, usuario: gerente, acao: "aprovar", comentario: null, direcionarPara: gerente.id })
    ).rejects.toThrow(/Só dá para direcionar para alguém do nível/);

    const n1 = await decidirEtapa(transacao, {
      tipo: TIPO,
      itemId: item,
      usuario: gerente,
      acao: "aprovar",
      comentario: null,
      direcionarPara: diretor.id,
    });
    expect(n1.direcionadoPara).toBe(diretor.nome);

    const vez = async (usuarioId: string) => {
      const r = await new sql.Request(transacao)
        .input("usuarioId", sql.UniqueIdentifier, usuarioId)
        .input("item", sql.UniqueIdentifier, item)
        .query<{ v: number }>(`SELECT CASE WHEN ${sqlNaVezDoUsuario("@item")} THEN 1 ELSE 0 END AS [v];`);
      return r.recordset[0].v;
    };

    /* O outro do Nível 2 não vê nem decide. */
    expect(await vez(diretor.id)).toBe(1);
    expect(await vez(intruso.id)).toBe(0);
    await expect(
      decidirEtapa(transacao, { tipo: TIPO, itemId: item, usuario: intruso, acao: "aprovar", comentario: null })
    ).rejects.toThrow(/direcionada a outra pessoa/);

    /* O escolhido sai do nível: volta para todos. */
    await new sql.Request(transacao)
      .input("nivelId", sql.UniqueIdentifier, nivelDiretoria40)
      .input("usuarioId", sql.UniqueIdentifier, diretor.id)
      .query(`DELETE FROM dbo.portal_alcadas_niveis_usuarios WHERE [nivel_id] = @nivelId AND [usuario_id] = @usuarioId;`);
    expect(await vez(intruso.id)).toBe(1);

    const final = await decidirEtapa(transacao, { tipo: TIPO, itemId: item, usuario: intruso, acao: "aprovar", comentario: null });
    expect(final.resultado).toBe("aprovado");
    expect(await historico(item)).toContain("direcionado (Diretoria 40)");
  });
});
