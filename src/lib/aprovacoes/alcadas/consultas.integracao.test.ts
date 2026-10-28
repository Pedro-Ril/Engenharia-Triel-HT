import { beforeAll, describe, expect, it } from "vitest";

import { getSqlServerPool } from "@/lib/database/sql-server";

import {
  buscarItemPorId,
  buscarLotePorNumero,
  contarPendentesPorTipo,
  iniciarFluxosReajusteSemEtapa,
  listarItensPainel,
  listarMinhasSolicitacoes,
  listarSolicitacoesPainel,
} from "../aprovacoes";
import {
  buscarFluxoDoPedido,
  buscarPedidoDoDiretor,
  buscarSituacaoPedido,
  contarPedidosPendentes,
  iniciarFluxosSemEtapa,
  listarDecisoesPedidos,
  listarPedidosPainel,
} from "../pedidos-compra";
import { listarAlcadas, listarHistoricoAlcadas } from "./config";
import { buscarDirecionamentosDaVez, buscarFluxoDoItem, listarTiposDasAlcadasDoUsuario } from "./fluxo";

/*
 * Roda DE VERDADE, contra o banco real, todas as consultas dos módulos
 * que passaram a usar as alçadas -- o TypeScript não confere SQL, isto
 * confere (coluna, alias, parâmetro). Só leitura: as que tentam pôr
 * pendentes antigos numa alçada desfazem a própria transação quando
 * não há alçada, e o teste confere que nada mudou no banco.
 */

let usuarioId: string;
let algumItemReajuste: { id: string; numero: number } | null = null;
let algumPedido: { id: string; empresa: number; numero: number } | null = null;

async function contagens() {
  const pool = await getSqlServerPool();
  const r = await pool.request().query<{ etapas: number; historico: number; pendentes_reajuste: number; pendentes_pedido: number }>(`
    SELECT
      (SELECT COUNT(*) FROM dbo.portal_aprovacoes_etapas) AS [etapas],
      (SELECT COUNT(*) FROM dbo.portal_aprovacoes_historico) AS [historico],
      (SELECT COUNT(*) FROM dbo.portal_aprovacoes_aumento_salarial WHERE [status] = 'pendente') AS [pendentes_reajuste],
      (SELECT COUNT(*) FROM dbo.portal_aprovacoes_pedido_compra WHERE [status] = 'pendente') AS [pendentes_pedido];
  `);
  return r.recordset[0];
}

beforeAll(async () => {
  const pool = await getSqlServerPool();
  const u = await pool.request().query<{ id: string }>(`
    SELECT TOP 1 CONVERT(VARCHAR(36), [id]) AS [id] FROM dbo.portal_usuarios WHERE [sam_account_name] = 'pedro.ril';
  `);
  usuarioId = u.recordset[0].id;

  const item = await pool.request().query<{ id: string; numero: number }>(`
    SELECT TOP 1 CONVERT(VARCHAR(36), i.[id]) AS [id], a.[numero]
    FROM dbo.portal_aprovacoes_aumento_salarial AS i INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = i.[aprovacao_id];
  `);
  algumItemReajuste = item.recordset[0] ?? null;

  const pedido = await pool.request().query<{ id: string; empresa: number; numero: number }>(`
    SELECT TOP 1 CONVERT(VARCHAR(36), [id]) AS [id], [empresa], CONVERT(INT, [numero_pedido]) AS [numero]
    FROM dbo.portal_aprovacoes_pedido_compra;
  `);
  algumPedido = pedido.recordset[0] ?? null;
});

describe("consultas com alçada no banco real (só leitura)", () => {
  it("reajuste: painel, contagem, solicitação, item e minhas", async () => {
    for (const status of ["pendente", "aprovado", "devolvido", "todos"] as const) {
      await listarItensPainel(["aumento_salarial"], { status }, usuarioId);
      await listarSolicitacoesPainel(["aumento_salarial"], { status }, usuarioId);
    }
    await contarPendentesPorTipo(["aumento_salarial"], usuarioId);
    const minhas = await listarMinhasSolicitacoes(usuarioId);
    expect(Array.isArray(minhas)).toBe(true);

    if (algumItemReajuste) {
      await buscarItemPorId(algumItemReajuste.id, usuarioId, { somenteVisiveis: true });
      const sem = await buscarItemPorId(algumItemReajuste.id, usuarioId);
      expect(sem?.id.toUpperCase()).toBe(algumItemReajuste.id.toUpperCase());
      await buscarLotePorNumero(algumItemReajuste.numero, usuarioId, { somenteVisiveis: true });
      const fluxo = await buscarFluxoDoItem(algumItemReajuste.id);
      expect(fluxo).toHaveProperty("etapas");
    }
  });

  it("pedidos de compra: painel, contagem, detalhe, situação e decisões", async () => {
    for (const status of ["pendente", "aprovado", "devolvido", "todos"] as const) {
      await listarPedidosPainel(usuarioId, { status, empresa: null, busca: "" });
    }
    await listarPedidosPainel(usuarioId, { status: "todos", empresa: 2, busca: "INGA" });
    /* Período do histórico. */
    await listarPedidosPainel(usuarioId, { status: "todos", empresa: null, busca: "", dias: 30 });
        /* Filtro por centro de custo: só pedidos com algum item no prefixo. */
    const porCentro = await listarPedidosPainel(usuarioId, { status: "todos", empresa: null, busca: "", centrosCusto: ["9003", "9002"] });
    for (const pedido of porCentro) {
      expect(pedido.centrosCusto?.some((cc) => cc.startsWith("9003") || cc.startsWith("9002"))).toBe(true);
    }
    await contarPedidosPendentes(usuarioId);
    await listarDecisoesPedidos({ desde: null, limite: 10 });

    if (algumPedido) {
      await buscarPedidoDoDiretor(algumPedido.id, usuarioId);
      const situacao = await buscarSituacaoPedido({ empresa: algumPedido.empresa, numero: algumPedido.numero });
      expect(situacao).toHaveProperty("nivelAtual");
      const fluxo = await buscarFluxoDoPedido(algumPedido.id, { empresa: algumPedido.empresa, numero: algumPedido.numero });
      expect(fluxo).toHaveProperty("rodadas");
    }

    await listarTiposDasAlcadasDoUsuario(usuarioId);

    /* A sugestão de direcionamento só lê (a busca com ERP, de pedidos-compra.ts, grava os centros de custo -- fica de fora). */
    if (algumPedido) {
      const direcionamentos = await buscarDirecionamentosDaVez({
        usuarioId,
        contextos: new Map([[algumPedido.id, { empresa: algumPedido.empresa, centrosCustoItens: ["9002204"] }]]),
      });
      expect(Array.isArray(direcionamentos)).toBe(true);
    }
  });

  it("administração: alçadas com as sugestões e o histórico", async () => {
    const alcadas = await listarAlcadas();
    for (const alcada of alcadas) expect(Array.isArray(alcada.sugestoes)).toBe(true);
    await listarHistoricoAlcadas(5);
  });

  it("pendentes antigos sem alçada: não entram e nada é gravado", async () => {
    const antes = await contagens();
    const pool = await getSqlServerPool();
    const alcadas = await pool.request().query<{ n: number }>(`SELECT COUNT(*) AS [n] FROM dbo.portal_alcadas WHERE [ativo] = 1`);

    const reajuste = await iniciarFluxosReajusteSemEtapa();
    const pedidos = await iniciarFluxosSemEtapa();

    if (alcadas.recordset[0].n === 0) {
      expect(reajuste).toEqual([]);
      expect(pedidos).toBe(0);
      expect(await contagens()).toEqual(antes);
    }
  });
});
