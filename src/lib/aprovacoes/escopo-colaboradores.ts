import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

/*
 * Restrição por usuário sobre quais colaboradores ele pode ver/buscar
 * na tela de "Reajuste Salarial" -- não afeta o painel de decisão da
 * direção (confirmado que não precisa nesta v1).
 *
 * Modelo "nega por padrão": um usuário SEM nenhuma regra
 * 'unidade_permitida' não vê NENHUM colaborador -- é preciso liberar
 * pelo menos uma unidade explicitamente pra essa tela funcionar pra
 * ele. As exclusões (setor/colaborador) continuam se aplicando por
 * cima, independente disso.
 */
export type TipoRegraEscopo = "unidade_permitida" | "setor_excluido" | "colaborador_excluido";

export interface RegraEscopo {
  id: string;
  tipo: TipoRegraEscopo;
  valor: string;
  valorRotulo: string | null;
}

export interface EscopoUsuario {
  unidadesPermitidas: string[];
  setoresExcluidos: string[];
  colaboradoresExcluidosCodigos: string[];
}

interface FuncionarioEscopavel {
  codigo: string;
  departamento: string | null;
  setor: string | null;
}

export async function buscarEscopoUsuario(usuarioId: string): Promise<EscopoUsuario> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ tipo: TipoRegraEscopo; valor: string }>(`
      SELECT [tipo], [valor] FROM dbo.portal_aprovacoes_escopo WHERE [usuario_id] = @usuarioId;
    `);

  const escopo: EscopoUsuario = {
    unidadesPermitidas: [],
    setoresExcluidos: [],
    colaboradoresExcluidosCodigos: [],
  };

  for (const row of result.recordset) {
    if (row.tipo === "unidade_permitida") escopo.unidadesPermitidas.push(row.valor);
    else if (row.tipo === "setor_excluido") escopo.setoresExcluidos.push(row.valor);
    else if (row.tipo === "colaborador_excluido") escopo.colaboradoresExcluidosCodigos.push(row.valor);
  }

  return escopo;
}

export function funcionarioDentroDoEscopo(funcionario: FuncionarioEscopavel, escopo: EscopoUsuario): boolean {
  /* Nega por padrão: sem nenhuma unidade liberada, não vê ninguém -- não é "sem restrição". */
  if (escopo.unidadesPermitidas.length === 0) {
    return false;
  }

  if (!funcionario.departamento || !escopo.unidadesPermitidas.includes(funcionario.departamento)) {
    return false;
  }

  if (funcionario.setor && escopo.setoresExcluidos.includes(funcionario.setor)) {
    return false;
  }

  if (escopo.colaboradoresExcluidosCodigos.includes(funcionario.codigo)) {
    return false;
  }

  return true;
}

export function aplicarEscopo<T extends FuncionarioEscopavel>(funcionarios: T[], escopo: EscopoUsuario): T[] {
  return funcionarios.filter((funcionario) => funcionarioDentroDoEscopo(funcionario, escopo));
}

/* Usada na criação da solicitação -- rejeita se algum item enviado estiver fora do escopo do usuário (defesa em profundidade, além do filtro já aplicado na busca). */
export function validarEscopoOuFalhar(funcionario: FuncionarioEscopavel & { nome: string }, escopo: EscopoUsuario): void {
  if (!funcionarioDentroDoEscopo(funcionario, escopo)) {
    throw new ValidationError(`Você não tem permissão para solicitar reajuste para ${funcionario.nome}.`);
  }
}

/* ===== Administração (gerenciar as regras de um usuário) ===== */

/* Contagem de TODOS os usuários de uma vez -- usada pra mostrar o badge na lista de seleção sem depender de qual usuário está selecionado no momento. */
export async function contarRegrasPorUsuario(): Promise<Record<string, number>> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ usuario_id: string; total: number }>(`
    SELECT CONVERT(VARCHAR(36), [usuario_id]) AS [usuario_id], COUNT(*) AS [total]
    FROM dbo.portal_aprovacoes_escopo
    GROUP BY [usuario_id];
  `);

  const contagem: Record<string, number> = {};
  for (const row of result.recordset) {
    contagem[row.usuario_id] = row.total;
  }

  return contagem;
}

export async function listarRegrasEscopo(usuarioId: string): Promise<RegraEscopo[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ id: string; tipo: TipoRegraEscopo; valor: string; valor_rotulo: string | null }>(`
      SELECT CONVERT(VARCHAR(36), [id]) AS [id], [tipo], [valor], [valor_rotulo]
      FROM dbo.portal_aprovacoes_escopo
      WHERE [usuario_id] = @usuarioId
      ORDER BY [tipo], [valor];
    `);

  return result.recordset.map((row) => ({
    id: row.id,
    tipo: row.tipo,
    valor: row.valor,
    valorRotulo: row.valor_rotulo,
  }));
}

export async function adicionarRegraEscopo(
  usuarioId: string,
  tipo: TipoRegraEscopo,
  valor: string,
  valorRotulo: string | null
): Promise<RegraEscopo> {
  if (!valor.trim()) {
    throw new ValidationError("Informe um valor para a regra.");
  }

  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("tipo", sql.VarChar(30), tipo)
    .input("valor", sql.NVarChar(200), valor)
    .input("valorRotulo", sql.NVarChar(200), valorRotulo)
    .query<{ id: string }>(`
      IF NOT EXISTS (
        SELECT 1 FROM dbo.portal_aprovacoes_escopo
        WHERE [usuario_id] = @usuarioId AND [tipo] = @tipo AND [valor] = @valor
      )
      BEGIN
        INSERT INTO dbo.portal_aprovacoes_escopo ([usuario_id], [tipo], [valor], [valor_rotulo])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        VALUES (@usuarioId, @tipo, @valor, @valorRotulo);
      END
      ELSE
      BEGIN
        SELECT CONVERT(VARCHAR(36), [id]) AS [id] FROM dbo.portal_aprovacoes_escopo
        WHERE [usuario_id] = @usuarioId AND [tipo] = @tipo AND [valor] = @valor;
      END
    `);

  return { id: result.recordset[0].id, tipo, valor, valorRotulo };
}

export async function removerRegraEscopo(id: string): Promise<void> {
  const pool = await getSqlServerPool();
  await pool.request().input("id", sql.UniqueIdentifier, id).query(`
    DELETE FROM dbo.portal_aprovacoes_escopo WHERE [id] = @id;
  `);
}
