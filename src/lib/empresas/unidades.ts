import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { buscarEmpresaPorCodigo } from "./empresas";

/*
 * Unidades de uma empresa (filiais/plantas) e o vínculo do usuário com
 * elas (tabelas da migração 0165). A empresa do usuário continua vindo
 * do "Código de empresa" dele (ver resolverEmpresaDoUsuario) -- só valem
 * as unidades ATIVAS dessa empresa; vínculo com unidade de outra empresa
 * (sobra de quando o código do usuário era outro) é ignorado.
 */

export interface UnidadeEmpresa {
  id: string;
  empresaId: string;
  nome: string;
  ativa: boolean;
  totalUsuarios: number;
}

export interface VinculoUnidade {
  usuarioId: string;
  unidadeId: string;
}

export interface UnidadeResumo {
  id: string;
  nome: string;
}

/*
 * O que a abertura de chamado oferece para um solicitante:
 * - "nenhuma":  empresa sem unidade (ou sem empresa / anônimo) -> campo some;
 * - "fixa":     vinculado a uma só -> já vem preenchida, sem escolha;
 * - "escolher": vinculado a várias (só as dele) ou a nenhuma, numa empresa
 *               que tem unidades (todas da empresa) -> escolha obrigatória.
 */
export interface OpcoesUnidadeChamado {
  modo: "nenhuma" | "fixa" | "escolher";
  unidades: UnidadeResumo[];
}

interface UnidadeRow {
  id: string;
  empresa_id: string;
  nome: string;
  ativa: boolean;
  total_usuarios: number;
}

function mapUnidade(row: UnidadeRow): UnidadeEmpresa {
  return {
    id: row.id,
    empresaId: row.empresa_id,
    nome: row.nome,
    ativa: row.ativa,
    totalUsuarios: row.total_usuarios,
  };
}

const selectUnidades = `
  SELECT
    CONVERT(VARCHAR(36), u.[id]) AS [id],
    CONVERT(VARCHAR(36), u.[empresa_id]) AS [empresa_id],
    u.[nome],
    CAST(u.[ativa] AS BIT) AS [ativa],
    (SELECT COUNT(*) FROM dbo.portal_usuarios_unidades AS v WHERE v.[unidade_id] = u.[id]) AS [total_usuarios]
  FROM dbo.portal_empresas_unidades AS u
`;

function erroNomeDuplicado(error: unknown): boolean {
  return error instanceof Error && /UQ_portal_empresas_unidades_nome/i.test(error.message);
}

export async function listarUnidades(): Promise<UnidadeEmpresa[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<UnidadeRow>(`
    ${selectUnidades}
    ORDER BY u.[nome];
  `);

  return result.recordset.map(mapUnidade);
}

async function buscarUnidadePorId(id: string): Promise<UnidadeEmpresa | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<UnidadeRow>(`
      ${selectUnidades}
      WHERE u.[id] = @id;
    `);

  const row = result.recordset[0];
  return row ? mapUnidade(row) : null;
}

export async function criarUnidade(empresaId: string, nome: string): Promise<UnidadeEmpresa> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("empresaId", sql.UniqueIdentifier, empresaId);
  request.input("nome", sql.NVarChar(100), nome);

  let id: string;

  try {
    const result = await request.query<{ id: string }>(`
      INSERT INTO dbo.portal_empresas_unidades ([empresa_id], [nome])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@empresaId, @nome);
    `);
    id = result.recordset[0].id;
  } catch (error) {
    if (erroNomeDuplicado(error)) {
      throw new ValidationError("Essa empresa já tem uma unidade com esse nome.");
    }
    if (error instanceof Error && /FK_portal_empresas_unidades_empresa/i.test(error.message)) {
      throw new ValidationError("Empresa não encontrada.");
    }
    throw error;
  }

  const criada = await buscarUnidadePorId(id);
  if (!criada) throw new Error("Falha ao criar a unidade.");
  return criada;
}

export async function atualizarUnidade(
  id: string,
  params: { nome?: string; ativa?: boolean }
): Promise<UnidadeEmpresa> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  const sets: string[] = [];

  request.input("id", sql.UniqueIdentifier, id);

  if (params.nome !== undefined) {
    request.input("nome", sql.NVarChar(100), params.nome);
    sets.push("[nome] = @nome");
  }

  if (params.ativa !== undefined) {
    request.input("ativa", sql.Bit, params.ativa);
    sets.push("[ativa] = @ativa");
  }

  if (sets.length === 0) {
    throw new ValidationError("Nenhum campo para atualizar foi informado.");
  }

  try {
    await request.query(`
      UPDATE dbo.portal_empresas_unidades
      SET ${sets.join(", ")}
      WHERE [id] = @id;
    `);
  } catch (error) {
    if (erroNomeDuplicado(error)) {
      throw new ValidationError("Essa empresa já tem uma unidade com esse nome.");
    }
    throw error;
  }

  const atualizada = await buscarUnidadePorId(id);
  if (!atualizada) throw new ValidationError("Unidade não encontrada.");
  return atualizada;
}

export async function listarVinculosUnidades(): Promise<VinculoUnidade[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ usuario_id: string; unidade_id: string }>(`
    SELECT
      CONVERT(VARCHAR(36), [usuario_id]) AS [usuario_id],
      CONVERT(VARCHAR(36), [unidade_id]) AS [unidade_id]
    FROM dbo.portal_usuarios_unidades;
  `);

  return result.recordset.map((row) => ({ usuarioId: row.usuario_id, unidadeId: row.unidade_id }));
}

/* Unidades ativas da empresa com esse código -- [] se a empresa não existe/está inativa ou não tem unidade. */
export async function listarUnidadesAtivasDaEmpresa(
  codigoEmpresa: string | null
): Promise<UnidadeResumo[]> {
  if (!codigoEmpresa) return [];

  const empresa = await buscarEmpresaPorCodigo(codigoEmpresa);
  if (!empresa) return [];

  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("empresaId", sql.UniqueIdentifier, empresa.id)
    .query<UnidadeResumo>(`
      SELECT CONVERT(VARCHAR(36), [id]) AS [id], [nome]
      FROM dbo.portal_empresas_unidades
      WHERE [empresa_id] = @empresaId AND [ativa] = 1
      ORDER BY [nome];
    `);

  return result.recordset;
}

/*
 * Substitui o conjunto de unidades do usuário. Só aceita unidades ativas
 * da empresa atual dele -- o que sobrou de outra empresa sai junto.
 */
export async function definirUnidadesDoUsuario(
  usuarioId: string,
  unidadeIds: string[]
): Promise<string[]> {
  const pool = await getSqlServerPool();

  const usuarioResult = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ codigo_empresa: string | null }>(`
      SELECT [codigo_empresa] FROM dbo.portal_usuarios WHERE [id] = @usuarioId;
    `);

  const usuario = usuarioResult.recordset[0];
  if (!usuario) throw new ValidationError("Usuário não encontrado.");

  const unicas = Array.from(new Set(unidadeIds.map((id) => id.toLowerCase())));

  if (unicas.length > 0) {
    const permitidas = await listarUnidadesAtivasDaEmpresa(usuario.codigo_empresa);
    const idsPermitidos = new Set(permitidas.map((unidade) => unidade.id.toLowerCase()));

    if (unicas.some((id) => !idsPermitidos.has(id))) {
      throw new ValidationError(
        "Só dá para vincular unidades ativas da empresa do usuário (confira o código de empresa dele)."
      );
    }
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction)
      .input("usuarioId", sql.UniqueIdentifier, usuarioId)
      .query(`DELETE FROM dbo.portal_usuarios_unidades WHERE [usuario_id] = @usuarioId;`);

    for (const unidadeId of unicas) {
      await new sql.Request(transaction)
        .input("usuarioId", sql.UniqueIdentifier, usuarioId)
        .input("unidadeId", sql.UniqueIdentifier, unidadeId)
        .query(`
          INSERT INTO dbo.portal_usuarios_unidades ([usuario_id], [unidade_id])
          VALUES (@usuarioId, @unidadeId);
        `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return unicas;
}

export async function opcoesUnidadeParaChamado(
  solicitante: { id: string; codigoEmpresa: string | null } | null
): Promise<OpcoesUnidadeChamado> {
  const nenhuma: OpcoesUnidadeChamado = { modo: "nenhuma", unidades: [] };
  if (!solicitante?.codigoEmpresa) return nenhuma;

  const empresa = await buscarEmpresaPorCodigo(solicitante.codigoEmpresa);
  if (!empresa) return nenhuma;

  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("empresaId", sql.UniqueIdentifier, empresa.id)
    .input("usuarioId", sql.UniqueIdentifier, solicitante.id)
    .query<{ id: string; nome: string; vinculada: boolean }>(`
      SELECT
        CONVERT(VARCHAR(36), u.[id]) AS [id],
        u.[nome],
        CAST(CASE WHEN v.[usuario_id] IS NULL THEN 0 ELSE 1 END AS BIT) AS [vinculada]
      FROM dbo.portal_empresas_unidades AS u
      LEFT JOIN dbo.portal_usuarios_unidades AS v
        ON v.[unidade_id] = u.[id] AND v.[usuario_id] = @usuarioId
      WHERE u.[empresa_id] = @empresaId AND u.[ativa] = 1
      ORDER BY u.[nome];
    `);

  const todas: { id: string; nome: string; vinculada: boolean }[] = [...result.recordset];
  if (todas.length === 0) return nenhuma;

  const vinculadas = todas.filter((unidade) => unidade.vinculada);
  const resumo = (lista: typeof todas) => lista.map(({ id, nome }) => ({ id, nome }));

  if (vinculadas.length === 1) return { modo: "fixa", unidades: resumo(vinculadas) };
  if (vinculadas.length > 1) return { modo: "escolher", unidades: resumo(vinculadas) };

  return { modo: "escolher", unidades: resumo(todas) };
}

/*
 * Unidade que vai para o chamado, conferida no servidor (a tela só
 * sugere): null quando não se aplica; a única vinculada no modo "fixa";
 * a escolhida, desde que esteja entre as opções, no modo "escolher".
 */
export async function resolverUnidadeParaChamado(
  solicitante: { id: string; codigoEmpresa: string | null } | null,
  unidadeIdEscolhida: string | null
): Promise<UnidadeResumo | null> {
  const opcoes = await opcoesUnidadeParaChamado(solicitante);

  if (opcoes.modo === "nenhuma") return null;
  if (opcoes.modo === "fixa") return opcoes.unidades[0];

  if (!unidadeIdEscolhida) {
    throw new ValidationError("Selecione a unidade deste chamado.");
  }

  const escolhida = opcoes.unidades.find(
    (unidade) => unidade.id.toLowerCase() === unidadeIdEscolhida.toLowerCase()
  );

  if (!escolhida) {
    throw new ValidationError("A unidade escolhida não está disponível para este solicitante.");
  }

  return escolhida;
}
