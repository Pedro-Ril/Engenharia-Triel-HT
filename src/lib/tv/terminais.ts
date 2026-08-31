import "server-only";

import { NextResponse } from "next/server";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

import { calcularHashAgente } from "./agente-hash";
import {
  criarTokenTerminal,
  gerarCodigoPareamento,
  hashTokenTerminal,
  verificarTokenTerminal,
} from "./terminal-token";

export interface TerminalTv {
  id: string;
  nome: string | null;
  status: "aguardando_pareamento" | "pareado";
  codigoPareamento: string | null;
  ultimoHeartbeatEm: string | null;
  intervaloAtualizacaoSegundos: number;
  gradeId: string | null;
  caminhoInicial: string | null;
  criadoEm: string;
  revogadoEm: string | null;
  agenteUltimaVerificacaoEm: string | null;
  /*
   * null = nunca reportou (terminal rodando direto no navegador, sem
   * agente nativo) — computado só em listarTerminais, comparando
   * contra o hash atual do agente.mjs servido hoje; não faz parte das
   * colunas cruas da tabela.
   */
  agenteAtualizado: boolean | null;
  agenteIp: string | null;
  agenteCpuPercentual: number | null;
  agenteMemoriaPercentual: number | null;
  agenteProximaVerificacaoEm: string | null;
  agenteSistemaOperacional: string | null;
  empresa: string | null;
}

const colunasTerminal = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [nome],
  [status],
  [codigo_pareamento],
  CONVERT(VARCHAR(33), [ultimo_heartbeat_em], 126) AS [ultimo_heartbeat_em],
  [intervalo_atualizacao_segundos],
  CONVERT(VARCHAR(36), [grade_id]) AS [grade_id],
  [caminho_inicial],
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), [revogado_em], 126) AS [revogado_em],
  CONVERT(VARCHAR(33), [agente_ultima_verificacao_em], 126) AS [agente_ultima_verificacao_em],
  [agente_hash_atual],
  [agente_ip],
  [agente_cpu_percentual],
  [agente_memoria_percentual],
  CONVERT(VARCHAR(33), [agente_proxima_verificacao_em], 126) AS [agente_proxima_verificacao_em],
  [agente_sistema_operacional],
  [empresa]
`;

const colunasTerminalOutput = `
  CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
  INSERTED.[nome],
  INSERTED.[status],
  INSERTED.[codigo_pareamento],
  CONVERT(VARCHAR(33), INSERTED.[ultimo_heartbeat_em], 126) AS [ultimo_heartbeat_em],
  INSERTED.[intervalo_atualizacao_segundos],
  CONVERT(VARCHAR(36), INSERTED.[grade_id]) AS [grade_id],
  INSERTED.[caminho_inicial],
  CONVERT(VARCHAR(33), INSERTED.[criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), INSERTED.[revogado_em], 126) AS [revogado_em],
  CONVERT(VARCHAR(33), INSERTED.[agente_ultima_verificacao_em], 126) AS [agente_ultima_verificacao_em],
  INSERTED.[agente_hash_atual],
  INSERTED.[agente_ip],
  INSERTED.[agente_cpu_percentual],
  INSERTED.[agente_memoria_percentual],
  CONVERT(VARCHAR(33), INSERTED.[agente_proxima_verificacao_em], 126) AS [agente_proxima_verificacao_em],
  INSERTED.[agente_sistema_operacional],
  INSERTED.[empresa]
`;

interface TerminalRow {
  id: string;
  nome: string | null;
  status: string;
  codigo_pareamento: string | null;
  ultimo_heartbeat_em: string | null;
  intervalo_atualizacao_segundos: number;
  grade_id: string | null;
  caminho_inicial: string | null;
  criado_em: string;
  revogado_em: string | null;
  agente_ultima_verificacao_em?: string | null;
  agente_hash_atual?: string | null;
  agente_ip?: string | null;
  agente_cpu_percentual?: number | null;
  agente_memoria_percentual?: number | null;
  agente_proxima_verificacao_em?: string | null;
  agente_sistema_operacional?: string | null;
  empresa?: string | null;
}

function mapTerminalRow(row: TerminalRow): TerminalTv {
  return {
    id: row.id,
    nome: row.nome,
    status: row.status as TerminalTv["status"],
    codigoPareamento: row.codigo_pareamento,
    ultimoHeartbeatEm: row.ultimo_heartbeat_em,
    intervaloAtualizacaoSegundos: row.intervalo_atualizacao_segundos,
    gradeId: row.grade_id,
    caminhoInicial: row.caminho_inicial,
    criadoEm: row.criado_em,
    revogadoEm: row.revogado_em,
    agenteUltimaVerificacaoEm: row.agente_ultima_verificacao_em ?? null,
    agenteAtualizado: null,
    agenteIp: row.agente_ip ?? null,
    agenteCpuPercentual: row.agente_cpu_percentual ?? null,
    agenteMemoriaPercentual: row.agente_memoria_percentual ?? null,
    agenteProximaVerificacaoEm: row.agente_proxima_verificacao_em ?? null,
    agenteSistemaOperacional: row.agente_sistema_operacional ?? null,
    empresa: row.empresa ?? null,
  };
}

/*
 * codigoEmpresa filtra pra só os terminais daquela empresa — usado
 * pela visão restrita em /tv-corporativa (ver
 * verificarAcessoModuloApi + PortalUsuario.codigoEmpresa), enquanto o
 * painel de admin chama sem argumento nenhum pra ver todos.
 */
export async function listarTerminais(codigoEmpresa?: string): Promise<TerminalTv[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  if (codigoEmpresa) {
    request.input("empresa", sql.NVarChar(30), codigoEmpresa);
  }

  /*
   * Só terminais já pareados — um terminal em "aguardando_pareamento"
   * é só um hardwareId que consultou a API uma vez, sem nome nem
   * dono definido ainda; não ajuda o admin ver essa linha antes de
   * parear (o pareamento em si não depende disso, só do código de 6
   * dígitos exibido na tela do terminal).
   */
  const result = await request.query<TerminalRow>(`
    SELECT ${colunasTerminal}
    FROM dbo.portal_tv_terminais
    WHERE [status] = 'pareado'
      ${codigoEmpresa ? "AND [empresa] = @empresa" : ""}
    ORDER BY [criado_em] DESC;
  `);

  const hashAtualDoAgente = await calcularHashAgente().catch(() => null);

  return result.recordset.map((row) => ({
    ...mapTerminalRow(row),
    agenteAtualizado:
      row.agente_hash_atual == null
        ? null
        : hashAtualDoAgente !== null && row.agente_hash_atual === hashAtualDoAgente,
  }));
}

const DURACAO_CODIGO_MS = 15 * 60 * 1000;

/*
 * Janela em que token_pendente_entrega ainda é devolvido depois do
 * pareamento — tempo de sobra pro agente nativo e o TvPlayer (que ele
 * lança) conseguirem, cada um no seu próprio poll, pegar o token
 * antes dele ser limpo do banco.
 */
const JANELA_ENTREGA_TOKEN_SEGUNDOS = 3 * 60;

export type RespostaConsultaPareamento =
  | { pareado: false; codigo: string }
  | { pareado: true; deviceToken: string | null };

/*
 * Chamada pela tela do terminal em polling, antes de ter um token
 * guardado. Cria o registro na primeira vez que aquele hardware
 * aparece, gera/renova o código de pareamento enquanto ninguém
 * reivindicou, e entrega o token em claro (uma única vez — ver
 * token_pendente_entrega) assim que um admin pareia.
 */
export async function consultarPareamento(
  identificadorHardware: string
): Promise<RespostaConsultaPareamento> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("identificadorHardware", sql.NVarChar(200), identificadorHardware);

  const existente = await request.query<{
    id: string;
    status: string;
    codigo_pareamento: string | null;
    codigo_pareamento_expira_em: string | null;
    revogado_em: Date | null;
    token_pendente_entrega: string | null;
    atualizado_em: string | null;
  }>(`
    SELECT [id], [status], [codigo_pareamento],
           CONVERT(VARCHAR(33), [codigo_pareamento_expira_em], 126) AS [codigo_pareamento_expira_em],
           [revogado_em], [token_pendente_entrega],
           CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em]
    FROM dbo.portal_tv_terminais
    WHERE [identificador_hardware] = @identificadorHardware;
  `);

  const terminal = existente.recordset[0];

  if (!terminal) {
    const codigo = gerarCodigoPareamento();
    const insertRequest = pool.request();
    insertRequest.input("identificadorHardware", sql.NVarChar(200), identificadorHardware);
    insertRequest.input("codigo", sql.VarChar(8), codigo);

    await insertRequest.query(`
      INSERT INTO dbo.portal_tv_terminais
        ([identificador_hardware], [codigo_pareamento], [codigo_pareamento_expira_em])
      VALUES (@identificadorHardware, @codigo, DATEADD(MILLISECOND, ${DURACAO_CODIGO_MS}, SYSDATETIME()));
    `);

    return { pareado: false, codigo };
  }

  if (terminal.status === "pareado" && !terminal.revogado_em) {
    if (terminal.token_pendente_entrega) {
      /*
       * Entrega por JANELA DE TEMPO, não mais "limpa no primeiro
       * read" — desde que o agente nativo passou a lançar o navegador
       * já com ?hardwareId= (sem esperar parear primeiro, ver
       * tv-agente/agente.mjs), existem DOIS consumidores concorrentes
       * consultando este mesmo endpoint depois do pareamento: o
       * próprio agente (pra guardar sua cópia do token) e o
       * TvPlayer rodando dentro do Chrome que ele acabou de abrir.
       * Limpar no primeiro read fazia um dos dois nunca receber o
       * token e ficar preso consultando pra sempre (bug real visto ao
       * vivo). Qualquer poll dentro da janela recebe o mesmo valor;
       * só é limpo depois que a janela passa.
       */
      const pareadoHaSegundos = terminal.atualizado_em
        ? (Date.now() - new Date(terminal.atualizado_em).getTime()) / 1000
        : Infinity;

      if (pareadoHaSegundos < JANELA_ENTREGA_TOKEN_SEGUNDOS) {
        return { pareado: true, deviceToken: terminal.token_pendente_entrega };
      }

      const limparRequest = pool.request();
      limparRequest.input("id", sql.UniqueIdentifier, terminal.id);
      await limparRequest.query(`
        UPDATE dbo.portal_tv_terminais
        SET [token_pendente_entrega] = NULL
        WHERE [id] = @id;
      `);

      return { pareado: true, deviceToken: null };
    }

    return { pareado: true, deviceToken: null };
  }

  /*
   * codigo_pareamento_expira_em vem como string naive (CONVERT ...126)
   * e é reinterpretada como hora local — o mesmo cuidado de
   * revogado_em em validarTokenDeTerminal. Selecionar a coluna crua
   * daria um objeto Date que o driver monta tratando os dígitos locais
   * como se já fossem UTC, adiantando o valor (aqui, ~3h no fuso do
   * Brasil) e fazendo o código parecer sempre expirado, mesmo recém
   * gerado — bug real encontrado testando ao vivo (código mudava a
   * cada consulta em vez de ficar estável por 15 minutos).
   */
  const codigoExpirado =
    !terminal.codigo_pareamento_expira_em ||
    new Date(terminal.codigo_pareamento_expira_em).getTime() <= Date.now();

  if (!codigoExpirado && terminal.codigo_pareamento && !terminal.revogado_em) {
    return { pareado: false, codigo: terminal.codigo_pareamento };
  }

  /* Código vencido, ou terminal revogado (precisa reparear do zero). */
  const novoCodigo = gerarCodigoPareamento();
  const renovarRequest = pool.request();
  renovarRequest.input("id", sql.UniqueIdentifier, terminal.id);
  renovarRequest.input("codigo", sql.VarChar(8), novoCodigo);

  await renovarRequest.query(`
    UPDATE dbo.portal_tv_terminais
    SET
      [status] = 'aguardando_pareamento',
      [codigo_pareamento] = @codigo,
      [codigo_pareamento_expira_em] = DATEADD(MILLISECOND, ${DURACAO_CODIGO_MS}, SYSDATETIME()),
      [token_hash] = NULL,
      [token_pendente_entrega] = NULL,
      [revogado_em] = NULL
    WHERE [id] = @id;
  `);

  return { pareado: false, codigo: novoCodigo };
}

/*
 * Ação do admin: digita o código exibido na tela do terminal e dá um
 * nome pra ele. Gera o token de dispositivo aqui — o valor em claro
 * só existe neste retorno e em token_pendente_entrega (até o terminal
 * buscar via consultarPareamento) — nunca mais é recuperável depois.
 */
export async function parearTerminal(params: {
  codigo: string;
  nome: string;
}): Promise<{ terminal: TerminalTv; tokenParaExibir: string }> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("codigo", sql.VarChar(8), params.codigo);

  const encontrado = await request.query<{ id: string }>(`
    SELECT [id]
    FROM dbo.portal_tv_terminais
    WHERE [codigo_pareamento] = @codigo
      AND [status] = 'aguardando_pareamento'
      AND [codigo_pareamento_expira_em] > SYSDATETIME();
  `);

  const terminal = encontrado.recordset[0];

  if (!terminal) {
    throw new ValidationError("Código inválido ou expirado. Peça pra tela gerar um novo.");
  }

  const token = await criarTokenTerminal(terminal.id);
  const tokenHash = hashTokenTerminal(token);

  const atualizarRequest = pool.request();
  atualizarRequest.input("id", sql.UniqueIdentifier, terminal.id);
  atualizarRequest.input("nome", sql.NVarChar(150), params.nome);
  atualizarRequest.input("tokenHash", sql.VarBinary(64), tokenHash);
  atualizarRequest.input("tokenPendente", sql.NVarChar(1000), token);

  const resultado = await atualizarRequest.query(`
    UPDATE dbo.portal_tv_terminais
    SET
      [nome] = @nome,
      [status] = 'pareado',
      [token_hash] = @tokenHash,
      [token_pendente_entrega] = @tokenPendente,
      [codigo_pareamento] = NULL,
      [codigo_pareamento_expira_em] = NULL,
      [atualizado_em] = SYSDATETIME()
    OUTPUT ${colunasTerminalOutput}
    WHERE [id] = @id;
  `);

  return { terminal: mapTerminalRow(resultado.recordset[0]), tokenParaExibir: token };
}

/*
 * codigoEmpresaExigida (3º argumento) restringe o UPDATE a um
 * terminal daquela empresa específica — usado pela rota restrita de
 * /tv-corporativa (um usuário comum só pode mexer nos terminais da
 * própria empresa); undefined = sem restrição, usado pelo admin.
 * Terminal de outra empresa simplesmente não bate no WHERE e o
 * retorno é null, como se não existisse.
 */
export async function atualizarTerminal(
  id: string,
  params: {
    nome?: string;
    intervaloAtualizacaoSegundos?: number;
    gradeId?: string | null;
    caminhoInicial?: string | null;
    empresa?: string | null;
  },
  codigoEmpresaExigida?: string
): Promise<TerminalTv | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);
  request.input("nome", sql.NVarChar(150), params.nome ?? null);
  request.input(
    "intervalo",
    sql.Int,
    params.intervaloAtualizacaoSegundos ?? null
  );
  request.input("gradeId", sql.UniqueIdentifier, params.gradeId ?? null);
  request.input(
    "caminhoInicialInformado",
    sql.Bit,
    Object.prototype.hasOwnProperty.call(params, "caminhoInicial")
  );
  request.input("caminhoInicial", sql.NVarChar(200), params.caminhoInicial ?? null);
  request.input(
    "empresaInformada",
    sql.Bit,
    Object.prototype.hasOwnProperty.call(params, "empresa")
  );
  request.input("empresa", sql.NVarChar(30), params.empresa ?? null);
  request.input("codigoEmpresaExigida", sql.NVarChar(30), codigoEmpresaExigida ?? null);

  const result = await request.query(`
    UPDATE dbo.portal_tv_terminais
    SET
      [nome] = COALESCE(@nome, [nome]),
      [intervalo_atualizacao_segundos] = COALESCE(@intervalo, [intervalo_atualizacao_segundos]),
      [grade_id] = CASE WHEN @gradeId IS NOT NULL THEN @gradeId ELSE [grade_id] END,
      [caminho_inicial] = CASE WHEN @caminhoInicialInformado = 1 THEN @caminhoInicial ELSE [caminho_inicial] END,
      [empresa] = CASE WHEN @empresaInformada = 1 THEN @empresa ELSE [empresa] END,
      [atualizado_em] = SYSDATETIME()
    OUTPUT ${colunasTerminalOutput}
    WHERE [id] = @id
      AND (@codigoEmpresaExigida IS NULL OR [empresa] = @codigoEmpresaExigida);
  `);

  const row = result.recordset[0];
  return row ? mapTerminalRow(row) : null;
}

export async function revogarTerminal(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    UPDATE dbo.portal_tv_terminais
    SET [revogado_em] = SYSDATETIME()
    WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function excluirTerminal(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    DELETE FROM dbo.portal_tv_terminais
    WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/*
 * Nunca lança — chamada a cada heartbeat do terminal (potencialmente
 * a cada minuto, de vários terminais), throttle evita um UPDATE por
 * heartbeat quando não muda nada de relevante.
 */
export async function registrarHeartbeatSemFalhar(terminalId: string): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();
    request.input("id", sql.UniqueIdentifier, terminalId);

    await request.query(`
      UPDATE dbo.portal_tv_terminais
      SET [ultimo_heartbeat_em] = SYSDATETIME()
      WHERE [id] = @id
        AND [revogado_em] IS NULL
        AND (
          [ultimo_heartbeat_em] IS NULL
          OR [ultimo_heartbeat_em] < DATEADD(SECOND, -20, SYSDATETIME())
        );
    `);
  } catch (error) {
    console.error("Erro ao registrar heartbeat de terminal de TV:", error);
  }
}

/*
 * Nunca lança — chamada a cada verificação periódica do agente nativo
 * (GET /api/tv/agente/config), a cada ~5 minutos por terminal.
 * Diferente do heartbeat do navegador: é sinal de vida do PROCESSO do
 * agente em si (que continua rodando mesmo com o navegador caindo e
 * sendo relançado), e carrega o hash que o agente está rodando agora
 * — o que alimenta o "atualizado"/"desatualizado" em listarTerminais.
 */
/*
 * Mesmo intervalo de INTERVALO_VERIFICAR_CONFIG_MS em tv-agente/agente.mjs
 * — usado só pra calcular a PRÓXIMA verificação esperada, gravada aqui
 * (no servidor, via SYSDATETIME()) em vez de confiar num timestamp
 * calculado pelo relógio do próprio agente. Evita depender do relógio
 * da máquina do terminal estar sincronizado, e evita reintroduzir o
 * bug de fuso horário (ver codigo_pareamento_expira_em) que apareceria
 * se um ISO string em UTC vindo do agente fosse gravado ao lado de
 * colunas que guardam hora local do servidor.
 */
const INTERVALO_VERIFICACAO_AGENTE_MS = 5 * 60 * 1000;

export async function registrarVerificacaoAgenteSemFalhar(
  terminalId: string,
  hashAtual: string,
  telemetria: {
    ip: string | null;
    cpuPercentual: number | null;
    memoriaPercentual: number | null;
    sistemaOperacional: string | null;
  }
): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();
    request.input("id", sql.UniqueIdentifier, terminalId);
    request.input("hashAtual", sql.VarChar(64), hashAtual);
    request.input("ip", sql.NVarChar(45), telemetria.ip);
    request.input("cpuPercentual", sql.Float, telemetria.cpuPercentual);
    request.input("memoriaPercentual", sql.Float, telemetria.memoriaPercentual);
    request.input("sistemaOperacional", sql.VarChar(20), telemetria.sistemaOperacional);

    await request.query(`
      UPDATE dbo.portal_tv_terminais
      SET
        [agente_ultima_verificacao_em] = SYSDATETIME(),
        [agente_proxima_verificacao_em] = DATEADD(MILLISECOND, ${INTERVALO_VERIFICACAO_AGENTE_MS}, SYSDATETIME()),
        [agente_hash_atual] = @hashAtual,
        [agente_ip] = @ip,
        [agente_cpu_percentual] = @cpuPercentual,
        [agente_memoria_percentual] = @memoriaPercentual,
        [agente_sistema_operacional] = @sistemaOperacional
      WHERE [id] = @id;
    `);
  } catch (error) {
    console.error("Erro ao registrar verificação de agente de TV:", error);
  }
}

export const COMANDOS_AGENTE = ["reiniciar_maquina", "atualizar_agente"] as const;
export type ComandoAgente = (typeof COMANDOS_AGENTE)[number];

/*
 * Só um comando pendente por vez (o mais recente sobrescreve) — o
 * agente busca isso na mesma consulta periódica de
 * /api/tv/agente/config, então executa "no próximo poll", até
 * INTERVALO_VERIFICAR_CONFIG_MS (5min) depois de pedido aqui. Não
 * resgata um agente travado/sem resposta — só funciona enquanto ele
 * continua consultando normalmente.
 */
export async function solicitarComandoAgente(
  terminalId: string,
  comando: ComandoAgente,
  codigoEmpresaExigida?: string
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, terminalId);
  request.input("comando", sql.VarChar(30), comando);
  request.input("codigoEmpresaExigida", sql.NVarChar(30), codigoEmpresaExigida ?? null);

  const result = await request.query(`
    UPDATE dbo.portal_tv_terminais
    SET [comando_pendente] = @comando
    WHERE [id] = @id AND [status] = 'pareado'
      AND (@codigoEmpresaExigida IS NULL OR [empresa] = @codigoEmpresaExigida);
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/*
 * Lê e limpa o comando pendente numa única ida ao banco (OUTPUT do
 * valor ANTES do UPDATE) — só o agente chama isso, então não tem a
 * disputa de dois consumidores concorrentes que token_pendente_entrega
 * tinha (ver consultarPareamento).
 */
export async function consumirComandoPendente(terminalId: string): Promise<string | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, terminalId);

  const result = await request.query<{ comando_pendente: string | null }>(`
    UPDATE dbo.portal_tv_terminais
    SET [comando_pendente] = NULL
    OUTPUT DELETED.[comando_pendente]
    WHERE [id] = @id;
  `);

  return result.recordset[0]?.comando_pendente ?? null;
}

/*
 * JANELA_VISUALIZACAO_MS precisa ser maior que o intervalo de polling
 * do admin em TelaVisualizacaoAoVivo (ver componente) e do terminal em
 * TvPlayer — cada heartbeat de "quero ver" desse admin renova o
 * carimbo; se o admin fechar a tela ou cair, o carimbo simplesmente
 * envelhece e o terminal para de transmitir sozinho no próximo poll.
 */
const JANELA_VISUALIZACAO_MS = 15_000;

export async function solicitarVisualizacao(
  terminalId: string,
  codigoEmpresaExigida?: string
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, terminalId);
  request.input("codigoEmpresaExigida", sql.NVarChar(30), codigoEmpresaExigida ?? null);

  const result = await request.query(`
    UPDATE dbo.portal_tv_terminais
    SET [visualizacao_solicitada_em] = SYSDATETIME()
    WHERE [id] = @id
      AND [status] = 'pareado'
      AND [revogado_em] IS NULL
      AND (@codigoEmpresaExigida IS NULL OR [empresa] = @codigoEmpresaExigida);
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function deveTransmitir(terminalId: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, terminalId);

  const result = await request.query<{ visualizacao_solicitada_em: string | null }>(`
    SELECT CONVERT(VARCHAR(33), [visualizacao_solicitada_em], 126) AS [visualizacao_solicitada_em]
    FROM dbo.portal_tv_terminais
    WHERE [id] = @id;
  `);

  const solicitadaEm = result.recordset[0]?.visualizacao_solicitada_em;
  if (!solicitadaEm) return false;

  return Date.now() - new Date(solicitadaEm).getTime() < JANELA_VISUALIZACAO_MS;
}

/*
 * Usado por toda rota /api/tv/** chamada pelo próprio terminal
 * (Authorization: Bearer <token>) — confere assinatura E que o
 * terminal não foi revogado desde que o token foi emitido (mesmo
 * truque de sessaoInvalidadaEm vs iat já usado pra sessão humana).
 */
export async function validarTokenDeTerminal(token: string): Promise<TerminalTv | null> {
  const payload = await verificarTokenTerminal(token);
  if (!payload) return null;

  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, payload.terminalId);

  const result = await request.query<{
    id: string;
    nome: string | null;
    status: string;
    codigo_pareamento: string | null;
    ultimo_heartbeat_em: string | null;
    intervalo_atualizacao_segundos: number;
    grade_id: string | null;
    caminho_inicial: string | null;
    criado_em: string;
    revogado_em: string | null;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [nome],
      [status],
      [codigo_pareamento],
      CONVERT(VARCHAR(33), [ultimo_heartbeat_em], 126) AS [ultimo_heartbeat_em],
      [intervalo_atualizacao_segundos],
      CONVERT(VARCHAR(36), [grade_id]) AS [grade_id],
      [caminho_inicial],
      CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
      CONVERT(VARCHAR(33), [revogado_em], 126) AS [revogado_em]
    FROM dbo.portal_tv_terminais
    WHERE [id] = @id AND [status] = 'pareado';
  `);

  const terminal = result.recordset[0];
  if (!terminal) return null;

  if (terminal.revogado_em) {
    /*
     * revogado_em vem como string naive (sem timezone, via CONVERT ...126)
     * — new Date(...) interpreta como hora local, igual ao resto do
     * arquivo. Selecionar a coluna crua daria um objeto Date que o driver
     * monta tratando os dígitos locais como se fossem UTC, adiantando o
     * valor em relação ao horário real e podendo ficar antes do iat do
     * token mesmo quando a revogação aconteceu depois.
     */
    const revogadoEmSegundos = Math.floor(new Date(terminal.revogado_em).getTime() / 1000);
    if (payload.iat < revogadoEmSegundos) return null;
  }

  return mapTerminalRow(terminal);
}

/*
 * Equivalente a requireAdminApi (src/lib/auth/autorizacao.ts), mas
 * pra rotas /api/tv/** chamadas pelo próprio terminal — autenticação
 * via header `Authorization: Bearer <token>`, nunca cookie (o
 * terminal é um processo não-interativo).
 */
export async function requireTerminalApi(
  request: Request
): Promise<
  | { terminal: TerminalTv; negado: null }
  | { terminal: null; negado: NextResponse }
> {
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;

  if (!token) {
    return {
      terminal: null,
      negado: NextResponse.json(
        { ok: false, message: "Token de terminal ausente." },
        { status: 401 }
      ),
    };
  }

  const terminal = await validarTokenDeTerminal(token);

  if (!terminal) {
    return {
      terminal: null,
      negado: NextResponse.json(
        { ok: false, message: "Token de terminal inválido ou revogado." },
        { status: 401 }
      ),
    };
  }

  return { terminal, negado: null };
}
