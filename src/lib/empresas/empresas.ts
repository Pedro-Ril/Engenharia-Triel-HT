import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";
import { corHexValida } from "@/lib/tema/paleta-empresa";

export interface Empresa {
  id: string;
  nome: string;
  codigo: string | null;
  corPrimariaClara: string;
  corPrimariaEscura: string;
  ativa: boolean;
}

const colunasEmpresa = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [nome],
  [codigo],
  [cor_primaria_clara],
  [cor_primaria_escura],
  CAST([ativa] AS BIT) AS [ativa]
`;

interface EmpresaRow {
  id: string;
  nome: string;
  codigo: string | null;
  cor_primaria_clara: string;
  cor_primaria_escura: string;
  ativa: boolean;
}

function mapEmpresaRow(row: EmpresaRow): Empresa {
  return {
    id: row.id,
    nome: row.nome,
    codigo: row.codigo,
    corPrimariaClara: row.cor_primaria_clara,
    corPrimariaEscura: row.cor_primaria_escura,
    ativa: row.ativa,
  };
}

function validarCores(corClara: string, corEscura: string) {
  if (!corHexValida(corClara) || !corHexValida(corEscura)) {
    throw new ValidationError("As cores precisam estar no formato #rrggbb.");
  }
}

export async function listarEmpresas(): Promise<Empresa[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<EmpresaRow>(`
    SELECT ${colunasEmpresa}
    FROM dbo.portal_empresas
    ORDER BY [nome];
  `);

  return result.recordset.map(mapEmpresaRow);
}

export async function buscarEmpresaPorId(id: string): Promise<Empresa | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<EmpresaRow>(`
      SELECT ${colunasEmpresa}
      FROM dbo.portal_empresas
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  return row ? mapEmpresaRow(row) : null;
}

/*
 * Casamento por código (trim + case-insensitive) — só entre
 * empresas ativas, já que aqui não é uma atribuição persistida
 * (como `empresa_id`), e sim recalculada a cada requisição; ver
 * resolverEmpresaDoUsuario.
 */
export async function buscarEmpresaPorCodigo(codigo: string): Promise<Empresa | null> {
  const codigoLimpo = codigo.trim();
  if (!codigoLimpo) return null;

  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("codigo", sql.NVarChar(30), codigoLimpo)
    .query<EmpresaRow>(`
      SELECT ${colunasEmpresa}
      FROM dbo.portal_empresas
      WHERE [ativa] = 1
        AND LOWER(LTRIM(RTRIM([codigo]))) = LOWER(LTRIM(RTRIM(@codigo)));
    `);

  const row = result.recordset[0];
  return row ? mapEmpresaRow(row) : null;
}

/*
 * Resolve qual empresa (se alguma) define o tema do usuário: só o
 * casamento por código (`codigo_empresa` do usuário vs. `codigo`
 * da empresa) — um único lugar pra configurar isso (o campo
 * "Código de empresa" que o usuário já tem), sem um controle
 * manual separado que poderia divergir dele. `buscarEmpresaPorCodigo`
 * já filtra por `ativa = 1`, então desativar uma empresa reverte o
 * tema pro padrão pra todo mundo com aquele código automaticamente.
 */
export async function resolverEmpresaDoUsuario(usuario: {
  codigoEmpresa: string | null;
}): Promise<Empresa | null> {
  if (!usuario.codigoEmpresa) return null;
  return buscarEmpresaPorCodigo(usuario.codigoEmpresa);
}

export async function criarEmpresa(params: {
  nome: string;
  codigo?: string | null;
  corPrimariaClara: string;
  corPrimariaEscura: string;
}): Promise<Empresa> {
  validarCores(params.corPrimariaClara, params.corPrimariaEscura);

  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("nome", sql.NVarChar(150), params.nome);
  request.input("codigo", sql.NVarChar(30), params.codigo ?? null);
  request.input("corClara", sql.VarChar(7), params.corPrimariaClara);
  request.input("corEscura", sql.VarChar(7), params.corPrimariaEscura);

  const result = await request.query<{ id: string }>(`
    INSERT INTO dbo.portal_empresas ([nome], [codigo], [cor_primaria_clara], [cor_primaria_escura])
    OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
    VALUES (@nome, @codigo, @corClara, @corEscura);
  `);

  const criada = await buscarEmpresaPorId(result.recordset[0].id);
  if (!criada) throw new Error("Falha ao criar empresa.");
  return criada;
}

export async function atualizarEmpresa(
  id: string,
  params: {
    nome?: string;
    codigo?: string | null;
    corPrimariaClara?: string;
    corPrimariaEscura?: string;
    ativa?: boolean;
  }
): Promise<Empresa> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const sets: string[] = [];

  if (params.nome !== undefined) {
    request.input("nome", sql.NVarChar(150), params.nome);
    sets.push("[nome] = @nome");
  }

  if (params.codigo !== undefined) {
    request.input("codigo", sql.NVarChar(30), params.codigo);
    sets.push("[codigo] = @codigo");
  }

  if (params.corPrimariaClara !== undefined || params.corPrimariaEscura !== undefined) {
    const atual = await buscarEmpresaPorId(id);
    if (!atual) throw new ValidationError("Empresa não encontrada.");

    const corClara = params.corPrimariaClara ?? atual.corPrimariaClara;
    const corEscura = params.corPrimariaEscura ?? atual.corPrimariaEscura;
    validarCores(corClara, corEscura);

    request.input("corClara", sql.VarChar(7), corClara);
    request.input("corEscura", sql.VarChar(7), corEscura);
    sets.push("[cor_primaria_clara] = @corClara", "[cor_primaria_escura] = @corEscura");
  }

  if (params.ativa !== undefined) {
    request.input("ativa", sql.Bit, params.ativa);
    sets.push("[ativa] = @ativa");
  }

  if (sets.length === 0) {
    throw new ValidationError("Nenhum campo para atualizar foi informado.");
  }

  await request.query(`
    UPDATE dbo.portal_empresas
    SET ${sets.join(", ")}
    WHERE [id] = @id;
  `);

  const atualizada = await buscarEmpresaPorId(id);
  if (!atualizada) throw new ValidationError("Empresa não encontrada.");
  return atualizada;
}
