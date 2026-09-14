import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { StatusEquipamento, TipoAcaoMovimentacao } from "./estoque-equipamentos-usados";
import { COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA, listarCamposComPendencia } from "./tipos-equipamento";

export interface PainelBiContagemStatus {
  status: StatusEquipamento;
  quantidade: number;
  valorTotal: number;
}

export interface PainelBiTipo {
  tipoId: string;
  tipoNome: string;
  quantidade: number;
  valorTotal: number;
}

export interface PainelBiMes {
  mes: string;
  quantidade: number;
}

export interface PainelBiMovimentacao {
  equipamentoId: string;
  equipamentoNumero: number;
  equipamentoDescricao: string;
  tipoAcao: TipoAcaoMovimentacao;
  numeroNf: string | null;
  destinatarioNome: string | null;
  dataAcao: string;
  criadoPorNome: string;
}

export interface PainelBiCliente {
  nomeCliente: string;
  quantidade: number;
  quantidadeEmprestado: number;
  quantidadeConsignado: number;
}

export interface PainelBiEstoque {
  totalEquipamentos: number;
  valorTotalEmEstoque: number;
  pendencias: number;
  semNfEntrada: number;
  porStatus: PainelBiContagemStatus[];
  porTipo: PainelBiTipo[];
  entradasPorMes: PainelBiMes[];
  movimentacoesRecentes: PainelBiMovimentacao[];
  clientesComEquipamentoFora: PainelBiCliente[];
  atualizadoEm: string;
}

/*
 * Um equipamento "tem pendência" se algum campo de sistema marcado como
 * gera_pendencia (ver tipos-equipamento.ts) está vazio nele — cada tipo
 * de equipamento pode ter um conjunto diferente de campos marcados assim,
 * então a contagem agrupa por tipo antes de montar a condição, em vez de
 * assumir a mesma coluna pra todo mundo. Equipamento já baixado nunca
 * conta aqui — pendência de dado num item fora de operação não é mais
 * algo acionável.
 */
async function contarEquipamentosComPendencia(
  pool: Awaited<ReturnType<typeof getSqlServerPool>>
): Promise<number> {
  const camposPendencia = await listarCamposComPendencia();

  const colunasPorTipo = new Map<string, Set<string>>();
  for (const campo of camposPendencia) {
    const coluna = COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA[campo.chave];
    if (!coluna) continue;
    const colunas = colunasPorTipo.get(campo.tipoEquipamentoId) ?? new Set<string>();
    colunas.add(coluna);
    colunasPorTipo.set(campo.tipoEquipamentoId, colunas);
  }

  if (colunasPorTipo.size === 0) return 0;

  const request = pool.request();
  const condicoesPorTipo: string[] = [];
  let indice = 0;

  for (const [tipoId, colunas] of colunasPorTipo) {
    const parametro = `tipo${indice}`;
    request.input(parametro, sql.UniqueIdentifier, tipoId);

    const condicaoColunas = Array.from(colunas)
      .map((coluna) =>
        coluna === "valor" ? `[${coluna}] IS NULL` : `([${coluna}] IS NULL OR [${coluna}] = '')`
      )
      .join(" OR ");

    condicoesPorTipo.push(`([tipo_equipamento_id] = @${parametro} AND (${condicaoColunas}))`);
    indice += 1;
  }

  const result = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS [total] FROM dbo.com_estoque_equipamentos_usados
    WHERE [status] <> 'baixado' AND (${condicoesPorTipo.join(" OR ")});
  `);

  return result.recordset[0]?.total ?? 0;
}

export async function obterDadosPainelBi(): Promise<PainelBiEstoque> {
  const pool = await getSqlServerPool();

  const [
    totaisResult,
    porStatusResult,
    porTipoResult,
    entradasPorMesResult,
    movimentacoesResult,
    clientesResult,
    pendencias,
  ] = await Promise.all([
    /* "Sem NF de entrada" só considera quem está em_estoque de propósito —
       já exclui baixado (e emprestado/consignado nunca chegam sem NF, é
       pré-requisito pra sair do estoque). */
    pool.request().query<{ total: number; valorTotalEmEstoque: number | null; semNfEntrada: number }>(`
      SELECT
        COUNT(*) AS [total],
        SUM(CASE WHEN [status] = 'em_estoque' THEN [valor] ELSE 0 END) AS [valorTotalEmEstoque],
        SUM(CASE WHEN [status] = 'em_estoque' AND [numero_nf_entrada] IS NULL THEN 1 ELSE 0 END) AS [semNfEntrada]
      FROM dbo.com_estoque_equipamentos_usados;
    `),
    pool.request().query<{ status: StatusEquipamento; quantidade: number; valorTotal: number | null }>(`
      SELECT [status], COUNT(*) AS [quantidade], SUM(ISNULL([valor], 0)) AS [valorTotal]
      FROM dbo.com_estoque_equipamentos_usados
      GROUP BY [status];
    `),
    pool.request().query<{ tipoId: string; tipoNome: string; quantidade: number; valorTotal: number | null }>(`
      SELECT TOP (8)
        CONVERT(VARCHAR(36), t.[id]) AS [tipoId],
        t.[nome] AS [tipoNome],
        COUNT(e.[id]) AS [quantidade],
        SUM(ISNULL(e.[valor], 0)) AS [valorTotal]
      FROM dbo.com_estoque_tipos_equipamento AS t
      INNER JOIN dbo.com_estoque_equipamentos_usados AS e ON e.[tipo_equipamento_id] = t.[id]
      GROUP BY t.[id], t.[nome]
      ORDER BY COUNT(e.[id]) DESC;
    `),
    pool.request().query<{ mes: string; quantidade: number }>(`
      ;WITH Meses AS (
        SELECT DATEFROMPARTS(
          YEAR(DATEADD(MONTH, -n.n, SYSDATETIME())),
          MONTH(DATEADD(MONTH, -n.n, SYSDATETIME())),
          1
        ) AS [mesInicio]
        FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11)) AS n(n)
      )
      SELECT
        FORMAT(Meses.[mesInicio], 'yyyy-MM') AS [mes],
        COUNT(m.[id]) AS [quantidade]
      FROM Meses
      LEFT JOIN dbo.com_estoque_equipamentos_usados_movimentacoes AS m
        ON m.[tipo_acao] = 'entrada'
        AND m.[data_acao] >= Meses.[mesInicio]
        AND m.[data_acao] < DATEADD(MONTH, 1, Meses.[mesInicio])
      GROUP BY Meses.[mesInicio]
      ORDER BY Meses.[mesInicio] ASC;
    `),
    pool.request().query<{
      equipamento_id: string;
      equipamento_numero: number;
      equipamento_descricao: string;
      tipo_acao: TipoAcaoMovimentacao;
      numero_nf: string | null;
      destinatario_nome: string | null;
      data_acao: string;
      criado_por_nome: string;
    }>(`
      SELECT TOP (12)
        CONVERT(VARCHAR(36), e.[id]) AS [equipamento_id],
        e.[numero] AS [equipamento_numero],
        e.[descricao] AS [equipamento_descricao],
        m.[tipo_acao],
        m.[numero_nf],
        m.[destinatario_nome],
        CONVERT(VARCHAR(10), m.[data_acao], 23) AS [data_acao],
        m.[criado_por_nome]
      FROM dbo.com_estoque_equipamentos_usados_movimentacoes AS m
      INNER JOIN dbo.com_estoque_equipamentos_usados AS e ON e.[id] = m.[equipamento_id]
      ORDER BY m.[criado_em] DESC;
    `),
    pool.request().query<{
      nomeCliente: string;
      quantidadeEmprestado: number;
      quantidadeConsignado: number;
    }>(`
      SELECT TOP (8)
        x.[nomeCliente],
        SUM(CASE WHEN x.[status] = 'emprestado' THEN 1 ELSE 0 END) AS [quantidadeEmprestado],
        SUM(CASE WHEN x.[status] = 'consignado' THEN 1 ELSE 0 END) AS [quantidadeConsignado]
      FROM (
        SELECT e.[status], dest.[destinatario_nome] AS [nomeCliente]
        FROM dbo.com_estoque_equipamentos_usados AS e
        CROSS APPLY (
          SELECT TOP (1) m.[destinatario_nome]
          FROM dbo.com_estoque_equipamentos_usados_movimentacoes AS m
          WHERE m.[equipamento_id] = e.[id] AND m.[tipo_acao] IN ('emprestimo', 'consignacao')
          ORDER BY m.[data_acao] DESC, m.[criado_em] DESC
        ) AS dest
        WHERE e.[status] IN ('emprestado', 'consignado') AND dest.[destinatario_nome] IS NOT NULL
      ) AS x
      GROUP BY x.[nomeCliente]
      ORDER BY COUNT(*) DESC;
    `),
    contarEquipamentosComPendencia(pool),
  ]);

  const totais = totaisResult.recordset[0];

  return {
    totalEquipamentos: totais?.total ?? 0,
    valorTotalEmEstoque: totais?.valorTotalEmEstoque ?? 0,
    semNfEntrada: totais?.semNfEntrada ?? 0,
    pendencias,
    porStatus: porStatusResult.recordset.map((row) => ({
      status: row.status,
      quantidade: row.quantidade,
      valorTotal: row.valorTotal ?? 0,
    })),
    porTipo: porTipoResult.recordset.map((row) => ({
      tipoId: row.tipoId,
      tipoNome: row.tipoNome,
      quantidade: row.quantidade,
      valorTotal: row.valorTotal ?? 0,
    })),
    entradasPorMes: entradasPorMesResult.recordset.map((row) => ({
      mes: row.mes,
      quantidade: row.quantidade,
    })),
    movimentacoesRecentes: movimentacoesResult.recordset.map((row) => ({
      equipamentoId: row.equipamento_id,
      equipamentoNumero: row.equipamento_numero,
      equipamentoDescricao: row.equipamento_descricao,
      tipoAcao: row.tipo_acao,
      numeroNf: row.numero_nf,
      destinatarioNome: row.destinatario_nome,
      dataAcao: row.data_acao,
      criadoPorNome: row.criado_por_nome,
    })),
    clientesComEquipamentoFora: clientesResult.recordset.map((row) => ({
      nomeCliente: row.nomeCliente,
      quantidade: row.quantidadeEmprestado + row.quantidadeConsignado,
      quantidadeEmprestado: row.quantidadeEmprestado,
      quantidadeConsignado: row.quantidadeConsignado,
    })),
    atualizadoEm: new Date().toISOString(),
  };
}
