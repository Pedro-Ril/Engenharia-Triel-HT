import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import type { PortalUsuario } from "@/lib/auth/usuarios";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { registrarLog } from "@/lib/monitoramento/logs";
import type {
  AcaoManual3dx,
  Ambiente3dx,
  ConfigAmbiente3dx,
  Destinatario3dx,
  DetalheExecucao3dx,
  EstatisticasPlugin3dx,
  EventoPlugin3dx,
  Execucao3dx,
  FiltrosExecucoes3dx,
  ItemExecucao3dx,
  ModoPlugin3dx,
  NoPlugin3dx,
  NovoDestinatario3dx,
  PaginaExecucoes3dx,
  Plugin3dx,
  VisaoGeralPlugins3dx,
} from "@/modules/plugins-3dx/types/plugins3dx.types";
import { EVENTOS_AVISO_3DX } from "@/modules/plugins-3dx/types/plugins3dx.types";

/*
 * Plugins 3DX: os jars do 3DSpace (triel-3dx-core + um por plugin) gravam direto nestas tabelas (migração 0172);
 * aqui o Portal lê tudo para a tela Administração > Plugins 3DX e é quem muda o modo/parâmetros, cria ações
 * manuais (que entram na mesma fila dos plugins) e mantém a lista de quem recebe aviso.
 */

const MODOS: ModoPlugin3dx[] = ["DESLIGADO", "SIMULACAO", "ATIVO"];

export function ehAmbiente(valor: unknown): valor is Ambiente3dx {
  return valor === "PRODUCAO" || valor === "TESTE";
}
export const TAMANHO_PAGINA_EXECUCOES = 25;
/* Nó sem heartbeat há mais que isso aparece como "atrasado" (o heartbeat é a cada 60 s). */
const SEGUNDOS_NO_ATRASADO = 180;

/*
 * Parâmetros conhecidos por plugin e o tipo de cada um. O plugin ignora o que não conhece, mas a tela só deixa
 * gravar o que está aqui -- um número digitado como texto viraria o valor padrão em silêncio no 3DSpace.
 */
export const PARAMETROS_PLUGIN: Record<
  string,
  Record<string, { tipo: "numero" | "booleano" | "texto"; label: string; min?: number; max?: number }>
> = {
  "duplicate-title": {
    maxTitulo: { tipo: "numero", label: "Tamanho máximo do título", min: 10, max: 300 },
  },
  "replace-revision": {
    maxInstancias: { tipo: "numero", label: "Limite de instâncias por liberação", min: 1, max: 100000 },
    esperaLiberacaoSeg: { tipo: "numero", label: "Espera pela liberação (s)", min: 10, max: 900 },
    obsoletarAnteriores: { tipo: "booleano", label: "Obsoletar revisões anteriores liberadas" },
    papel: { tipo: "texto", label: "Contexto de segurança para ação manual" },
  },
  "drawing-config-link": {
    papel: { tipo: "texto", label: "Contexto de segurança" },
    maxVinculosPorDesenho: { tipo: "numero", label: "Limite de vínculos por desenho", min: 1, max: 5000 },
    esperaLiberacaoSeg: { tipo: "numero", label: "Espera pela liberação (s)", min: 10, max: 900 },
    noturnoAtivo: { tipo: "booleano", label: "Rotina noturna ativa" },
    noturnoHora: { tipo: "texto", label: "Hora da rotina noturna (HH:MM)" },
  },
};

function ehChaveDuplicada(erro: unknown): boolean {
  const numero =
    (erro as { number?: number })?.number ??
    (erro as { originalError?: { info?: { number?: number } } })?.originalError?.info?.number;
  return numero === 2601 || numero === 2627;
}

function lerJson(texto: string | null): Record<string, unknown> {
  if (!texto) return {};
  try {
    const valor: unknown = JSON.parse(texto);
    return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const minusculo = (id: string | null) => (id ? id.toLowerCase() : null);

// ------------------------------------------------------------------ visão geral

interface PluginRow {
  chave: string;
  nome: string;
  descricao: string | null;
}

interface AmbienteRow {
  plugin_chave: string;
  ambiente: Ambiente3dx;
  modo: ModoPlugin3dx;
  parametros: string;
  atualizado_por_nome: string | null;
  atualizado_em: string | null;
}

interface EstatisticaRow {
  plugin_chave: string;
  execucoes24h: number;
  itens24h: number;
  falhas24h: number;
  execucoes7d: number;
  itens7d: number;
  falhas7d: number;
  pendentes: number;
  ultima: string | null;
}

interface NoRow {
  plugin_chave: string;
  no: string;
  ambiente: Ambiente3dx | null;
  versao: string | null;
  jar_md5: string | null;
  core_versao: string | null;
  modo_em_uso: ModoPlugin3dx | null;
  iniciado_em: string | null;
  ultimo_contato: string;
  fila_pendente: number | null;
  ultimo_erro: string | null;
  ultimo_erro_em: string | null;
  segundos_sem_contato: number;
}

interface EventoRow {
  id: string;
  plugin_chave: string | null;
  ambiente: Ambiente3dx | null;
  no: string | null;
  nivel: EventoPlugin3dx["nivel"];
  mensagem: string;
  detalhe: string | null;
  execucao_id: string | null;
  criado_em: string;
}

const SELECT_EVENTO = `
  CONVERT(VARCHAR(36), [id]) AS [id], [plugin_chave], [ambiente], [no], [nivel], [mensagem], [detalhe],
  CONVERT(VARCHAR(36), [execucao_id]) AS [execucao_id], CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]`;

function mapearEvento(row: EventoRow): EventoPlugin3dx {
  return {
    id: row.id.toLowerCase(),
    pluginChave: row.plugin_chave,
    ambiente: row.ambiente,
    no: row.no,
    nivel: row.nivel,
    mensagem: row.mensagem,
    detalhe: row.detalhe,
    execucaoId: minusculo(row.execucao_id),
    criadoEm: row.criado_em,
  };
}

/*
 * ambiente null = os dois. Nós e eventos SEM ambiente aparecem em qualquer filtro: são justamente os que precisam
 * de atenção (nó sem ambiente= no properties fica com tudo desligado).
 */
export async function buscarVisaoGeral(ambiente: Ambiente3dx | null): Promise<VisaoGeralPlugins3dx> {
  const pool = await getSqlServerPool();
  const req = () => pool.request().input("ambiente", sql.VarChar(10), ambiente);

  const [plugins, ambientes, estatisticas, nos, eventos] = await Promise.all([
    pool.request().query<PluginRow>(`
      SELECT [chave], [nome], [descricao]
      FROM dbo.portal_3dx_plugins
      ORDER BY [ordem], [nome];
    `),
    pool.request().query<AmbienteRow>(`
      SELECT [plugin_chave], [ambiente], [modo], [parametros], [atualizado_por_nome],
        CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em]
      FROM dbo.portal_3dx_plugins_ambientes;
    `),
    req().query<EstatisticaRow>(`
      SELECT [plugin_chave],
        SUM(CASE WHEN [enfileirado_em] >= DATEADD(HOUR, -24, SYSDATETIME()) AND [status] NOT IN ('pendente', 'processando') THEN 1 ELSE 0 END) AS [execucoes24h],
        SUM(CASE WHEN [enfileirado_em] >= DATEADD(HOUR, -24, SYSDATETIME()) THEN ISNULL([total_itens], 0) ELSE 0 END) AS [itens24h],
        SUM(CASE WHEN [enfileirado_em] >= DATEADD(HOUR, -24, SYSDATETIME()) AND [status] IN ('falha', 'parcial') THEN 1 ELSE 0 END) AS [falhas24h],
        SUM(CASE WHEN [status] NOT IN ('pendente', 'processando') THEN 1 ELSE 0 END) AS [execucoes7d],
        SUM(ISNULL([total_itens], 0)) AS [itens7d],
        SUM(CASE WHEN [status] IN ('falha', 'parcial') THEN 1 ELSE 0 END) AS [falhas7d],
        SUM(CASE WHEN [status] = 'pendente' THEN 1 ELSE 0 END) AS [pendentes],
        CONVERT(VARCHAR(33), MAX([finalizado_em]), 126) AS [ultima]
      FROM dbo.portal_3dx_plugins_execucoes
      WHERE ([enfileirado_em] >= DATEADD(DAY, -7, SYSDATETIME()) OR [status] IN ('pendente', 'processando'))
        AND (@ambiente IS NULL OR [ambiente] = @ambiente)
      GROUP BY [plugin_chave];
    `),
    req().query<NoRow>(`
      SELECT [plugin_chave], [no], [ambiente], [versao], [jar_md5], [core_versao], [modo_em_uso],
        CONVERT(VARCHAR(33), [iniciado_em], 126) AS [iniciado_em],
        CONVERT(VARCHAR(33), [ultimo_contato], 126) AS [ultimo_contato],
        [fila_pendente], [ultimo_erro], CONVERT(VARCHAR(33), [ultimo_erro_em], 126) AS [ultimo_erro_em],
        DATEDIFF(SECOND, [ultimo_contato], SYSDATETIME()) AS [segundos_sem_contato]
      FROM dbo.portal_3dx_plugins_nos
      WHERE @ambiente IS NULL OR [ambiente] = @ambiente OR [ambiente] IS NULL
      ORDER BY [ambiente], [no];
    `),
    req().query<EventoRow>(`
      SELECT TOP (20) ${SELECT_EVENTO}
      FROM dbo.portal_3dx_plugins_eventos
      WHERE [nivel] IN ('aviso', 'erro') AND (@ambiente IS NULL OR [ambiente] = @ambiente OR [ambiente] IS NULL)
      ORDER BY [criado_em] DESC;
    `),
  ]);

  const vazia: EstatisticasPlugin3dx = {
    execucoes24h: 0,
    itens24h: 0,
    falhas24h: 0,
    execucoes7d: 0,
    itens7d: 0,
    falhas7d: 0,
    pendentes: 0,
    ultimaExecucaoEm: null,
  };

  const lista: Plugin3dx[] = plugins.recordset.map((row) => {
    const est = estatisticas.recordset.find((e) => e.plugin_chave === row.chave);
    const nosPlugin: NoPlugin3dx[] = nos.recordset
      .filter((n) => n.plugin_chave === row.chave)
      .map((n) => ({
        no: n.no,
        ambiente: n.ambiente,
        versao: n.versao,
        jarMd5: n.jar_md5 ? n.jar_md5.trim() || null : null,
        coreVersao: n.core_versao,
        modoEmUso: n.modo_em_uso,
        iniciadoEm: n.iniciado_em,
        ultimoContato: n.ultimo_contato,
        filaPendente: n.fila_pendente,
        ultimoErro: n.ultimo_erro,
        ultimoErroEm: n.ultimo_erro_em,
        atrasado: n.segundos_sem_contato > SEGUNDOS_NO_ATRASADO,
      }));
    const configDe = (amb: Ambiente3dx): ConfigAmbiente3dx => {
      const linha = ambientes.recordset.find((a) => a.plugin_chave === row.chave && a.ambiente === amb);
      return linha
        ? {
            modo: linha.modo,
            parametros: lerJson(linha.parametros),
            atualizadoPorNome: linha.atualizado_por_nome,
            atualizadoEm: linha.atualizado_em,
          }
        : { modo: "DESLIGADO", parametros: {}, atualizadoPorNome: null, atualizadoEm: null };
    };
    return {
      chave: row.chave,
      nome: row.nome,
      descricao: row.descricao,
      ambientes: { PRODUCAO: configDe("PRODUCAO"), TESTE: configDe("TESTE") },
      estatisticas: est
        ? {
            execucoes24h: est.execucoes24h,
            itens24h: est.itens24h,
            falhas24h: est.falhas24h,
            execucoes7d: est.execucoes7d,
            itens7d: est.itens7d,
            falhas7d: est.falhas7d,
            pendentes: est.pendentes,
            ultimaExecucaoEm: est.ultima,
          }
        : vazia,
      nos: nosPlugin,
    };
  });

  return { plugins: lista, eventosRecentes: eventos.recordset.map(mapearEvento) };
}

// ------------------------------------------------------------------ configuração

function validarParametros(chave: string, parametros: unknown): Record<string, unknown> {
  const definicao = PARAMETROS_PLUGIN[chave];
  if (!definicao) throw new ValidationError("Plugin desconhecido.");
  if (!parametros || typeof parametros !== "object" || Array.isArray(parametros)) {
    throw new ValidationError("Os parâmetros devem ser um objeto.");
  }
  const saida: Record<string, unknown> = {};
  for (const [nome, valor] of Object.entries(parametros as Record<string, unknown>)) {
    const def = definicao[nome];
    if (!def) throw new ValidationError(`Parâmetro desconhecido: ${nome}.`);
    if (def.tipo === "numero") {
      if (typeof valor !== "number" || !Number.isInteger(valor)) {
        throw new ValidationError(`${def.label}: informe um número inteiro.`);
      }
      if ((def.min !== undefined && valor < def.min) || (def.max !== undefined && valor > def.max)) {
        throw new ValidationError(`${def.label}: entre ${def.min} e ${def.max}.`);
      }
    } else if (def.tipo === "booleano") {
      if (typeof valor !== "boolean") throw new ValidationError(`${def.label}: valor inválido.`);
    } else {
      if (typeof valor !== "string" || valor.trim().length === 0 || valor.length > 200) {
        throw new ValidationError(`${def.label}: informe um texto (até 200 caracteres).`);
      }
      if (nome === "noturnoHora" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(valor.trim())) {
        throw new ValidationError(`${def.label}: use o formato HH:MM.`);
      }
    }
    saida[nome] = typeof valor === "string" ? valor.trim() : valor;
  }
  return saida;
}

export async function atualizarPlugin(
  chave: string,
  ambiente: Ambiente3dx,
  dados: { modo?: ModoPlugin3dx; parametros?: unknown },
  usuario: PortalUsuario
): Promise<void> {
  if (!ehAmbiente(ambiente)) throw new ValidationError("Ambiente inválido.");
  if (dados.modo !== undefined && !MODOS.includes(dados.modo)) throw new ValidationError("Modo inválido.");

  const pool = await getSqlServerPool();
  const atual = await pool
    .request()
    .input("chave", sql.VarChar(40), chave)
    .input("ambiente", sql.VarChar(10), ambiente)
    .query<{ modo: ModoPlugin3dx; parametros: string }>(
      "SELECT [modo], [parametros] FROM dbo.portal_3dx_plugins_ambientes WHERE [plugin_chave] = @chave AND [ambiente] = @ambiente;"
    );
  const linha = atual.recordset[0];
  if (!linha) throw new ValidationError("Plugin não encontrado.");

  const novoModo = dados.modo ?? linha.modo;
  const novosParametros =
    dados.parametros === undefined
      ? lerJson(linha.parametros)
      : { ...lerJson(linha.parametros), ...validarParametros(chave, dados.parametros) };
  const parametrosTexto = JSON.stringify(novosParametros);
  if (novoModo === linha.modo && parametrosTexto === JSON.stringify(lerJson(linha.parametros))) return;

  const transacao = new sql.Transaction(pool);
  await transacao.begin();
  try {
    await new sql.Request(transacao)
      .input("chave", sql.VarChar(40), chave)
      .input("ambiente", sql.VarChar(10), ambiente)
      .input("modo", sql.VarChar(10), novoModo)
      .input("parametros", sql.NVarChar(sql.MAX), parametrosTexto)
      .input("usuarioId", sql.UniqueIdentifier, usuario.id)
      .input("usuarioNome", sql.NVarChar(200), usuario.nomeExibicao)
      .query(`
        UPDATE dbo.portal_3dx_plugins_ambientes
        SET [modo] = @modo, [parametros] = @parametros, [atualizado_por_id] = @usuarioId,
            [atualizado_por_nome] = @usuarioNome, [atualizado_em] = SYSDATETIME()
        WHERE [plugin_chave] = @chave AND [ambiente] = @ambiente;
      `);
    await new sql.Request(transacao)
      .input("chave", sql.VarChar(40), chave)
      .input("ambiente", sql.VarChar(10), ambiente)
      .input("modoAntes", sql.VarChar(10), linha.modo)
      .input("modoDepois", sql.VarChar(10), novoModo)
      .input("parametrosAntes", sql.NVarChar(sql.MAX), linha.parametros)
      .input("parametrosDepois", sql.NVarChar(sql.MAX), parametrosTexto)
      .input("usuarioId", sql.UniqueIdentifier, usuario.id)
      .input("usuarioNome", sql.NVarChar(200), usuario.nomeExibicao)
      .query(`
        INSERT INTO dbo.portal_3dx_plugins_historico_config
          ([plugin_chave], [ambiente], [modo_antes], [modo_depois], [parametros_antes], [parametros_depois], [usuario_id], [usuario_nome])
        VALUES (@chave, @ambiente, @modoAntes, @modoDepois, @parametrosAntes, @parametrosDepois, @usuarioId, @usuarioNome);
      `);
    await transacao.commit();
  } catch (erro) {
    await transacao.rollback().catch(() => undefined);
    throw erro;
  }

  await registrarLog({
    nivel: "info",
    origem: "plugins-3dx/config",
    mensagem:
      novoModo !== linha.modo
        ? `Plugin ${chave} (${ambiente}): modo ${linha.modo} -> ${novoModo} (por ${usuario.nomeExibicao})`
        : `Plugin ${chave} (${ambiente}): parâmetros alterados (por ${usuario.nomeExibicao})`,
    detalhes: `antes: ${linha.parametros}\ndepois: ${parametrosTexto}`,
  });
}

// ------------------------------------------------------------------ execuções

interface ExecucaoRow {
  id: string;
  plugin_chave: string;
  ambiente: Ambiente3dx;
  gatilho: Execucao3dx["gatilho"];
  modo: ModoPlugin3dx;
  status: Execucao3dx["status"];
  correlacao_id: string | null;
  objeto_nome: string | null;
  objeto_revisao: string | null;
  objeto_titulo: string | null;
  objeto_tipo: string | null;
  ator_login: string | null;
  ator_nome: string | null;
  solicitado_por_nome: string | null;
  no: string | null;
  tentativas: number;
  enfileirado_em: string;
  iniciado_em: string | null;
  finalizado_em: string | null;
  duracao_ms: number | null;
  total_itens: number | null;
  total_ok: number | null;
  total_falhas: number | null;
  resumo: string | null;
  erro: string | null;
}

const SELECT_EXECUCAO = `
  CONVERT(VARCHAR(36), e.[id]) AS [id], e.[plugin_chave], e.[ambiente], e.[gatilho], e.[modo], e.[status],
  CONVERT(VARCHAR(36), e.[correlacao_id]) AS [correlacao_id], e.[objeto_nome], e.[objeto_revisao], e.[objeto_titulo],
  e.[objeto_tipo], e.[ator_login], u.[nome_exibicao] AS [ator_nome], e.[solicitado_por_nome], e.[no], e.[tentativas],
  CONVERT(VARCHAR(33), e.[enfileirado_em], 126) AS [enfileirado_em],
  CONVERT(VARCHAR(33), e.[iniciado_em], 126) AS [iniciado_em],
  CONVERT(VARCHAR(33), e.[finalizado_em], 126) AS [finalizado_em],
  e.[duracao_ms], e.[total_itens], e.[total_ok], e.[total_falhas], e.[resumo], e.[erro]`;

const FROM_EXECUCAO = `
  FROM dbo.portal_3dx_plugins_execucoes e
  LEFT JOIN dbo.portal_usuarios u ON u.[id] = e.[ator_usuario_id]`;

function mapearExecucao(row: ExecucaoRow): Execucao3dx {
  return {
    id: row.id.toLowerCase(),
    pluginChave: row.plugin_chave,
    ambiente: row.ambiente,
    gatilho: row.gatilho,
    modo: row.modo,
    status: row.status,
    correlacaoId: minusculo(row.correlacao_id),
    objetoNome: row.objeto_nome,
    objetoRevisao: row.objeto_revisao,
    objetoTitulo: row.objeto_titulo,
    objetoTipo: row.objeto_tipo,
    atorLogin: row.ator_login,
    atorNome: row.ator_nome,
    solicitadoPorNome: row.solicitado_por_nome,
    no: row.no,
    tentativas: row.tentativas,
    enfileiradoEm: row.enfileirado_em,
    iniciadoEm: row.iniciado_em,
    finalizadoEm: row.finalizado_em,
    duracaoMs: row.duracao_ms,
    totalItens: row.total_itens,
    totalOk: row.total_ok,
    totalFalhas: row.total_falhas,
    resumo: row.resumo,
    erro: row.erro,
  };
}

export async function listarExecucoes(filtros: FiltrosExecucoes3dx): Promise<PaginaExecucoes3dx> {
  const pagina = Math.max(1, filtros.pagina);
  const pool = await getSqlServerPool();
  const condicoes: string[] = [];

  function aplicar(request: ReturnType<typeof pool.request>) {
    if (filtros.ambiente) request.input("ambiente", sql.VarChar(10), filtros.ambiente);
    if (filtros.plugin) request.input("plugin", sql.VarChar(40), filtros.plugin);
    if (filtros.status) request.input("status", sql.VarChar(12), filtros.status);
    if (filtros.gatilho) request.input("gatilho", sql.VarChar(20), filtros.gatilho);
    if (filtros.busca) request.input("busca", sql.NVarChar(210), `%${filtros.busca}%`);
    if (filtros.de) request.input("de", sql.Date, filtros.de);
    if (filtros.ate) request.input("ate", sql.Date, filtros.ate);
    return request;
  }

  if (filtros.ambiente) condicoes.push("e.[ambiente] = @ambiente");
  if (filtros.plugin) condicoes.push("e.[plugin_chave] = @plugin");
  if (filtros.status) condicoes.push("e.[status] = @status");
  if (filtros.gatilho) condicoes.push("e.[gatilho] = @gatilho");
  if (filtros.de) condicoes.push("e.[enfileirado_em] >= @de");
  if (filtros.ate) condicoes.push("e.[enfileirado_em] < DATEADD(DAY, 1, CAST(@ate AS DATETIME2))");
  if (filtros.busca) {
    condicoes.push(`(e.[objeto_nome] LIKE @busca OR e.[objeto_titulo] LIKE @busca OR e.[ator_login] LIKE @busca
      OR EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_itens i WHERE i.[execucao_id] = e.[id]
                 AND (i.[alvo_nome] LIKE @busca OR i.[alvo_titulo] LIKE @busca)))`);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

  const total = await aplicar(pool.request()).query<{ total: number }>(
    `SELECT COUNT(*) AS [total] FROM dbo.portal_3dx_plugins_execucoes e ${where};`
  );

  const resultado = await aplicar(pool.request())
    .input("offset", sql.Int, (pagina - 1) * TAMANHO_PAGINA_EXECUCOES)
    .input("tamanho", sql.Int, TAMANHO_PAGINA_EXECUCOES)
    .query<ExecucaoRow>(`
      SELECT ${SELECT_EXECUCAO} ${FROM_EXECUCAO} ${where}
      ORDER BY e.[enfileirado_em] DESC
      OFFSET @offset ROWS FETCH NEXT @tamanho ROWS ONLY;
    `);

  return {
    execucoes: resultado.recordset.map(mapearExecucao),
    total: total.recordset[0]?.total ?? 0,
    pagina,
    tamanhoPagina: TAMANHO_PAGINA_EXECUCOES,
  };
}

interface ItemRow {
  id: string;
  ordem: number;
  acao: string;
  sucesso: boolean;
  alvo_nome: string | null;
  alvo_revisao: string | null;
  alvo_titulo: string | null;
  alvo_tipo: string | null;
  alvo_estado: string | null;
  alvo_owner: string | null;
  valor_antes: string | null;
  valor_depois: string | null;
  mensagem: string | null;
}

export async function obterExecucao(id: string): Promise<DetalheExecucao3dx | null> {
  const pool = await getSqlServerPool();
  const execucao = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<ExecucaoRow>(`SELECT ${SELECT_EXECUCAO} ${FROM_EXECUCAO} WHERE e.[id] = @id;`);
  const linha = execucao.recordset[0];
  if (!linha) return null;

  const [itens, eventos, relacionadas] = await Promise.all([
    pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query<ItemRow>(`
        SELECT CONVERT(VARCHAR(36), [id]) AS [id], [ordem], [acao], [sucesso], [alvo_nome], [alvo_revisao], [alvo_titulo],
          [alvo_tipo], [alvo_estado], [alvo_owner], [valor_antes], [valor_depois], [mensagem]
        FROM dbo.portal_3dx_plugins_itens
        WHERE [execucao_id] = @id
        ORDER BY [ordem];
      `),
    pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query<EventoRow>(`
        SELECT TOP (200) ${SELECT_EVENTO}
        FROM dbo.portal_3dx_plugins_eventos
        WHERE [execucao_id] = @id
        ORDER BY [criado_em];
      `),
    linha.correlacao_id
      ? pool
          .request()
          .input("id", sql.UniqueIdentifier, id)
          .input("correlacao", sql.UniqueIdentifier, linha.correlacao_id)
          .query<ExecucaoRow>(`
            SELECT ${SELECT_EXECUCAO} ${FROM_EXECUCAO}
            WHERE e.[correlacao_id] = @correlacao AND e.[id] <> @id
            ORDER BY e.[enfileirado_em];
          `)
      : Promise.resolve({ recordset: [] as ExecucaoRow[] }),
  ]);

  return {
    execucao: mapearExecucao(linha),
    itens: itens.recordset.map((row) => ({
      id: row.id.toLowerCase(),
      ordem: row.ordem,
      acao: row.acao,
      sucesso: row.sucesso,
      alvoNome: row.alvo_nome,
      alvoRevisao: row.alvo_revisao,
      alvoTitulo: row.alvo_titulo,
      alvoTipo: row.alvo_tipo,
      alvoEstado: row.alvo_estado,
      alvoOwner: row.alvo_owner,
      valorAntes: row.valor_antes,
      valorDepois: row.valor_depois,
      mensagem: row.mensagem,
    })) satisfies ItemExecucao3dx[],
    eventos: eventos.recordset.map(mapearEvento),
    relacionadas: relacionadas.recordset.map(mapearExecucao),
  };
}

// ------------------------------------------------------------------ ações manuais

export async function criarAcaoManual(acao: AcaoManual3dx, usuario: PortalUsuario): Promise<string> {
  if (!ehAmbiente(acao.ambiente)) throw new ValidationError("Escolha o ambiente (Produção ou Teste).");
  const pool = await getSqlServerPool();
  const plugin = await pool
    .request()
    .input("chave", sql.VarChar(40), acao.plugin)
    .input("ambiente", sql.VarChar(10), acao.ambiente)
    .query<{ modo: ModoPlugin3dx }>(
      "SELECT [modo] FROM dbo.portal_3dx_plugins_ambientes WHERE [plugin_chave] = @chave AND [ambiente] = @ambiente;"
    );
  const modo = plugin.recordset[0]?.modo;
  if (!modo) throw new ValidationError("Plugin não encontrado.");
  if (modo === "DESLIGADO") {
    throw new ValidationError(
      `O plugin está desligado em ${acao.ambiente === "PRODUCAO" ? "Produção" : "Teste"}: ligue em Simulação ou Ativo antes de pedir uma ação.`
    );
  }

  const ehVarredura = acao.acao === "varredura";
  const nome = ehVarredura ? "Varredura dos desenhos liberados" : acao.nome.trim();
  const parametros = ehVarredura
    ? { acao: "varredura", limite: acao.limite }
    : { acao: "reprocessar", nome };
  const dedup = ehVarredura ? "drw:varredura" : `manual:${acao.plugin}:${nome.toUpperCase()}`;

  try {
    const resultado = await pool
      .request()
      .input("plugin", sql.VarChar(40), acao.plugin)
      .input("ambiente", sql.VarChar(10), acao.ambiente)
      .input("modo", sql.VarChar(10), modo)
      .input("dedup", sql.NVarChar(200), dedup)
      .input("parametros", sql.NVarChar(sql.MAX), JSON.stringify(parametros))
      .input("nome", sql.NVarChar(200), nome)
      .input("usuarioId", sql.UniqueIdentifier, usuario.id)
      .input("usuarioNome", sql.NVarChar(200), usuario.nomeExibicao)
      .query<{ id: string }>(`
        INSERT INTO dbo.portal_3dx_plugins_execucoes
          ([plugin_chave], [ambiente], [gatilho], [modo], [status], [chave_dedup], [parametros], [objeto_nome],
           [solicitado_por_id], [solicitado_por_nome])
        OUTPUT CONVERT(VARCHAR(36), inserted.[id]) AS [id]
        VALUES (@plugin, @ambiente, 'manual', @modo, 'pendente', @dedup, @parametros, @nome, @usuarioId, @usuarioNome);
      `);
    const id = resultado.recordset[0].id.toLowerCase();
    await registrarLog({
      nivel: "info",
      origem: "plugins-3dx/acao",
      mensagem: `Ação manual em ${acao.plugin} (${acao.ambiente}): ${ehVarredura ? "varredura" : `reprocessar ${nome}`} (por ${usuario.nomeExibicao})`,
    });
    return id;
  } catch (erro) {
    if (ehChaveDuplicada(erro)) {
      throw new ValidationError("Já existe um trabalho igual na fila (pendente ou em processamento).");
    }
    throw erro;
  }
}

export async function cancelarExecucao(id: string, usuario: PortalUsuario): Promise<void> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("erro", sql.NVarChar(4000), `Cancelado no Portal por ${usuario.nomeExibicao}`)
    .query(`
      UPDATE dbo.portal_3dx_plugins_execucoes
      SET [status] = 'cancelada', [finalizado_em] = SYSDATETIME(), [erro] = @erro
      WHERE [id] = @id AND [status] = 'pendente';
    `);
  if ((resultado.rowsAffected[0] ?? 0) === 0) {
    throw new ValidationError("Só dá para cancelar trabalho pendente (este já começou ou terminou).");
  }
}

// ------------------------------------------------------------------ destinatários dos avisos

interface DestinatarioRow {
  id: string;
  plugin_chave: string;
  evento: string;
  ambiente: Ambiente3dx | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  usuario_email: string | null;
  email: string | null;
  nome: string | null;
  ativo: boolean;
  criado_em: string;
}

export async function listarDestinatarios(): Promise<Destinatario3dx[]> {
  const pool = await getSqlServerPool();
  const resultado = await pool.request().query<DestinatarioRow>(`
    SELECT CONVERT(VARCHAR(36), d.[id]) AS [id], d.[plugin_chave], d.[evento], d.[ambiente],
      CONVERT(VARCHAR(36), d.[usuario_id]) AS [usuario_id], u.[nome_exibicao] AS [usuario_nome],
      u.[email] AS [usuario_email], d.[email], d.[nome], d.[ativo],
      CONVERT(VARCHAR(33), d.[criado_em], 126) AS [criado_em]
    FROM dbo.portal_3dx_plugins_destinatarios d
    LEFT JOIN dbo.portal_usuarios u ON u.[id] = d.[usuario_id]
    ORDER BY d.[plugin_chave], d.[evento], COALESCE(u.[nome_exibicao], d.[nome], d.[email]);
  `);
  return resultado.recordset.map((row) => ({
    id: row.id.toLowerCase(),
    pluginChave: row.plugin_chave,
    evento: row.evento,
    ambiente: row.ambiente,
    usuarioId: minusculo(row.usuario_id),
    usuarioNome: row.usuario_nome,
    email: row.email,
    nome: row.nome,
    emailEfetivo: row.usuario_id ? row.usuario_email : row.email,
    ativo: row.ativo,
    criadoEm: row.criado_em,
  }));
}

export async function criarDestinatario(dados: NovoDestinatario3dx, usuario: PortalUsuario): Promise<void> {
  const evento = EVENTOS_AVISO_3DX[dados.evento];
  if (!evento || !evento.plugins.includes(dados.pluginChave)) {
    throw new ValidationError("Evento inválido para este plugin.");
  }
  if (dados.ambiente != null && !ehAmbiente(dados.ambiente)) throw new ValidationError("Ambiente inválido.");
  const email = dados.email?.trim() || null;
  if (!dados.usuarioId && !email) throw new ValidationError("Escolha um usuário ou informe um e-mail.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError("E-mail inválido.");

  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("plugin", sql.VarChar(40), dados.pluginChave)
    .input("evento", sql.VarChar(40), dados.evento)
    .input("ambiente", sql.VarChar(10), dados.ambiente ?? null)
    .input("usuarioId", sql.UniqueIdentifier, dados.usuarioId ?? null)
    .input("email", sql.NVarChar(320), dados.usuarioId ? null : email)
    .input("nome", sql.NVarChar(200), dados.usuarioId ? null : dados.nome?.trim() || null)
    .input("criadoPor", sql.UniqueIdentifier, usuario.id)
    .query(`
      INSERT INTO dbo.portal_3dx_plugins_destinatarios
        ([plugin_chave], [evento], [ambiente], [usuario_id], [email], [nome], [criado_por_id])
      VALUES (@plugin, @evento, @ambiente, @usuarioId, @email, @nome, @criadoPor);
    `);
}

export async function atualizarDestinatario(id: string, ativo: boolean): Promise<void> {
  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("ativo", sql.Bit, ativo)
    .query("UPDATE dbo.portal_3dx_plugins_destinatarios SET [ativo] = @ativo WHERE [id] = @id;");
}

export async function removerDestinatario(id: string): Promise<void> {
  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query("DELETE FROM dbo.portal_3dx_plugins_destinatarios WHERE [id] = @id;");
}
