import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { rotularUnidades } from "./chamados";
import type { PrioridadeChamado } from "./chamados";

export interface FiltrosDashboard {
  /* null = sem restrição de setor (admin vê tudo). */
  setorIds: string[] | null;
  /* Setor escolhido no filtro da tela — sempre aplicado por cima da restrição de acesso acima. */
  setorId?: string;
  empresa?: string;
  unidadeId?: string;
  departamento?: string;
  categoriaId?: string;
  dataInicial?: string;
  dataFinal?: string;
}

export interface TotaisPorStatus {
  total: number;
  aberto: number;
  emAndamento: number;
  aguardandoConfirmacao: number;
  resolvido: number;
  fechado: number;
}

export interface ContagemPrioridade {
  prioridade: PrioridadeChamado;
  total: number;
}

export interface ContagemSetor {
  setorId: string;
  setorNome: string;
  total: number;
}

export interface ContagemDia {
  dia: string;
  total: number;
}

export interface ContagemAtendente {
  atendenteNome: string;
  total: number;
}

export interface ContagemEmpresa {
  empresa: string;
  total: number;
}

export interface ContagemDepartamento {
  departamento: string;
  total: number;
}

export interface ContagemUnidade {
  unidade: string;
  total: number;
}

export interface ContagemCategoria {
  categoria: string;
  total: number;
}

export interface EstatisticasChamados {
  totais: TotaisPorStatus;
  tempoMedioResolucaoHoras: number | null;
  porPrioridade: ContagemPrioridade[];
  porSetor: ContagemSetor[];
  porDia: ContagemDia[];
  porAtendente: ContagemAtendente[];
  porEmpresa: ContagemEmpresa[];
  porUnidade: ContagemUnidade[];
  porDepartamento: ContagemDepartamento[];
  porCategoria: ContagemCategoria[];
}

type AplicarInput = (request: InstanceType<typeof sql.Request>) => void;

/*
 * Monta a cláusula WHERE + os parâmetros comuns a todas as
 * consultas do dashboard, para não repetir a lógica de escopo
 * (setores que o usuário atende + filtros da tela) em cada uma.
 * Cada consulta cria seu próprio `sql.Request` e aplica esses
 * mesmos inputs — necessário porque o driver `mssql` não permite
 * reaproveitar um único `Request` em consultas disparadas em
 * paralelo.
 */
function construirFiltro(filtros: FiltrosDashboard) {
  const condicoes: string[] = [];
  const inputs: AplicarInput[] = [];

  if (filtros.setorIds !== null) {
    condicoes.push(
      filtros.setorIds.length === 0
        ? "1 = 0"
        : `c.[setor_id] IN (${filtros.setorIds.map((_, i) => `@setorId${i}`).join(", ")})`
    );

    filtros.setorIds.forEach((id, indice) => {
      inputs.push((request) => request.input(`setorId${indice}`, sql.UniqueIdentifier, id));
    });
  }

  if (filtros.setorId) {
    condicoes.push("c.[setor_id] = @setorIdFiltro");
    inputs.push((request) =>
      request.input("setorIdFiltro", sql.UniqueIdentifier, filtros.setorId)
    );
  }

  if (filtros.empresa) {
    condicoes.push("c.[empresa] = @empresaFiltro");
    inputs.push((request) =>
      request.input("empresaFiltro", sql.NVarChar(30), filtros.empresa)
    );
  }

  if (filtros.unidadeId) {
    condicoes.push("c.[unidade_id] = @unidadeIdFiltro");
    inputs.push((request) =>
      request.input("unidadeIdFiltro", sql.UniqueIdentifier, filtros.unidadeId)
    );
  }

  if (filtros.departamento) {
    condicoes.push("c.[solicitante_departamento] = @departamentoFiltro");
    inputs.push((request) =>
      request.input("departamentoFiltro", sql.NVarChar(200), filtros.departamento)
    );
  }

  if (filtros.categoriaId) {
    condicoes.push("c.[categoria_id] = @categoriaIdFiltro");
    inputs.push((request) =>
      request.input("categoriaIdFiltro", sql.UniqueIdentifier, filtros.categoriaId)
    );
  }

  if (filtros.dataInicial) {
    condicoes.push("c.[criado_em] >= @dataInicial");
    inputs.push((request) => request.input("dataInicial", sql.DateTime2, filtros.dataInicial));
  }

  if (filtros.dataFinal) {
    condicoes.push("c.[criado_em] < DATEADD(DAY, 1, @dataFinal)");
    inputs.push((request) => request.input("dataFinal", sql.Date, filtros.dataFinal));
  }

  const clausulaWhere = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";

  return { clausulaWhere, inputs };
}

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/*
 * Filtros da tela (query string) -> FiltrosDashboard, já com o escopo de
 * setores de quem pede. Usado pelo dashboard e pelo relatório exportado,
 * para os dois saírem sempre com o mesmo recorte. Valor malformado em
 * campo de id/data é ignorado (não vira erro de conversão no SQL).
 */
export function filtrosDashboardDaUrl(url: URL, setorIds: string[] | null): FiltrosDashboard {
  const texto = (nome: string) => url.searchParams.get(nome) || undefined;
  const uuid = (nome: string) => {
    const valor = url.searchParams.get(nome);
    return valor && PADRAO_UUID.test(valor) ? valor : undefined;
  };
  const data = (nome: string) => {
    const valor = url.searchParams.get(nome);
    return valor && PADRAO_DATA.test(valor) ? valor : undefined;
  };

  return {
    setorIds,
    setorId: uuid("setorId"),
    empresa: texto("empresa"),
    unidadeId: uuid("unidadeId"),
    departamento: texto("departamento"),
    categoriaId: uuid("categoriaId"),
    dataInicial: data("dataInicial"),
    dataFinal: data("dataFinal"),
  };
}

async function criarRequestFiltrado(inputs: AplicarInput[]) {
  const pool = await getSqlServerPool();
  const request = pool.request();
  inputs.forEach((aplicar) => aplicar(request));
  return request;
}

export interface ChamadoRelatorio {
  numero: number;
  titulo: string;
  setorNome: string;
  categoriaNome: string | null;
  empresa: string | null;
  unidade: string | null;
  solicitanteNome: string;
  solicitanteDepartamento: string | null;
  atendenteNome: string | null;
  status: string;
  prioridade: PrioridadeChamado;
  criadoEm: string;
  resolvidoEm: string | null;
  fechadoEm: string | null;
  dataPrevistaConclusao: string | null;
}

/* Teto do relatório exportado -- acima disso a pessoa refina os filtros (a tela avisa). */
export const LIMITE_RELATORIO_CHAMADOS = 5000;

/*
 * A lista "propriamente dita" do relatório exportado do dashboard (PDF da
 * página 2 em diante e aba "Chamados" do Excel) -- mesmo WHERE das
 * estatísticas, então os números da página 1 batem com a lista.
 */
export async function listarChamadosRelatorio(
  filtros: FiltrosDashboard
): Promise<{ itens: ChamadoRelatorio[]; total: number }> {
  const { clausulaWhere, inputs } = construirFiltro(filtros);

  const [totalResult, itensResult] = await Promise.all([
    (async () => {
      const request = await criarRequestFiltrado(inputs);
      return request.query<{ total: number }>(`
        SELECT COUNT(*) AS [total] FROM dbo.portal_chamados AS c ${clausulaWhere};
      `);
    })(),
    (async () => {
      const request = await criarRequestFiltrado(inputs);
      request.input("limite", sql.Int, LIMITE_RELATORIO_CHAMADOS);
      return request.query<{
        numero: number;
        titulo: string;
        setor_nome: string;
        categoria_nome: string | null;
        empresa: string | null;
        unidade: string | null;
        solicitante_nome: string | null;
        solicitante_departamento: string | null;
        atendente_nome: string | null;
        status: string;
        prioridade: string;
        criado_em: string;
        resolvido_em: string | null;
        fechado_em: string | null;
        data_prevista_conclusao: string | null;
      }>(`
        SELECT TOP (@limite)
          c.[numero],
          c.[titulo],
          s.[nome] AS [setor_nome],
          cat.[nome] AS [categoria_nome],
          c.[empresa],
          c.[unidade],
          c.[solicitante_nome],
          c.[solicitante_departamento],
          atendente.[nome_exibicao] AS [atendente_nome],
          c.[status],
          c.[prioridade],
          CONVERT(VARCHAR(33), c.[criado_em], 126) AS [criado_em],
          CONVERT(VARCHAR(33), c.[resolvido_em], 126) AS [resolvido_em],
          CONVERT(VARCHAR(33), c.[fechado_em], 126) AS [fechado_em],
          CONVERT(VARCHAR(10), c.[data_prevista_conclusao], 126) AS [data_prevista_conclusao]
        FROM dbo.portal_chamados AS c
        INNER JOIN dbo.portal_setores AS s ON s.[id] = c.[setor_id]
        LEFT JOIN dbo.portal_chamados_categorias AS cat ON cat.[id] = c.[categoria_id]
        LEFT JOIN dbo.portal_usuarios AS atendente ON atendente.[id] = c.[atendente_usuario_id]
        ${clausulaWhere}
        ORDER BY c.[numero] DESC;
      `);
    })(),
  ]);

  return {
    total: totalResult.recordset[0]?.total ?? 0,
    itens: itensResult.recordset.map((row) => ({
      numero: row.numero,
      titulo: row.titulo,
      setorNome: row.setor_nome,
      categoriaNome: row.categoria_nome,
      empresa: row.empresa,
      unidade: row.unidade,
      solicitanteNome: row.solicitante_nome ?? "",
      solicitanteDepartamento: row.solicitante_departamento,
      atendenteNome: row.atendente_nome,
      status: row.status,
      prioridade: row.prioridade as PrioridadeChamado,
      criadoEm: row.criado_em,
      resolvidoEm: row.resolvido_em,
      fechadoEm: row.fechado_em,
      dataPrevistaConclusao: row.data_prevista_conclusao,
    })),
  };
}

export async function buscarEstatisticasChamados(
  filtros: FiltrosDashboard
): Promise<EstatisticasChamados> {
  const { clausulaWhere, inputs } = construirFiltro(filtros);

  const [
    totaisResult,
    tempoResult,
    prioridadeResult,
    setorResult,
    diaResult,
    atendenteResult,
    empresaResult,
    departamentoResult,
    categoriaResult,
    unidadeResult,
  ] = await Promise.all([
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{
          total: number;
          aberto: number;
          em_andamento: number;
          aguardando_confirmacao: number;
          resolvido: number;
          fechado: number;
        }>(`
          SELECT
            COUNT(*) AS [total],
            SUM(CASE WHEN c.[status] = 'aberto' THEN 1 ELSE 0 END) AS [aberto],
            SUM(CASE WHEN c.[status] = 'em_andamento' THEN 1 ELSE 0 END) AS [em_andamento],
            SUM(CASE WHEN c.[status] = 'aguardando_confirmacao' THEN 1 ELSE 0 END) AS [aguardando_confirmacao],
            SUM(CASE WHEN c.[status] = 'resolvido' THEN 1 ELSE 0 END) AS [resolvido],
            SUM(CASE WHEN c.[status] = 'fechado' THEN 1 ELSE 0 END) AS [fechado]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere};
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ horas_media: number | null }>(`
          SELECT AVG(CAST(DATEDIFF(MINUTE, c.[criado_em], c.[resolvido_em]) AS FLOAT)) / 60.0 AS [horas_media]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere ? `${clausulaWhere} AND` : "WHERE"} c.[resolvido_em] IS NOT NULL;
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ prioridade: string; total: number }>(`
          SELECT c.[prioridade], COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere}
          GROUP BY c.[prioridade];
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ setor_id: string; setor_nome: string; total: number }>(`
          SELECT
            CONVERT(VARCHAR(36), c.[setor_id]) AS [setor_id],
            s.[nome] AS [setor_nome],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          INNER JOIN dbo.portal_setores AS s ON s.[id] = c.[setor_id]
          ${clausulaWhere}
          GROUP BY c.[setor_id], s.[nome]
          ORDER BY COUNT(*) DESC;
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ dia: string; total: number }>(`
          SELECT
            CONVERT(VARCHAR(10), c.[criado_em], 120) AS [dia],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere}
          GROUP BY CONVERT(VARCHAR(10), c.[criado_em], 120)
          ORDER BY [dia];
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ atendente_nome: string | null; total: number }>(`
          SELECT
            COALESCE(u.[nome_exibicao], 'Sem atendente') AS [atendente_nome],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          LEFT JOIN dbo.portal_usuarios AS u ON u.[id] = c.[atendente_usuario_id]
          ${clausulaWhere}
          GROUP BY u.[nome_exibicao]
          ORDER BY COUNT(*) DESC;
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ empresa: string | null; total: number }>(`
          SELECT
            COALESCE(NULLIF(c.[empresa], ''), 'Sem empresa') AS [empresa],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere}
          GROUP BY c.[empresa]
          ORDER BY COUNT(*) DESC;
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ departamento: string | null; total: number }>(`
          SELECT
            COALESCE(NULLIF(c.[solicitante_departamento], ''), 'Sem departamento') AS [departamento],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere}
          GROUP BY c.[solicitante_departamento]
          ORDER BY COUNT(*) DESC;
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ categoria: string | null; total: number }>(`
          SELECT
            COALESCE(cat.[nome], 'Sem categoria') AS [categoria],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          LEFT JOIN dbo.portal_chamados_categorias AS cat ON cat.[id] = c.[categoria_id]
          ${clausulaWhere}
          GROUP BY cat.[nome]
          ORDER BY COUNT(*) DESC;
        `);
      })(),
      (async () => {
        /* Agrupa pelo id e rotula com o nome atual (renomear a unidade não divide o gráfico em dois). */
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ id: string | null; nome: string | null; empresa_codigo: string | null; total: number }>(`
          SELECT
            CONVERT(VARCHAR(36), c.[unidade_id]) AS [id],
            u.[nome],
            e.[codigo] AS [empresa_codigo],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          LEFT JOIN dbo.portal_empresas_unidades AS u ON u.[id] = c.[unidade_id]
          LEFT JOIN dbo.portal_empresas AS e ON e.[id] = u.[empresa_id]
          ${clausulaWhere}
          GROUP BY c.[unidade_id], u.[nome], e.[codigo]
          ORDER BY COUNT(*) DESC;
        `);
      })(),
    ]);

  const comUnidade = unidadeResult.recordset.filter(
    (row): row is { id: string; nome: string; empresa_codigo: string | null; total: number } =>
      row.id !== null && row.nome !== null
  );
  const rotulos = new Map(rotularUnidades(comUnidade).map((opcao) => [opcao.id, opcao.rotulo]));

  const totaisRow = totaisResult.recordset[0];

  return {
    totais: {
      total: totaisRow?.total ?? 0,
      aberto: totaisRow?.aberto ?? 0,
      emAndamento: totaisRow?.em_andamento ?? 0,
      aguardandoConfirmacao: totaisRow?.aguardando_confirmacao ?? 0,
      resolvido: totaisRow?.resolvido ?? 0,
      fechado: totaisRow?.fechado ?? 0,
    },
    tempoMedioResolucaoHoras: tempoResult.recordset[0]?.horas_media ?? null,
    porPrioridade: prioridadeResult.recordset.map((row) => ({
      prioridade: row.prioridade as PrioridadeChamado,
      total: row.total,
    })),
    porSetor: setorResult.recordset.map((row) => ({
      setorId: row.setor_id,
      setorNome: row.setor_nome,
      total: row.total,
    })),
    porDia: diaResult.recordset.map((row) => ({ dia: row.dia, total: row.total })),
    porAtendente: atendenteResult.recordset.map((row) => ({
      atendenteNome: row.atendente_nome ?? "Sem atendente",
      total: row.total,
    })),
    porEmpresa: empresaResult.recordset.map((row) => ({
      empresa: row.empresa ?? "Sem empresa",
      total: row.total,
    })),
    porUnidade: unidadeResult.recordset.map((row) => ({
      unidade: (row.id && rotulos.get(row.id)) || "Sem unidade",
      total: row.total,
    })),
    porDepartamento: departamentoResult.recordset.map((row) => ({
      departamento: row.departamento ?? "Sem departamento",
      total: row.total,
    })),
    porCategoria: categoriaResult.recordset.map((row) => ({
      categoria: row.categoria ?? "Sem categoria",
      total: row.total,
    })),
  };
}
