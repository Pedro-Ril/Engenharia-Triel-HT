import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import type {
  DivergenciasMaquina,
  MaquinaNvidia,
} from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

import type { EstadoWorkstation } from "./estado";

export type MaquinaSemStatus = Omit<MaquinaNvidia, "status">;

interface MaquinaRow {
  id: string;
  computador: string;
  descricao: string | null;
  ativo: boolean;
  coleta_em: string | null;
  coleta_ok: boolean | null;
  coleta_erro: string | null;
  contato_em: string | null;
  alerta_sem_contato_enviado: boolean;
  verificado_em: string | null;
  executado_como: string | null;
  gpu: string | null;
  driver_windows: string | null;
  driver_nvidia: string | null;
  data_driver: string | null;
  conforme: boolean | null;
  acao: string | null;
  erro_script: string | null;
  perfil_hash: string | null;
  divergencias_json: string | null;
  ultima_reaplicacao_em: string | null;
  ultima_reaplicacao_sucesso: boolean | null;
  criado_em: string;
  minutos_desde_contato: number;
}

/* Campos usados pelo coletor para comparar uma coleta com a anterior. */
export interface MaquinaParaColeta extends MaquinaSemStatus {
  alertaSemContatoEnviado: boolean;
  minutosDesdeContato: number;
}

const COLUNAS = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [computador],
  [descricao],
  [ativo],
  CONVERT(VARCHAR(33), [coleta_em], 126) AS [coleta_em],
  [coleta_ok],
  [coleta_erro],
  CONVERT(VARCHAR(33), [contato_em], 126) AS [contato_em],
  [alerta_sem_contato_enviado],
  [verificado_em],
  [executado_como],
  [gpu],
  [driver_windows],
  [driver_nvidia],
  [data_driver],
  [conforme],
  [acao],
  [erro_script],
  [perfil_hash],
  [divergencias_json],
  [ultima_reaplicacao_em],
  [ultima_reaplicacao_sucesso],
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
  DATEDIFF(MINUTE, COALESCE([contato_em], [criado_em]), SYSDATETIME()) AS [minutos_desde_contato]
`;

function lerDivergencias(json: string | null): DivergenciasMaquina | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as DivergenciasMaquina;
  } catch {
    return null;
  }
}

function mapear(row: MaquinaRow): MaquinaParaColeta {
  return {
    id: row.id.toLowerCase(),
    computador: row.computador,
    descricao: row.descricao,
    ativo: row.ativo,
    coletaEm: row.coleta_em,
    coletaOk: row.coleta_ok,
    coletaErro: row.coleta_erro,
    contatoEm: row.contato_em,
    verificadoEm: row.verificado_em,
    executadoComo: row.executado_como,
    gpu: row.gpu,
    driverWindows: row.driver_windows,
    driverNvidia: row.driver_nvidia,
    dataDriver: row.data_driver,
    conforme: row.conforme,
    acao: row.acao,
    erroScript: row.erro_script,
    perfilHash: row.perfil_hash,
    divergencias: lerDivergencias(row.divergencias_json),
    ultimaReaplicacaoEm: row.ultima_reaplicacao_em,
    ultimaReaplicacaoSucesso: row.ultima_reaplicacao_sucesso,
    criadoEm: row.criado_em,
    alertaSemContatoEnviado: row.alerta_sem_contato_enviado,
    minutosDesdeContato: row.minutos_desde_contato,
  };
}

export async function listarMaquinas(opcoes?: { somenteAtivas?: boolean }): Promise<MaquinaParaColeta[]> {
  const pool = await getSqlServerPool();
  const result = await pool.request().query<MaquinaRow>(`
    SELECT ${COLUNAS}
    FROM dbo.portal_ws_nvidia_maquinas
    ${opcoes?.somenteAtivas ? "WHERE [ativo] = 1" : ""}
    ORDER BY [computador];
  `);
  return result.recordset.map(mapear);
}

export async function buscarMaquina(id: string): Promise<MaquinaParaColeta | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query<MaquinaRow>(`
    SELECT ${COLUNAS}
    FROM dbo.portal_ws_nvidia_maquinas
    WHERE [id] = @id;
  `);
  return result.recordset[0] ? mapear(result.recordset[0]) : null;
}

/*
 * Nome NetBIOS ou DNS (ENGAGRO02, engagro02.trielht.local) — só letras,
 * números, ponto e hífen, que é também o que torna seguro montar o
 * caminho UNC com ele.
 */
const padraoComputador = /^[A-Za-z0-9][A-Za-z0-9.-]{0,99}$/;

export function normalizarNomesComputadores(texto: string): string[] {
  const nomes = texto
    .split(/[\s,;]+/)
    .map((nome) => nome.trim().replace(/^\\+/, "").toUpperCase())
    .filter(Boolean);

  const invalido = nomes.find((nome) => !padraoComputador.test(nome));
  if (invalido) {
    throw new ValidationError(
      `"${invalido}" não é um nome de computador válido (use só letras, números, ponto e hífen).`
    );
  }

  return [...new Set(nomes)];
}

export async function adicionarMaquinas(
  computadores: string[],
  criadoPor: string
): Promise<{ adicionadas: string[]; jaExistiam: string[] }> {
  if (computadores.length === 0) {
    throw new ValidationError("Informe pelo menos um nome de computador.");
  }
  if (computadores.length > 500) {
    throw new ValidationError("Adicione no máximo 500 máquinas de uma vez.");
  }

  const pool = await getSqlServerPool();
  const existentes = await pool.request().query<{ computador: string }>(`
    SELECT [computador] FROM dbo.portal_ws_nvidia_maquinas;
  `);
  const jaCadastradas = new Set(existentes.recordset.map((row) => row.computador.toUpperCase()));

  const adicionadas: string[] = [];
  const jaExistiam: string[] = [];

  for (const computador of computadores) {
    if (jaCadastradas.has(computador)) {
      jaExistiam.push(computador);
      continue;
    }

    const request = pool.request();
    request.input("computador", sql.NVarChar(100), computador);
    request.input("criadoPor", sql.NVarChar(150), criadoPor);
    await request.query(`
      INSERT INTO dbo.portal_ws_nvidia_maquinas ([computador], [criado_por])
      VALUES (@computador, @criadoPor);
    `);
    adicionadas.push(computador);
  }

  return { adicionadas, jaExistiam };
}

export async function atualizarMaquina(
  id: string,
  dados: { ativo?: boolean; descricao?: string | null }
): Promise<MaquinaParaColeta | null> {
  const sets: string[] = [];
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  if (dados.ativo !== undefined) {
    sets.push("[ativo] = @ativo");
    request.input("ativo", sql.Bit, dados.ativo);
  }
  if (dados.descricao !== undefined) {
    sets.push("[descricao] = @descricao");
    request.input("descricao", sql.NVarChar(200), dados.descricao);
  }

  if (sets.length > 0) {
    await request.query(`
      UPDATE dbo.portal_ws_nvidia_maquinas SET ${sets.join(", ")} WHERE [id] = @id;
    `);
  }

  return buscarMaquina(id);
}

export async function excluirMaquina(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  const result = await request.query(`
    DELETE FROM dbo.portal_ws_nvidia_maquinas WHERE [id] = @id;
  `);
  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function gravarColetaComSucesso(
  id: string,
  estado: EstadoWorkstation,
  alertaSemContatoEnviado: boolean
): Promise<void> {
  const divergencias: DivergenciasMaquina = {
    encontradas: estado.divergenciasEncontradas,
    aposReaplicar: estado.divergenciasAposReaplicar,
  };

  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  request.input("alerta", sql.Bit, alertaSemContatoEnviado);
  request.input("verificadoEm", sql.NVarChar(40), estado.verificadoEm);
  request.input("executadoComo", sql.NVarChar(150), estado.executadoComo);
  request.input("gpu", sql.NVarChar(150), estado.gpu?.nome ?? null);
  request.input("driverWindows", sql.NVarChar(30), estado.gpu?.driverWindows ?? null);
  request.input("driverNvidia", sql.NVarChar(20), estado.gpu?.driverNvidia ?? null);
  request.input("dataDriver", sql.NVarChar(10), estado.gpu?.dataDriver ?? null);
  request.input("conforme", sql.Bit, estado.conforme);
  request.input("acao", sql.NVarChar(30), estado.acao);
  request.input("erroScript", sql.NVarChar(1000), estado.erro);
  request.input("perfilHash", sql.NVarChar(64), estado.perfilHash);
  request.input("divergencias", sql.NVarChar(sql.MAX), JSON.stringify(divergencias));
  request.input("reaplicacaoEm", sql.NVarChar(40), estado.ultimaReaplicacao?.em ?? null);
  request.input("reaplicacaoSucesso", sql.Bit, estado.ultimaReaplicacao?.sucesso ?? null);

  await request.query(`
    UPDATE dbo.portal_ws_nvidia_maquinas SET
      [coleta_em] = SYSDATETIME(),
      [coleta_ok] = 1,
      [coleta_erro] = NULL,
      [contato_em] = SYSDATETIME(),
      [alerta_sem_contato_enviado] = @alerta,
      [verificado_em] = @verificadoEm,
      [executado_como] = @executadoComo,
      [gpu] = @gpu,
      [driver_windows] = @driverWindows,
      [driver_nvidia] = @driverNvidia,
      [data_driver] = @dataDriver,
      [conforme] = @conforme,
      [acao] = @acao,
      [erro_script] = @erroScript,
      [perfil_hash] = @perfilHash,
      [divergencias_json] = @divergencias,
      [ultima_reaplicacao_em] = @reaplicacaoEm,
      [ultima_reaplicacao_sucesso] = @reaplicacaoSucesso
    WHERE [id] = @id;
  `);
}

/* Falha de leitura: mantém a última foto do estado.json, só registra a tentativa. */
export async function gravarColetaComFalha(
  id: string,
  erro: string,
  alertaSemContatoEnviado: boolean
): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);
  request.input("erro", sql.NVarChar(500), erro.slice(0, 500));
  request.input("alerta", sql.Bit, alertaSemContatoEnviado);

  await request.query(`
    UPDATE dbo.portal_ws_nvidia_maquinas SET
      [coleta_em] = SYSDATETIME(),
      [coleta_ok] = 0,
      [coleta_erro] = @erro,
      [alerta_sem_contato_enviado] = @alerta
    WHERE [id] = @id;
  `);
}
