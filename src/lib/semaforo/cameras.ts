import "server-only";

import { randomBytes } from "node:crypto";

import { ValidationError } from "@/lib/auth/errors";
import { criptografarSegredo, descriptografarSegredo } from "@/lib/crypto/segredo";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { registrarCameraNoMediaMtx, removerCameraDoMediaMtx } from "./mediamtx";
import { resolverStreamUriOnvif } from "./onvif-client";

/*
 * Nunca inclui a senha (nem cifrada) -- toda linha desta tabela sempre
 * tem uma senha (coluna NOT NULL), diferente do singleton de config do
 * AD/SMTP que pode não existir ainda; por isso não precisa de uma flag
 * "senhaConfigurada" aqui, a própria existência da câmera já garante isso.
 */
export interface Camera {
  id: string;
  nome: string;
  host: string;
  portaOnvif: number;
  usuario: string;
  mediamtxPath: string;
  streamUriRtsp: string | null;
  perfilOnvif: string | null;
  ultimaVerificacaoEm: string | null;
  ultimoErroVerificacao: string | null;
  ativo: boolean;
  ordem: number;
  criadoEm: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

interface CameraRow {
  id: string;
  nome: string;
  host: string;
  porta_onvif: number;
  usuario: string;
  mediamtx_path: string;
  stream_uri_rtsp: string | null;
  perfil_onvif: string | null;
  ultima_verificacao_em: string | null;
  ultimo_erro_verificacao: string | null;
  ativo: boolean;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
  atualizado_por: string | null;
}

const colunasCamera = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [nome],
  [host],
  [porta_onvif],
  [usuario],
  [mediamtx_path],
  [stream_uri_rtsp],
  [perfil_onvif],
  CONVERT(VARCHAR(33), [ultima_verificacao_em], 126) AS [ultima_verificacao_em],
  [ultimo_erro_verificacao],
  [ativo],
  [ordem],
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
  [atualizado_por]
`;

function mapCameraRow(row: CameraRow): Camera {
  return {
    id: row.id,
    nome: row.nome,
    host: row.host,
    portaOnvif: row.porta_onvif,
    usuario: row.usuario,
    mediamtxPath: row.mediamtx_path,
    streamUriRtsp: row.stream_uri_rtsp,
    perfilOnvif: row.perfil_onvif,
    ultimaVerificacaoEm: row.ultima_verificacao_em,
    ultimoErroVerificacao: row.ultimo_erro_verificacao,
    ativo: row.ativo,
    ordem: row.ordem,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

/* "cam-" + 8 hex chars -- estável (gerado uma vez, nunca muda), usado como nome do path no MediaMTX e segmento da URL WHEP. */
function gerarMediamtxPath(): string {
  return `cam-${randomBytes(4).toString("hex")}`;
}

export async function listarCameras(somenteAtivas = false): Promise<Camera[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<CameraRow>(`
    SELECT ${colunasCamera}
    FROM dbo.com_semaforo_cameras
    ${somenteAtivas ? "WHERE [ativo] = 1" : ""}
    ORDER BY [ordem], [nome];
  `);

  return result.recordset.map(mapCameraRow);
}

export async function buscarCameraPorId(id: string): Promise<Camera | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<CameraRow>(`
      SELECT ${colunasCamera}
      FROM dbo.com_semaforo_cameras
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  return row ? mapCameraRow(row) : null;
}

/* Senha decifrada -- só pra uso interno (reteste de conexão, montagem da source do MediaMTX), nunca sai deste módulo pro cliente. */
export async function buscarSenhaDecifrada(id: string): Promise<string | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{ senha_cifrada: Buffer }>(`
      SELECT [senha_cifrada] FROM dbo.com_semaforo_cameras WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  return row ? descriptografarSegredo(row.senha_cifrada) : null;
}

async function proximaOrdem(pool: Awaited<ReturnType<typeof getSqlServerPool>>): Promise<number> {
  const result = await pool.request().query<{ proxima: number }>(`
    SELECT ISNULL(MAX([ordem]), -1) + 1 AS [proxima] FROM dbo.com_semaforo_cameras;
  `);
  return result.recordset[0]?.proxima ?? 0;
}

export interface CriarCameraParams {
  nome: string;
  host: string;
  portaOnvif: number;
  usuario: string;
  senha: string;
  atualizadoPor: string;
}

/*
 * Resolve a URI de stream via ONVIF e registra no MediaMTX -- nunca
 * lança: uma câmera temporariamente offline durante o cadastro não pode
 * impedir salvar as credenciais. Falha vira só um "ultimo_erro_verificacao"
 * gravado na própria câmera, visível no painel ("Testar conexão"/"Reverificar"
 * resolve isso depois, quando a câmera estiver acessível).
 */
async function verificarEregistrarNoMediamtx(params: {
  id: string;
  host: string;
  portaOnvif: number;
  usuario: string;
  senha: string;
  mediamtxPath: string;
}): Promise<void> {
  try {
    const resolucao = await resolverStreamUriOnvif({
      host: params.host,
      portaOnvif: params.portaOnvif,
      usuario: params.usuario,
      senha: params.senha,
    });

    await registrarResultadoVerificacao(params.id, {
      sucesso: true,
      streamUriRtsp: resolucao.streamUriRtsp,
      perfilOnvif: resolucao.perfilOnvif,
    });

    await registrarCameraNoMediaMtx({
      mediamtxPath: params.mediamtxPath,
      streamUriRtsp: resolucao.streamUriRtsp,
      usuario: params.usuario,
      senha: params.senha,
    });
  } catch (error) {
    const mensagemErro = error instanceof Error ? error.message : "Erro desconhecido ao verificar a câmera.";
    await registrarResultadoVerificacao(params.id, { sucesso: false, mensagemErro });
  }
}

export async function criarCamera(params: CriarCameraParams): Promise<Camera> {
  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .input("nome", sql.NVarChar(100), params.nome)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS [total] FROM dbo.com_semaforo_cameras WHERE [nome] = @nome;
    `);

  if (existente.recordset[0].total > 0) {
    throw new ValidationError(`Já existe uma câmera chamada "${params.nome}".`);
  }

  const ordem = await proximaOrdem(pool);
  const mediamtxPath = gerarMediamtxPath();

  const result = await pool
    .request()
    .input("nome", sql.NVarChar(100), params.nome)
    .input("host", sql.NVarChar(255), params.host)
    .input("portaOnvif", sql.Int, params.portaOnvif)
    .input("usuario", sql.NVarChar(150), params.usuario)
    .input("senhaCifrada", sql.VarBinary(512), criptografarSegredo(params.senha))
    .input("mediamtxPath", sql.VarChar(80), mediamtxPath)
    .input("ordem", sql.Int, ordem)
    .input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor)
    .query<{ id: string }>(`
      INSERT INTO dbo.com_semaforo_cameras
        ([nome], [host], [porta_onvif], [usuario], [senha_cifrada], [mediamtx_path], [ordem], [atualizado_por])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@nome, @host, @portaOnvif, @usuario, @senhaCifrada, @mediamtxPath, @ordem, @atualizadoPor);
    `);

  const id = result.recordset[0].id;

  await verificarEregistrarNoMediamtx({
    id,
    host: params.host,
    portaOnvif: params.portaOnvif,
    usuario: params.usuario,
    senha: params.senha,
    mediamtxPath,
  });

  const criada = await buscarCameraPorId(id);
  if (!criada) throw new Error("Câmera criada mas não encontrada logo em seguida.");
  return criada;
}

export interface AtualizarCameraParams {
  nome?: string;
  host?: string;
  portaOnvif?: number;
  usuario?: string;
  /* null/undefined = mantém a senha já cifrada gravada (mesmo padrão de configuracao-ad.ts). */
  senha?: string | null;
  ativo?: boolean;
  ordem?: number;
  atualizadoPor: string;
}

export async function atualizarCamera(id: string, dados: AtualizarCameraParams): Promise<Camera> {
  const pool = await getSqlServerPool();

  if (dados.nome !== undefined) {
    const existente = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("nome", sql.NVarChar(100), dados.nome)
      .query<{ total: number }>(`
        SELECT COUNT(*) AS [total] FROM dbo.com_semaforo_cameras WHERE [nome] = @nome AND [id] <> @id;
      `);

    if (existente.recordset[0].total > 0) {
      throw new ValidationError(`Já existe uma câmera chamada "${dados.nome}".`);
    }
  }

  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const sets: string[] = [];

  if (dados.nome !== undefined) {
    request.input("nome", sql.NVarChar(100), dados.nome);
    sets.push("[nome] = @nome");
  }
  if (dados.host !== undefined) {
    request.input("host", sql.NVarChar(255), dados.host);
    sets.push("[host] = @host");
  }
  if (dados.portaOnvif !== undefined) {
    request.input("portaOnvif", sql.Int, dados.portaOnvif);
    sets.push("[porta_onvif] = @portaOnvif");
  }
  if (dados.usuario !== undefined) {
    request.input("usuario", sql.NVarChar(150), dados.usuario);
    sets.push("[usuario] = @usuario");
  }
  if (dados.senha) {
    request.input("senhaCifrada", sql.VarBinary(512), criptografarSegredo(dados.senha));
    sets.push("[senha_cifrada] = @senhaCifrada");
  }
  if (dados.ativo !== undefined) {
    request.input("ativo", sql.Bit, dados.ativo);
    sets.push("[ativo] = @ativo");
  }
  if (dados.ordem !== undefined) {
    request.input("ordem", sql.Int, dados.ordem);
    sets.push("[ordem] = @ordem");
  }

  if (sets.length > 0) {
    request.input("atualizadoPor", sql.NVarChar(150), dados.atualizadoPor);
    sets.push("[atualizado_em] = SYSDATETIME()", "[atualizado_por] = @atualizadoPor");

    await request.query(`
      UPDATE dbo.com_semaforo_cameras
      SET ${sets.join(", ")}
      WHERE [id] = @id;
    `);
  }

  const atualizada = await buscarCameraPorId(id);
  if (!atualizada) throw new ValidationError("Câmera não encontrada.");

  /* Só reresolve ONVIF/reregistra no MediaMTX se algo que afeta a conexão de verdade mudou. */
  const conexaoMudou =
    dados.host !== undefined || dados.portaOnvif !== undefined || dados.usuario !== undefined || Boolean(dados.senha);

  if (conexaoMudou) {
    const senhaEfetiva = dados.senha || (await buscarSenhaDecifrada(id));
    if (senhaEfetiva) {
      await verificarEregistrarNoMediamtx({
        id,
        host: atualizada.host,
        portaOnvif: atualizada.portaOnvif,
        usuario: atualizada.usuario,
        senha: senhaEfetiva,
        mediamtxPath: atualizada.mediamtxPath,
      });
      const reatualizada = await buscarCameraPorId(id);
      if (reatualizada) return reatualizada;
    }
  }

  return atualizada;
}

/*
 * Só guarda o resultado do GetStreamUri (ONVIF) -- separado de
 * atualizarCamera porque é chamado depois de uma consulta ao ERP/câmera
 * de verdade (onvif-client.ts), nunca a partir de um PATCH direto do
 * formulário.
 */
export async function registrarResultadoVerificacao(
  id: string,
  resultado:
    | { sucesso: true; streamUriRtsp: string; perfilOnvif: string }
    | { sucesso: false; mensagemErro: string }
): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  if (resultado.sucesso) {
    request.input("streamUriRtsp", sql.NVarChar(500), resultado.streamUriRtsp);
    request.input("perfilOnvif", sql.NVarChar(200), resultado.perfilOnvif);

    await request.query(`
      UPDATE dbo.com_semaforo_cameras
      SET
        [stream_uri_rtsp] = @streamUriRtsp,
        [perfil_onvif] = @perfilOnvif,
        [ultima_verificacao_em] = SYSDATETIME(),
        [ultimo_erro_verificacao] = NULL
      WHERE [id] = @id;
    `);
  } else {
    request.input("mensagemErro", sql.NVarChar(500), resultado.mensagemErro);

    await request.query(`
      UPDATE dbo.com_semaforo_cameras
      SET
        [ultima_verificacao_em] = SYSDATETIME(),
        [ultimo_erro_verificacao] = @mensagemErro
      WHERE [id] = @id;
    `);
  }
}

export async function excluirCamera(id: string): Promise<void> {
  const pool = await getSqlServerPool();

  const camera = await buscarCameraPorId(id);

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`DELETE FROM dbo.com_semaforo_cameras WHERE [id] = @id;`);

  if (camera) {
    await removerCameraDoMediaMtx(camera.mediamtxPath);
  }
}
