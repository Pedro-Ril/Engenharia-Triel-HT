import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

/*
 * Registro das etapas da Integra Lantek (tabela integra_lantek_eventos,
 * migração 0157): pesquisa de ordem/lote no ERP, busca/validação de DXF e
 * exportação (esta ligada ao detalhe linha a linha de
 * integra_lantek_exportacao_itens). Serve para achar onde um DXF troca de
 * peça. Gravar nunca derruba a integração: falha só vai para o console.
 * Consultado pelo botão "Registros" na tela da integração.
 */

export type ModuloLantek = "agro" | "ve";
export type TipoEventoLantek = "pesquisa_erp" | "validacao_dxf" | "exportacao";

/* Registros mais velhos que isso são apagados aos poucos, a cada evento novo. */
const DIAS_RETENCAO = 180;

export function lerModuloLantek(valor: unknown): ModuloLantek | null {
  return valor === "agro" || valor === "ve" ? valor : null;
}

export async function registrarEventoLantek(params: {
  modulo: ModuloLantek | null;
  tipo: TipoEventoLantek;
  sucesso: boolean;
  resumo: string;
  parametros?: unknown;
  resultado?: unknown;
  total?: number | null;
  duracaoMs?: number | null;
  erro?: string | null;
  usuarioId: string | null;
  usuarioNome: string | null;
}): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    await pool
      .request()
      .input("modulo", sql.VarChar(10), params.modulo)
      .input("tipo", sql.VarChar(20), params.tipo)
      .input("sucesso", sql.Bit, params.sucesso)
      .input("resumo", sql.NVarChar(400), params.resumo.slice(0, 400))
      .input("parametros", sql.NVarChar(sql.MAX), params.parametros === undefined ? null : JSON.stringify(params.parametros))
      .input("resultado", sql.NVarChar(sql.MAX), params.resultado === undefined ? null : JSON.stringify(params.resultado))
      .input("total", sql.Int, params.total ?? null)
      .input("duracaoMs", sql.Int, params.duracaoMs === undefined || params.duracaoMs === null ? null : Math.round(params.duracaoMs))
      .input("erro", sql.NVarChar(2000), params.erro?.slice(0, 2000) ?? null)
      .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
      .input("usuarioNome", sql.NVarChar(150), params.usuarioNome)
      .input("dias", sql.Int, DIAS_RETENCAO)
      .query(`
        INSERT INTO dbo.integra_lantek_eventos
          ([modulo], [tipo], [sucesso], [resumo], [parametros], [resultado], [total], [duracao_ms], [erro], [usuario_id], [usuario_nome])
        VALUES (@modulo, @tipo, @sucesso, @resumo, @parametros, @resultado, @total, @duracaoMs, @erro, @usuarioId, @usuarioNome);
        DELETE TOP (200) FROM dbo.integra_lantek_eventos WHERE [criado_em] < DATEADD(DAY, -@dias, SYSDATETIME());
        DELETE TOP (50) FROM dbo.integra_lantek_exportacoes WHERE [criado_em] < DATEADD(DAY, -@dias, SYSDATETIME());
      `);
  } catch (erro) {
    console.error("Não foi possível registrar o evento da Integra Lantek (a integração seguiu):", erro);
  }
}

export interface EventoLantekResumo {
  id: string;
  modulo: ModuloLantek | null;
  tipo: TipoEventoLantek;
  sucesso: boolean;
  resumo: string;
  total: number | null;
  duracaoMs: number | null;
  usuarioNome: string | null;
  criadoEm: string;
  totalAlertas: number | null;
}

export async function listarEventosLantek(params: {
  modulo: ModuloLantek | null;
  busca: string;
  pagina: number;
  porPagina: number;
}): Promise<{ itens: EventoLantekResumo[]; total: number }> {
  const pool = await getSqlServerPool();
  const filtro = `
    WHERE (@modulo IS NULL OR e.[modulo] IS NULL OR e.[modulo] = @modulo)
      AND (
        @busca IS NULL
        OR e.[resumo] LIKE @busca OR e.[parametros] LIKE @busca OR e.[resultado] LIKE @busca
        OR e.[usuario_nome] LIKE @busca
        OR EXISTS (
          SELECT 1 FROM dbo.integra_lantek_exportacao_itens i
          WHERE i.[exportacao_id] = e.[exportacao_id]
            AND (i.[num_ordem] LIKE @busca OR i.[num_lote] LIKE @busca OR i.[cod_item] LIKE @busca
                 OR i.[cod_desenho] LIKE @busca OR i.[dxf_exportado] LIKE @busca)
        )
      )`;
  const busca = params.busca.trim() ? `%${params.busca.trim()}%` : null;
  const req = () =>
    pool.request().input("modulo", sql.VarChar(10), params.modulo).input("busca", sql.NVarChar(200), busca);

  const [itens, total] = await Promise.all([
    req()
      .input("offset", sql.Int, (params.pagina - 1) * params.porPagina)
      .input("porPagina", sql.Int, params.porPagina)
      .query<{
        id: string;
        modulo: ModuloLantek | null;
        tipo: TipoEventoLantek;
        sucesso: boolean;
        resumo: string;
        total: number | null;
        duracao_ms: number | null;
        usuario_nome: string | null;
        criado_em: string;
        total_alertas: number | null;
      }>(`
        SELECT CONVERT(VARCHAR(36), e.[id]) AS [id], e.[modulo], e.[tipo], e.[sucesso], e.[resumo], e.[total], e.[duracao_ms],
               e.[usuario_nome], CONVERT(VARCHAR(33), TODATETIMEOFFSET(e.[criado_em], DATEPART(TZOFFSET, SYSDATETIMEOFFSET())), 126) AS [criado_em],
               x.[total_alertas]
        FROM dbo.integra_lantek_eventos e
        LEFT JOIN dbo.integra_lantek_exportacoes x ON x.[id] = e.[exportacao_id]
        ${filtro}
        ORDER BY e.[criado_em] DESC
        OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
      `),
    req().query<{ total: number }>(`SELECT COUNT(*) AS [total] FROM dbo.integra_lantek_eventos e ${filtro};`),
  ]);

  return {
    itens: itens.recordset.map((r) => ({
      id: r.id,
      modulo: r.modulo,
      tipo: r.tipo,
      sucesso: Boolean(r.sucesso),
      resumo: r.resumo,
      total: r.total,
      duracaoMs: r.duracao_ms,
      usuarioNome: r.usuario_nome,
      criadoEm: r.criado_em,
      totalAlertas: r.total_alertas,
    })),
    total: total.recordset[0]?.total ?? 0,
  };
}

export interface ItemExportadoLantek {
  linha: number;
  numOrdem: string | null;
  numLote: string | null;
  codItem: string | null;
  codDesenho: string | null;
  qtde: string | null;
  dxfExportado: string | null;
  dxfServidor: string | null;
  origemServidor: string | null;
  candidatosCodigo: string[];
  candidatosDesenho: string[];
  dxfModificadoEm: string | null;
  dxfTamanho: number | null;
  alertas: string | null;
}

export interface EventoLantekDetalhe extends EventoLantekResumo {
  parametros: unknown;
  resultado: unknown;
  erro: string | null;
  itensExportados: ItemExportadoLantek[];
}

function lerJson(texto: string | null): unknown {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

export async function buscarEventoLantek(id: string): Promise<EventoLantekDetalhe | null> {
  const pool = await getSqlServerPool();
  const r = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{
      id: string;
      modulo: ModuloLantek | null;
      tipo: TipoEventoLantek;
      sucesso: boolean;
      resumo: string;
      total: number | null;
      duracao_ms: number | null;
      usuario_nome: string | null;
      criado_em: string;
      total_alertas: number | null;
      parametros: string | null;
      resultado: string | null;
      erro: string | null;
      exportacao_id: string | null;
    }>(`
      SELECT CONVERT(VARCHAR(36), e.[id]) AS [id], e.[modulo], e.[tipo], e.[sucesso], e.[resumo], e.[total], e.[duracao_ms],
             e.[usuario_nome], CONVERT(VARCHAR(33), TODATETIMEOFFSET(e.[criado_em], DATEPART(TZOFFSET, SYSDATETIMEOFFSET())), 126) AS [criado_em],
             x.[total_alertas], e.[parametros], e.[resultado], e.[erro], CONVERT(VARCHAR(36), e.[exportacao_id]) AS [exportacao_id]
      FROM dbo.integra_lantek_eventos e
      LEFT JOIN dbo.integra_lantek_exportacoes x ON x.[id] = e.[exportacao_id]
      WHERE e.[id] = @id;
    `);
  const e = r.recordset[0];
  if (!e) return null;

  let itensExportados: ItemExportadoLantek[] = [];
  if (e.exportacao_id) {
    const itens = await pool
      .request()
      .input("exportacao", sql.UniqueIdentifier, e.exportacao_id)
      .query<{
        linha: number;
        num_ordem: string | null;
        num_lote: string | null;
        cod_item: string | null;
        cod_desenho: string | null;
        qtde: string | null;
        dxf_exportado: string | null;
        dxf_servidor: string | null;
        origem_servidor: string | null;
        candidatos_codigo: string | null;
        candidatos_desenho: string | null;
        dxf_modificado_em: string | null;
        dxf_tamanho: number | null;
        alertas: string | null;
      }>(`
        SELECT [linha], [num_ordem], [num_lote], [cod_item], [cod_desenho], [qtde], [dxf_exportado], [dxf_servidor],
               [origem_servidor], [candidatos_codigo], [candidatos_desenho],
               CONVERT(VARCHAR(16), [dxf_modificado_em], 120) AS [dxf_modificado_em], [dxf_tamanho], [alertas]
        FROM dbo.integra_lantek_exportacao_itens
        WHERE [exportacao_id] = @exportacao
        ORDER BY [linha];
      `);
    itensExportados = itens.recordset.map((i) => ({
      linha: i.linha,
      numOrdem: i.num_ordem,
      numLote: i.num_lote,
      codItem: i.cod_item,
      codDesenho: i.cod_desenho,
      qtde: i.qtde,
      dxfExportado: i.dxf_exportado,
      dxfServidor: i.dxf_servidor,
      origemServidor: i.origem_servidor,
      candidatosCodigo: (lerJson(i.candidatos_codigo) as string[] | null) ?? [],
      candidatosDesenho: (lerJson(i.candidatos_desenho) as string[] | null) ?? [],
      dxfModificadoEm: i.dxf_modificado_em,
      dxfTamanho: i.dxf_tamanho === null ? null : Number(i.dxf_tamanho),
      alertas: i.alertas,
    }));
  }

  return {
    id: e.id,
    modulo: e.modulo,
    tipo: e.tipo,
    sucesso: Boolean(e.sucesso),
    resumo: e.resumo,
    total: e.total,
    duracaoMs: e.duracao_ms,
    usuarioNome: e.usuario_nome,
    criadoEm: e.criado_em,
    totalAlertas: e.total_alertas,
    parametros: lerJson(e.parametros),
    resultado: lerJson(e.resultado),
    erro: e.erro,
    itensExportados,
  };
}
