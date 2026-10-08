import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import type { NivelLog } from "./logs";

export interface ModuloComLog {
  chave: string;
  nome: string;
}

/*
 * De que módulo é cada linha de portal_logs.
 *
 * Quem chama registrarLog() passa uma `origem` no formato
 * "modulo/acao" (ex: "integra-tubest/exportar", "aprovacoes") -- é o
 * prefixo antes da barra que diz o módulo. Sem este mapa, todo log
 * gravado por módulo nenhum caía como "Sistema" e sumia do filtro:
 * era o caso de 783 linhas da Integração TuBest e 32 das Aprovações.
 *
 * Para um módulo novo aparecer no filtro basta acrescentar uma linha
 * aqui, com o prefixo que ele usa em registrarLog.
 */
const ORIGENS_POR_MODULO: { prefixo: string; chave: string; nome: string }[] = [
  { prefixo: "integra-tubest", chave: "integra-tubest", nome: "Integração TuBest" },
  { prefixo: "aprovacoes", chave: "aprovacoes", nome: "Aprovações" },
  { prefixo: "chamados", chave: "chamados", nome: "Chamados" },
  { prefixo: "desenho-aprovacao", chave: "desenho-aprovacao", nome: "Desenho de Aprovação" },
  {
    prefixo: "substituicao-estrutura",
    chave: "substituicao-estrutura",
    nome: "Substituição de Estrutura",
  },
  {
    prefixo: "depara-materia-prima",
    chave: "depara-materia-prima",
    nome: "De-Para Matéria-Prima",
  },
  {
    prefixo: "estoque-equipamentos-usados",
    chave: "estoque-equipamentos-usados",
    nome: "Estoque de Equipamentos Usados",
  },
  {
    prefixo: "transferencia-arquivos",
    chave: "transferencia-arquivos",
    nome: "Transferência de Arquivos",
  },
  { prefixo: "terminal-fabrica", chave: "terminal-fabrica", nome: "Terminal de Fábrica" },
  /* Sem log próprio em portal_logs ainda, mas já aparecem pelas
     chamadas externas que registram (ver fetchMonitorado). */
  { prefixo: "integra-lantek", chave: "integra-lantek", nome: "Integração Lantek" },
  { prefixo: "semaforo", chave: "semaforo", nome: "Semáforo da Balança" },
];

/*
 * Só os módulos que hoje realmente geram alguma linha nas fontes
 * unificadas abaixo — não é a lista completa de portal_modulos (a
 * maioria das telas do portal não grava nenhum log/auditoria próprio,
 * só o acesso genérico já coberto pela aba "Acessos"). Ficam de fora
 * do UNION, de propósito, portal_monitoramento_requisicoes (tráfego
 * bruto de toda API, já tem a aba "APIs") e portal_acesso_modulo_historico
 * (já tem a aba "Acessos") — ambas são volume alto demais pra virar
 * "log" legível junto com o resto.
 *
 * Sai de ORIGENS_POR_MODULO para a lista do filtro e a classificação
 * nunca discordarem: um módulo que aparece numa, aparece na outra.
 */
export const MODULOS_COM_LOG: ModuloComLog[] = [
  { chave: "sistema", nome: "Sistema" },
  ...ORIGENS_POR_MODULO.map(({ chave, nome }) => ({ chave, nome })),
].sort((a, b) =>
  a.chave === "sistema" ? -1 : b.chave === "sistema" ? 1 : a.nome.localeCompare(b.nome, "pt-BR")
);

/* Valores vêm da constante acima, não de entrada de usuário; o escape
   está aqui por disciplina, não porque haja texto externo em jogo. */
function textoSql(valor: string): string {
  return `N'${valor.replace(/'/g, "''")}'`;
}

/* Monta o CASE que traduz o prefixo da origem em chave ou nome. */
function caseDoModulo(campo: "chave" | "nome"): string {
  const quando = ORIGENS_POR_MODULO.map(
    (modulo) => `WHEN '${modulo.prefixo}' THEN ${textoSql(modulo[campo])}`
  ).join("\n        ");

  return `CASE [prefixo_origem]
        ${quando}
        ELSE ${textoSql(campo === "chave" ? "sistema" : "Sistema")}
      END`;
}

export interface LogUnificado {
  id: string;
  moduloChave: string;
  moduloNome: string;
  fonte: string;
  nivel: NivelLog;
  mensagem: string;
  detalhes: string | null;
  criadoEm: string;
}

export interface FiltrosLogsUnificados {
  modulo?: string;
  nivel?: NivelLog;
  busca?: string;
  pagina: number;
  porPagina: number;
}

interface LogUnificadoRow {
  id: string;
  modulo_chave: string;
  modulo_nome: string;
  fonte: string;
  nivel: NivelLog;
  mensagem: string;
  detalhes: string | null;
  criado_em: Date;
}

function mapearLogUnificado(row: LogUnificadoRow): LogUnificado {
  return {
    id: row.id,
    moduloChave: row.modulo_chave,
    moduloNome: row.modulo_nome,
    fonte: row.fonte,
    nivel: row.nivel,
    mensagem: row.mensagem,
    detalhes: row.detalhes,
    criadoEm: row.criado_em.toISOString(),
  };
}

/*
 * Une, só pra LEITURA, todas as tabelas de log/tentativa/auditoria já
 * existentes no portal numa lista cronológica só — nenhuma tabela nem
 * tela dedicada existente é alterada por isso (nem escrita, nem
 * schema), isso apenas agrega o que cada uma já grava, pra dar uma
 * visão centralizada em Administração → Monitoramento → Logs. Cada
 * branch do UNION ALL normaliza suas colunas pro mesmo formato
 * (id/modulo_chave/modulo_nome/fonte/nivel/mensagem/detalhes/criado_em)
 * — "detalhes" carrega o que cada fonte tem de mais bruto pra
 * inspecionar (stack trace, corpo de resposta do ERP, payload
 * enviado...), ou uma linha curta de contexto quando não há nada mais
 * rico que isso pra mostrar.
 */
const TODAS_AS_FONTES_SQL = `
  SELECT
    'portal_logs:' + CONVERT(VARCHAR(36), [id]) AS [id],
    ${caseDoModulo("chave")} AS [modulo_chave],
    ${caseDoModulo("nome")} AS [modulo_nome],
    /* A origem completa ("integra-tubest/exportar") diz mais do que um
       rótulo fixo: nem todo log daqui é erro -- há muito registro de
       ação, em nível info. */
    CAST([origem] AS NVARCHAR(200)) AS [fonte],
    [nivel] AS [nivel],
    CAST([mensagem] AS NVARCHAR(1000)) AS [mensagem],
    [detalhes] AS [detalhes],
    [criado_em] AS [criado_em]
  FROM dbo.portal_logs
  /* O módulo é o pedaço antes da primeira barra da origem. */
  CROSS APPLY (
    SELECT LOWER(LTRIM(RTRIM(
      LEFT([origem],
        CASE
          WHEN CHARINDEX('/', [origem]) > 0 THEN CHARINDEX('/', [origem]) - 1
          ELSE LEN([origem])
        END)
    ))) AS [prefixo_origem]
  ) AS [origem_partida]

  UNION ALL

  SELECT
    'login:' + CONVERT(VARCHAR(36), [id]),
    'sistema',
    N'Sistema',
    N'Login',
    CASE WHEN [sucesso] = 1 THEN 'info' ELSE 'aviso' END,
    CAST(
      CASE WHEN [sucesso] = 1
        THEN N'Login bem-sucedido de "' + ISNULL([sam_account_name_tentado], N'-') + N'".'
        ELSE N'Falha de login para "' + ISNULL([sam_account_name_tentado], N'-') + N'"' + ISNULL(N' — ' + [motivo_falha], N'') + N'.'
      END
    AS NVARCHAR(1000)),
    N'IP: ' + ISNULL([ip_origem], N'-') + N' · User-Agent: ' + ISNULL([user_agent], N'-'),
    [criado_em]
  FROM dbo.portal_login_historico

  UNION ALL

  SELECT
    'chamada_externa:' + CONVERT(VARCHAR(36), [id]),
    [chave_resolvida],
    ${caseDoModulo("nome").replace("[prefixo_origem]", "[chave_resolvida]")},
    N'Chamada externa (' + ISNULL([servico], N'-') + N')',
    CASE WHEN [sucesso] = 1 THEN 'info' ELSE 'erro' END,
    CAST(
      ISNULL(N'[' + [metodo] + N'] ', N'')
      + N'Chamada ao serviço "' + ISNULL([servico], N'-') + N'" '
      + CASE WHEN [sucesso] = 1 THEN N'concluída com sucesso' ELSE N'falhou' END
      + ISNULL(N' (HTTP ' + CONVERT(NVARCHAR(10), [status_http]) + N')', N'')
      + ISNULL(N': ' + [mensagem_erro], N'')
      + N' (' + CONVERT(NVARCHAR(20), ISNULL([duracao_ms], 0)) + N' ms).'
    AS NVARCHAR(1000)),
    /* O detalhe guarda o que foi pedido e o que voltou -- é para isso
       que serve abrir a linha do log. */
    CASE
      WHEN [url] IS NULL THEN NULL
      ELSE N'URL: ' + [url]
        + ISNULL(NCHAR(13) + NCHAR(10) + N'--- requisição ---' + NCHAR(13) + NCHAR(10) + [requisicao], N'')
        + ISNULL(NCHAR(13) + NCHAR(10) + N'--- resposta ---' + NCHAR(13) + NCHAR(10) + [resposta], N'')
    END,
    [criado_em]
  FROM dbo.portal_monitoramento_chamadas_externas
  /*
   * modulo_chave vem preenchido desde que a chamada passou a usar o
   * fetchMonitorado; linha antiga (ou serviço sem módulo próprio) cai
   * no CASE por serviço.
   */
  CROSS APPLY (
    SELECT ISNULL([modulo_chave], CASE
      WHEN [servico] LIKE 'erp_estoque_usados%' THEN 'estoque-equipamentos-usados'
      WHEN [servico] = 'erp_materia_prima' THEN 'depara-materia-prima'
      WHEN [servico] = 'erp_estrutura' THEN 'substituicao-estrutura'
      WHEN [servico] = 'erp_integra_tubest' THEN 'integra-tubest'
      WHEN [servico] = 'erp_integra_lantek' THEN 'integra-lantek'
      WHEN [servico] = 'semaforo' THEN 'semaforo'
      ELSE 'sistema'
    END) AS [chave_resolvida]
  ) AS [modulo_da_chamada]

  UNION ALL

  SELECT
    'tentativa_nome:' + CONVERT(VARCHAR(36), [id]),
    'chamados',
    N'Chamados',
    N'Tentativa de consulta por nome',
    CASE WHEN [sucesso] = 1 THEN 'info' ELSE 'aviso' END,
    CAST(
      CASE WHEN [sucesso] = 1
        THEN N'Consulta de chamado por nome bem-sucedida.'
        ELSE N'Tentativa de consulta de chamado por nome falhou (nome incorreto).'
      END
    AS NVARCHAR(1000)),
    N'Chamado: ' + CONVERT(VARCHAR(36), [chamado_id]),
    [tentado_em]
  FROM dbo.portal_chamados_tentativas_nome

  UNION ALL

  SELECT
    'notif_email:' + CONVERT(VARCHAR(36), [id]),
    'chamados',
    N'Chamados',
    N'Notificação por e-mail',
    CASE WHEN [sucesso] = 1 THEN 'info' ELSE 'erro' END,
    CAST(
      N'Chamado #' + CONVERT(NVARCHAR(20), [chamado_numero]) + N' ("' + ISNULL([chamado_titulo], N'-') + N'") — evento "' + ISNULL([evento], N'-') + N'" para ' + ISNULL([destinatario_nome], N'-') + N' <' + ISNULL([destinatario_email], N'-') + N'>: '
      + CASE WHEN [sucesso] = 1 THEN N'enviado com sucesso' ELSE N'falha no envio' END
      + ISNULL(N' — ' + [erro_mensagem], N'') + N'.'
    AS NVARCHAR(1000)),
    [assunto],
    [enviado_em]
  FROM dbo.portal_chamados_notificacoes_email

  UNION ALL

  SELECT
    'terminal_busca:' + CONVERT(VARCHAR(36), [id]),
    'terminal-fabrica',
    N'Terminal de Fábrica',
    N'Busca de código',
    CASE WHEN [encontrado] = 1 THEN 'info' ELSE 'aviso' END,
    CAST(
      N'Busca por "' + ISNULL([codigo_buscado], N'-') + N'" — ' + CASE WHEN [encontrado] = 1 THEN N'encontrado' ELSE N'não encontrado' END + N'.'
    AS NVARCHAR(1000)),
    N'IP: ' + ISNULL([ip_origem], N'-'),
    [buscado_em]
  FROM dbo.portal_terminal_fabrica_buscas

  UNION ALL

  SELECT
    'terminal_impressao:' + CONVERT(VARCHAR(36), i.[id]),
    'terminal-fabrica',
    N'Terminal de Fábrica',
    N'Impressão de desenho',
    'info',
    CAST(
      N'Desenho do item "' + ISNULL(i.[codigo_item], N'-') + N'" enviado para impressão por '
      + ISNULL(u.[nome_exibicao], N'-')
      + CASE WHEN i.[total_paginas] IS NOT NULL
          THEN N' (' + CONVERT(NVARCHAR(20), i.[total_paginas]) + N' página(s))'
          ELSE N'' END
      + N'.'
    AS NVARCHAR(1000)),
    N'IP: ' + ISNULL(i.[ip_origem], N'-'),
    i.[impresso_em]
  FROM dbo.portal_terminal_fabrica_impressoes AS i
  LEFT JOIN dbo.portal_usuarios AS u ON u.[id] = i.[usuario_id]

  UNION ALL

  SELECT
    'transf_acesso:' + CONVERT(VARCHAR(36), [id]),
    'transferencia-arquivos',
    N'Transferência de Arquivos',
    N'Acesso a arquivo',
    'info',
    CAST(
      N'Arquivo "' + ISNULL([arquivo_nome_original], N'-') + N'" — ' + ISNULL([tipo], N'-') + N' por ' + ISNULL([usuario_nome_snapshot], N'anônimo') + N'.'
    AS NVARCHAR(1000)),
    N'IP: ' + ISNULL([ip], N'-'),
    [criado_em]
  FROM dbo.portal_transferencia_acessos

  UNION ALL

  SELECT
    'desenho_hist:' + CONVERT(VARCHAR(36), [id]),
    'desenho-aprovacao',
    N'Desenho de Aprovação',
    N'Auditoria de desenho',
    CASE WHEN [status_novo] = 'reprovado' THEN 'aviso' ELSE 'info' END,
    CAST(
      N'Ação "' + ISNULL([acao], N'-') + N'"'
      + CASE WHEN [status_anterior] IS NOT NULL OR [status_novo] IS NOT NULL
          THEN N' (' + ISNULL([status_anterior], N'-') + N' → ' + ISNULL([status_novo], N'-') + N')'
          ELSE N'' END
      + N' por ' + ISNULL([usuario], N'sistema') + N'.'
    AS NVARCHAR(1000)),
    [observacao],
    [criado_em]
  FROM dbo.eng_desenhos_aprovacao_historico

  UNION ALL

  SELECT
    'template_hist:' + CONVERT(VARCHAR(36), [id]),
    'desenho-aprovacao',
    N'Desenho de Aprovação',
    N'Auditoria de template',
    CASE WHEN [status_novo] = 'reprovado' THEN 'aviso' ELSE 'info' END,
    CAST(
      N'Ação "' + ISNULL([acao], N'-') + N'"'
      + CASE WHEN [status_anterior] IS NOT NULL OR [status_novo] IS NOT NULL
          THEN N' (' + ISNULL([status_anterior], N'-') + N' → ' + ISNULL([status_novo], N'-') + N')'
          ELSE N'' END
      + N' por ' + ISNULL([usuario], N'sistema') + N'.'
    AS NVARCHAR(1000)),
    [observacao],
    [criado_em]
  FROM dbo.eng_templates_aprovacao_historico

  UNION ALL

  SELECT
    'estrutura_sub:' + CONVERT(VARCHAR(36), [id]),
    'substituicao-estrutura',
    N'Substituição de Estrutura',
    N'Tentativa de substituição',
    CASE WHEN [sucesso] = 1 THEN 'info' ELSE 'erro' END,
    CAST(
      N'Código "' + ISNULL([codigo_antigo], N'-') + N'" → "' + ISNULL([codigo_novo], N'-') + N'" em ' + ISNULL([cod_pai], N'-') + N' (' + ISNULL([ambiente], N'-') + N') por ' + ISNULL([usuario_nome], N'-') + N': '
      + CASE WHEN [sucesso] = 1 THEN N'sucesso' ELSE N'falha' END
      + ISNULL(N' — ' + [mensagem_erro], N'') + N'.'
    AS NVARCHAR(1000)),
    [payload_enviado],
    [criado_em]
  FROM dbo.eng_estrutura_substituicao_historico

  UNION ALL

  SELECT
    'sinc_materia_prima:' + CONVERT(VARCHAR(36), [id]),
    'depara-materia-prima',
    N'De-Para Matéria-Prima',
    N'Sincronização com ERP',
    CASE [status]
      WHEN 'sucesso' THEN 'info'
      WHEN 'erro' THEN 'erro'
      ELSE 'aviso'
    END,
    CAST(
      N'Sincronização da empresa ' + ISNULL([cod_empresa], N'-') + N' — status "' + ISNULL([status], N'-') + N'"'
      + CASE WHEN [total_itens] IS NOT NULL THEN N' (' + CONVERT(NVARCHAR(20), [total_itens]) + N' itens)' ELSE N'' END
      + ISNULL(N': ' + [mensagem_erro], N'')
      + N', disparado por ' + ISNULL([disparado_por], N'agendador automático') + N'.'
    AS NVARCHAR(1000)),
    NULL,
    [iniciado_em]
  FROM dbo.eng_man_sincronizacao_logs

  UNION ALL

  SELECT
    'nf_integracao:' + CONVERT(VARCHAR(36), [id]),
    'estoque-equipamentos-usados',
    N'Estoque de Equipamentos Usados',
    N'Tentativa de integração NF (' + ISNULL([tipo_nf], N'-') + N')',
    CASE [status]
      WHEN 'sucesso' THEN 'info'
      WHEN 'nao_encontrado' THEN 'aviso'
      ELSE 'erro'
    END,
    CAST(ISNULL([mensagem], N'-') AS NVARCHAR(1000)),
    [response_body],
    [finalizado_em]
  FROM dbo.com_estoque_integracao_nf_logs
`;

export async function listarLogsUnificados(
  filtros: FiltrosLogsUnificados
): Promise<{ itens: LogUnificado[]; total: number }> {
  const pool = await getSqlServerPool();

  const condicoes: string[] = [];
  const requestItens = pool.request();
  const requestTotal = pool.request();

  if (filtros.modulo) {
    requestItens.input("modulo", sql.VarChar(60), filtros.modulo);
    requestTotal.input("modulo", sql.VarChar(60), filtros.modulo);
    condicoes.push("[modulo_chave] = @modulo");
  }

  if (filtros.nivel) {
    requestItens.input("nivel", sql.VarChar(10), filtros.nivel);
    requestTotal.input("nivel", sql.VarChar(10), filtros.nivel);
    condicoes.push("[nivel] = @nivel");
  }

  if (filtros.busca) {
    requestItens.input("busca", sql.NVarChar(200), `%${filtros.busca}%`);
    requestTotal.input("busca", sql.NVarChar(200), `%${filtros.busca}%`);
    condicoes.push("([mensagem] LIKE @busca OR [fonte] LIKE @busca)");
  }

  const whereClause = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";

  const offset = (filtros.pagina - 1) * filtros.porPagina;
  requestItens.input("offset", sql.Int, offset);
  requestItens.input("porPagina", sql.Int, filtros.porPagina);

  const [itensResult, totalResult] = await Promise.all([
    requestItens.query<LogUnificadoRow>(`
      WITH todos_os_logs AS (${TODAS_AS_FONTES_SQL})
      SELECT * FROM todos_os_logs
      ${whereClause}
      ORDER BY [criado_em] DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `),
    requestTotal.query<{ total: number }>(`
      WITH todos_os_logs AS (${TODAS_AS_FONTES_SQL})
      SELECT COUNT(*) AS [total] FROM todos_os_logs
      ${whereClause};
    `),
  ]);

  return {
    itens: itensResult.recordset.map(mapearLogUnificado),
    total: totalResult.recordset[0]?.total ?? 0,
  };
}
