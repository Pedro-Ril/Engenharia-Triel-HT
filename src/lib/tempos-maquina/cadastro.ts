import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import type { MaquinaTempo, MaterialTempo, PerfilTempoCadastro } from "@/modules/tempos-maquina/types/temposMaquina.types";

import type { PerfilTempo } from "./tipos";
import { validarParametrosPerfil } from "./validacao";

/*
 * Cadastro do cálculo automático de tempo (tabelas eng_tempos_*, migração
 * 0159): perfis de cálculo, a ligação máquina do ERP -> perfil e os
 * materiais. Os parâmetros do perfil são validados antes de gravar.
 */

type PerfilRow = {
  id: string;
  nome: string;
  metodo: PerfilTempo["metodo"];
  parametros: string;
  ativo: boolean;
  observacao: string | null;
  atualizado_em: Date;
  atualizado_por: string | null;
};

type MaquinaRow = {
  cod_recurso: string;
  desc_recurso: string | null;
  perfil_id: string;
  perfil_nome: string;
  perfil_ativo: boolean;
  atualizado_em: Date;
  atualizado_por: string | null;
};

type MaterialRow = {
  id: string;
  nome: string;
  termos: string;
  densidade: number;
  variante: string | null;
  ordem: number;
  ativo: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirUuid(id: string, oQue: string) {
  if (!UUID.test(id)) throw new ValidationError(`${oQue} inválido.`);
}

function ehNomeRepetido(erro: unknown): boolean {
  const numero = (erro as { number?: number })?.number;
  return numero === 2601 || numero === 2627;
}

/* ---------------- Perfis ---------------- */

export async function listarPerfis(): Promise<PerfilTempoCadastro[]> {
  const pool = await getSqlServerPool();
  const [perfis, maquinas] = await Promise.all([
    pool.request().query<PerfilRow>(`
      SELECT CONVERT(VARCHAR(36), [id]) AS [id], [nome], [metodo], [parametros], [ativo], [observacao], [atualizado_em], [atualizado_por]
      FROM dbo.eng_tempos_perfis
      ORDER BY [nome];
    `),
    pool.request().query<{ perfil_id: string; cod_recurso: string; desc_recurso: string | null }>(`
      SELECT CONVERT(VARCHAR(36), [perfil_id]) AS [perfil_id], [cod_recurso], [desc_recurso]
      FROM dbo.eng_tempos_maquinas
      ORDER BY [cod_recurso];
    `),
  ]);

  const porPerfil = new Map<string, { codRecurso: string; descRecurso: string | null }[]>();
  for (const m of maquinas.recordset) {
    const chave = m.perfil_id.toLowerCase();
    porPerfil.set(chave, [...(porPerfil.get(chave) ?? []), { codRecurso: m.cod_recurso, descRecurso: m.desc_recurso }]);
  }

  return perfis.recordset.map((row) => ({
    id: row.id.toLowerCase(),
    nome: row.nome,
    metodo: row.metodo,
    ativo: Boolean(row.ativo),
    observacao: row.observacao,
    parametros: JSON.parse(row.parametros) as PerfilTempo,
    maquinas: porPerfil.get(row.id.toLowerCase()) ?? [],
    atualizadoEm: row.atualizado_em.toISOString(),
    atualizadoPor: row.atualizado_por,
  }));
}

async function obterPerfil(id: string): Promise<PerfilTempoCadastro> {
  const perfil = (await listarPerfis()).find((p) => p.id === id.toLowerCase());
  if (!perfil) throw new ValidationError("Perfil não encontrado.");
  return perfil;
}

export async function criarPerfil(
  dados: { nome: string; metodo: unknown; parametros: unknown; observacao: string | null },
  usuario: string
): Promise<PerfilTempoCadastro> {
  const parametros = validarParametrosPerfil(dados.metodo, dados.parametros);
  const pool = await getSqlServerPool();

  try {
    const result = await pool
      .request()
      .input("nome", sql.NVarChar(150), dados.nome)
      .input("metodo", sql.VarChar(20), parametros.metodo)
      .input("parametros", sql.NVarChar(sql.MAX), JSON.stringify(parametros))
      .input("observacao", sql.NVarChar(1000), dados.observacao)
      .input("usuario", sql.NVarChar(150), usuario)
      .query<{ id: string }>(`
        INSERT INTO dbo.eng_tempos_perfis ([nome], [metodo], [parametros], [ativo], [observacao], [atualizado_por])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        VALUES (@nome, @metodo, @parametros, 0, @observacao, @usuario);
      `);
    return obterPerfil(result.recordset[0].id);
  } catch (erro) {
    if (ehNomeRepetido(erro)) throw new ValidationError(`Já existe um perfil chamado "${dados.nome}".`);
    throw erro;
  }
}

export async function atualizarPerfil(
  id: string,
  dados: { nome?: string; parametros?: unknown; observacao?: string | null; ativo?: boolean },
  usuario: string
): Promise<PerfilTempoCadastro> {
  exigirUuid(id, "Perfil");
  const atual = await obterPerfil(id);
  /* O método não muda: os parâmetros são validados contra o método do perfil. */
  const parametros = dados.parametros === undefined ? undefined : validarParametrosPerfil(atual.metodo, dados.parametros);
  const pool = await getSqlServerPool();

  try {
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("nome", sql.NVarChar(150), dados.nome ?? null)
      .input("parametros", sql.NVarChar(sql.MAX), parametros ? JSON.stringify(parametros) : null)
      .input("mudaObservacao", sql.Bit, dados.observacao !== undefined)
      .input("observacao", sql.NVarChar(1000), dados.observacao ?? null)
      .input("ativo", sql.Bit, dados.ativo ?? null)
      .input("usuario", sql.NVarChar(150), usuario)
      .query(`
        UPDATE dbo.eng_tempos_perfis
        SET [nome] = COALESCE(@nome, [nome]),
            [parametros] = COALESCE(@parametros, [parametros]),
            [observacao] = CASE WHEN @mudaObservacao = 1 THEN @observacao ELSE [observacao] END,
            [ativo] = COALESCE(@ativo, [ativo]),
            [atualizado_em] = SYSDATETIME(),
            [atualizado_por] = @usuario
        WHERE [id] = @id;
      `);
  } catch (erro) {
    if (ehNomeRepetido(erro)) throw new ValidationError(`Já existe um perfil chamado "${dados.nome}".`);
    throw erro;
  }

  return obterPerfil(id);
}

export async function excluirPerfil(id: string): Promise<void> {
  exigirUuid(id, "Perfil");
  const perfil = await obterPerfil(id);
  if (perfil.maquinas.length > 0) {
    throw new ValidationError(
      `O perfil está ligado a ${perfil.maquinas.map((m) => m.codRecurso).join(", ")}. Desligue as máquinas antes de excluir.`
    );
  }

  const pool = await getSqlServerPool();
  await pool.request().input("id", sql.UniqueIdentifier, id).query(`DELETE FROM dbo.eng_tempos_perfis WHERE [id] = @id;`);
}

/* ---------------- Máquinas ---------------- */

export async function listarMaquinas(): Promise<MaquinaTempo[]> {
  const pool = await getSqlServerPool();
  const result = await pool.request().query<MaquinaRow>(`
    SELECT m.[cod_recurso], m.[desc_recurso], CONVERT(VARCHAR(36), m.[perfil_id]) AS [perfil_id],
           p.[nome] AS [perfil_nome], p.[ativo] AS [perfil_ativo], m.[atualizado_em], m.[atualizado_por]
    FROM dbo.eng_tempos_maquinas AS m
    INNER JOIN dbo.eng_tempos_perfis AS p ON p.[id] = m.[perfil_id]
    ORDER BY m.[cod_recurso];
  `);

  return result.recordset.map((row) => ({
    codRecurso: row.cod_recurso,
    descRecurso: row.desc_recurso,
    perfilId: row.perfil_id.toLowerCase(),
    perfilNome: row.perfil_nome,
    perfilAtivo: Boolean(row.perfil_ativo),
    atualizadoEm: row.atualizado_em.toISOString(),
    atualizadoPor: row.atualizado_por,
  }));
}

/* Liga a máquina ao perfil (perfilId = null desliga). */
export async function definirPerfilDaMaquina(
  codRecurso: string,
  descRecurso: string | null,
  perfilId: string | null,
  usuario: string
): Promise<void> {
  const pool = await getSqlServerPool();

  if (!perfilId) {
    await pool
      .request()
      .input("cod", sql.VarChar(30), codRecurso)
      .query(`DELETE FROM dbo.eng_tempos_maquinas WHERE [cod_recurso] = @cod;`);
    return;
  }

  exigirUuid(perfilId, "Perfil");
  await obterPerfil(perfilId);

  await pool
    .request()
    .input("cod", sql.VarChar(30), codRecurso)
    .input("desc", sql.NVarChar(150), descRecurso)
    .input("perfil", sql.UniqueIdentifier, perfilId)
    .input("usuario", sql.NVarChar(150), usuario)
    .query(`
      MERGE dbo.eng_tempos_maquinas WITH (HOLDLOCK) AS alvo
      USING (SELECT @cod AS [cod_recurso]) AS origem ON alvo.[cod_recurso] = origem.[cod_recurso]
      WHEN MATCHED THEN
        UPDATE SET [perfil_id] = @perfil, [desc_recurso] = @desc, [atualizado_em] = SYSDATETIME(), [atualizado_por] = @usuario
      WHEN NOT MATCHED THEN
        INSERT ([cod_recurso], [desc_recurso], [perfil_id], [atualizado_por]) VALUES (@cod, @desc, @perfil, @usuario);
    `);
}

/* ---------------- Materiais ---------------- */

function materialDeRow(row: MaterialRow): MaterialTempo {
  return {
    id: row.id.toLowerCase(),
    nome: row.nome,
    termos: row.termos,
    densidade: Number(row.densidade),
    variante: row.variante,
    ordem: row.ordem,
    ativo: Boolean(row.ativo),
  };
}

export async function listarMateriais(): Promise<MaterialTempo[]> {
  const pool = await getSqlServerPool();
  const result = await pool.request().query<MaterialRow>(`
    SELECT CONVERT(VARCHAR(36), [id]) AS [id], [nome], [termos], [densidade], [variante], [ordem], [ativo]
    FROM dbo.eng_tempos_materiais
    ORDER BY [ordem], [nome];
  `);
  return result.recordset.map(materialDeRow);
}

export type DadosMaterial = Omit<MaterialTempo, "id">;

export async function salvarMaterial(id: string | null, dados: DadosMaterial): Promise<MaterialTempo> {
  if (id) exigirUuid(id, "Material");
  const pool = await getSqlServerPool();
  const request = pool
    .request()
    .input("nome", sql.NVarChar(100), dados.nome)
    .input("termos", sql.NVarChar(400), dados.termos)
    .input("densidade", sql.Decimal(9, 4), dados.densidade)
    .input("variante", sql.VarChar(30), dados.variante)
    .input("ordem", sql.Int, dados.ordem)
    .input("ativo", sql.Bit, dados.ativo);

  const result = id
    ? await request.input("id", sql.UniqueIdentifier, id).query<MaterialRow>(`
        UPDATE dbo.eng_tempos_materiais
        SET [nome] = @nome, [termos] = @termos, [densidade] = @densidade, [variante] = @variante,
            [ordem] = @ordem, [ativo] = @ativo, [atualizado_em] = SYSDATETIME()
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id], INSERTED.[nome], INSERTED.[termos], INSERTED.[densidade],
               INSERTED.[variante], INSERTED.[ordem], INSERTED.[ativo]
        WHERE [id] = @id;
      `)
    : await request.query<MaterialRow>(`
        INSERT INTO dbo.eng_tempos_materiais ([nome], [termos], [densidade], [variante], [ordem], [ativo])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id], INSERTED.[nome], INSERTED.[termos], INSERTED.[densidade],
               INSERTED.[variante], INSERTED.[ordem], INSERTED.[ativo]
        VALUES (@nome, @termos, @densidade, @variante, @ordem, @ativo);
      `);

  if (!result.recordset[0]) throw new ValidationError("Material não encontrado.");
  return materialDeRow(result.recordset[0]);
}

export async function excluirMaterial(id: string): Promise<void> {
  exigirUuid(id, "Material");
  const pool = await getSqlServerPool();
  await pool.request().input("id", sql.UniqueIdentifier, id).query(`DELETE FROM dbo.eng_tempos_materiais WHERE [id] = @id;`);
}
