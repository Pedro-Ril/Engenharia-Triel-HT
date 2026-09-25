import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";
import type { PortalUsuario } from "@/lib/auth/usuarios";

import type { TipoAprovacao } from "./tipos-aprovacao";

export type StatusItemAprovacao = "pendente" | "aprovado" | "reprovado";

export type { TipoAprovacao };

/*
 * Uma solicitação (lote) contém vários colaboradores -- cada um
 * decidido INDIVIDUALMENTE pela direção (aprovar um não implica
 * aprovar os outros do mesmo lote). Por isso o status/decisão vivem no
 * ITEM (portal_aprovacoes_aumento_salarial), não no lote
 * (portal_aprovacoes) -- o lote só guarda quem criou, quando, e a
 * observação compartilhada por todos os itens.
 */
export interface ItemAumentoSalarial {
  id: string;
  aprovacaoId: string;
  aprovacaoNumero: number;
  /* Observação do LOTE inteiro, compartilhada por todos os colaboradores. */
  observacaoGeral: string | null;
  criadoPorUsuarioId: string;
  criadoPorNome: string;
  criadoEm: string;
  funcionarioCodigo: string;
  funcionarioNome: string;
  funcionarioCpf: string | null;
  departamento: string | null;
  setor: string | null;
  salarioAtual: number;
  valorReajuste: number;
  percentualReajuste: number;
  novoSalario: number;
  /*
   * Preenchidos só quando a direção ajustou os valores antes de
   * decidir: é o que o solicitante tinha pedido. NULL nos três = a
   * direção não mexeu.
   */
  valorReajusteOriginal: number | null;
  percentualReajusteOriginal: number | null;
  novoSalarioOriginal: number | null;
  /* Observação SÓ deste colaborador (ex: "esse aqui é promoção"). */
  observacao: string | null;
  status: StatusItemAprovacao;
  decididoPorNome: string | null;
  decididoEm: string | null;
  comentarioDecisao: string | null;
  /* Texto curto pronto pra lista (ex: "João Silva — +R$ 500,00 (8%)"). */
  resumoTitulo: string;
}

export interface AprovacaoLote {
  id: string;
  numero: number;
  tipo: TipoAprovacao;
  observacao: string | null;
  criadoPorUsuarioId: string;
  criadoPorNome: string;
  criadoEm: string;
  itens: ItemAumentoSalarial[];
}

interface ItemRow {
  item_id: string;
  aprovacao_id: string;
  aprovacao_numero: number;
  observacao_geral: string | null;
  criado_por_usuario_id: string;
  criado_por_nome: string;
  criado_em: string;
  funcionario_codigo: string;
  funcionario_nome: string;
  funcionario_cpf: string | null;
  departamento: string | null;
  setor: string | null;
  salario_atual: number;
  valor_reajuste: number;
  percentual_reajuste: number;
  novo_salario: number;
  valor_reajuste_original: number | null;
  percentual_reajuste_original: number | null;
  novo_salario_original: number | null;
  status: StatusItemAprovacao;
  decidido_por_nome: string | null;
  decidido_em: string | null;
  comentario_decisao: string | null;
  observacao: string | null;
}

const colunasItem = `
  CONVERT(VARCHAR(36), i.[id]) AS [item_id],
  CONVERT(VARCHAR(36), a.[id]) AS [aprovacao_id],
  a.[numero] AS [aprovacao_numero],
  a.[observacao] AS [observacao_geral],
  CONVERT(VARCHAR(36), a.[criado_por_usuario_id]) AS [criado_por_usuario_id],
  a.[criado_por_nome],
  CONVERT(VARCHAR(33), a.[criado_em], 126) AS [criado_em],
  i.[funcionario_codigo],
  i.[funcionario_nome],
  i.[funcionario_cpf],
  i.[departamento],
  i.[setor],
  i.[salario_atual],
  i.[valor_reajuste],
  i.[percentual_reajuste],
  i.[novo_salario],
  i.[valor_reajuste_original],
  i.[percentual_reajuste_original],
  i.[novo_salario_original],
  i.[status],
  i.[decidido_por_nome],
  CONVERT(VARCHAR(33), i.[decidido_em], 126) AS [decidido_em],
  i.[comentario_decisao],
  i.[observacao]
`;

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mapItemRow(row: ItemRow): ItemAumentoSalarial {
  return {
    id: row.item_id,
    aprovacaoId: row.aprovacao_id,
    aprovacaoNumero: row.aprovacao_numero,
    observacaoGeral: row.observacao_geral,
    criadoPorUsuarioId: row.criado_por_usuario_id,
    criadoPorNome: row.criado_por_nome,
    criadoEm: row.criado_em,
    funcionarioCodigo: row.funcionario_codigo,
    funcionarioNome: row.funcionario_nome,
    funcionarioCpf: row.funcionario_cpf,
    departamento: row.departamento,
    setor: row.setor,
    salarioAtual: row.salario_atual,
    valorReajuste: row.valor_reajuste,
    percentualReajuste: row.percentual_reajuste,
    novoSalario: row.novo_salario,
    valorReajusteOriginal: row.valor_reajuste_original,
    percentualReajusteOriginal: row.percentual_reajuste_original,
    novoSalarioOriginal: row.novo_salario_original,
    observacao: row.observacao,
    status: row.status,
    decididoPorNome: row.decidido_por_nome,
    decididoEm: row.decidido_em,
    comentarioDecisao: row.comentario_decisao,
    resumoTitulo: `${row.funcionario_nome} — +${formatarMoeda(row.valor_reajuste)} (${Number(row.percentual_reajuste).toFixed(2)}%)`,
  };
}

export interface ItemCriarSolicitacaoParams {
  funcionarioCodigo: string;
  funcionarioNome: string;
  funcionarioCpf: string | null;
  departamento: string | null;
  setor: string | null;
  salarioAtual: number;
  valorReajuste: number;
  percentualReajuste: number;
  observacao: string | null;
}

export interface CriarSolicitacaoAumentoParams {
  observacao: string | null;
  itens: ItemCriarSolicitacaoParams[];
}

/*
 * "Novo salário" é sempre calculado aqui, nunca confiando em valor
 * vindo do cliente -- o cliente só manda salarioAtual (snapshot já
 * buscado do RH) e valorReajuste/percentualReajuste, por colaborador.
 */
export async function criarSolicitacaoAumentoSalarial(
  params: CriarSolicitacaoAumentoParams,
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao">
): Promise<AprovacaoLote> {
  if (!params.itens || params.itens.length === 0) {
    throw new ValidationError("Adicione ao menos um colaborador à solicitação.");
  }

  const codigosVistos = new Set<string>();
  for (const item of params.itens) {
    if (!item.funcionarioCodigo) {
      throw new ValidationError("Selecione um colaborador válido.");
    }
    if (codigosVistos.has(item.funcionarioCodigo)) {
      throw new ValidationError(`${item.funcionarioNome} foi adicionado mais de uma vez.`);
    }
    codigosVistos.add(item.funcionarioCodigo);

    if (!Number.isFinite(item.salarioAtual) || item.salarioAtual <= 0) {
      throw new ValidationError(`Salário atual inválido para ${item.funcionarioNome}.`);
    }
    if (!Number.isFinite(item.valorReajuste) || item.valorReajuste <= 0) {
      throw new ValidationError(`O valor do reajuste de ${item.funcionarioNome} deve ser maior que zero.`);
    }
    if (!Number.isFinite(item.percentualReajuste) || item.percentualReajuste <= 0) {
      throw new ValidationError(`O percentual do reajuste de ${item.funcionarioNome} deve ser maior que zero.`);
    }
  }

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  let numero: number;

  try {
    const resultado = await new sql.Request(transaction)
      .input("tipo", sql.VarChar(40), "aumento_salarial")
      .input("observacao", sql.NVarChar(2000), params.observacao)
      .input("criadoPorUsuarioId", sql.UniqueIdentifier, usuario.id)
      .input("criadoPorNome", sql.NVarChar(200), usuario.nomeExibicao)
      .query<{ id: string; numero: number }>(`
        INSERT INTO dbo.portal_aprovacoes ([tipo], [observacao], [criado_por_usuario_id], [criado_por_nome])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id], INSERTED.[numero] AS [numero]
        VALUES (@tipo, @observacao, @criadoPorUsuarioId, @criadoPorNome);
      `);

    const aprovacaoId = resultado.recordset[0].id;
    numero = resultado.recordset[0].numero;

    for (const item of params.itens) {
      const novoSalario = Math.round((item.salarioAtual + item.valorReajuste) * 100) / 100;

      await new sql.Request(transaction)
        .input("aprovacaoId", sql.UniqueIdentifier, aprovacaoId)
        .input("funcionarioCodigo", sql.VarChar(30), item.funcionarioCodigo)
        .input("funcionarioNome", sql.NVarChar(200), item.funcionarioNome)
        .input("funcionarioCpf", sql.VarChar(14), item.funcionarioCpf)
        .input("departamento", sql.NVarChar(200), item.departamento)
        .input("setor", sql.NVarChar(200), item.setor)
        .input("salarioAtual", sql.Decimal(14, 2), item.salarioAtual)
        .input("valorReajuste", sql.Decimal(14, 2), item.valorReajuste)
        .input("percentualReajuste", sql.Decimal(9, 4), item.percentualReajuste)
        .input("novoSalario", sql.Decimal(14, 2), novoSalario)
        .input("observacao", sql.NVarChar(2000), item.observacao)
        .query(`
          INSERT INTO dbo.portal_aprovacoes_aumento_salarial
            ([aprovacao_id], [funcionario_codigo], [funcionario_nome], [funcionario_cpf], [departamento], [setor], [salario_atual], [valor_reajuste], [percentual_reajuste], [novo_salario], [observacao])
          VALUES
            (@aprovacaoId, @funcionarioCodigo, @funcionarioNome, @funcionarioCpf, @departamento, @setor, @salarioAtual, @valorReajuste, @percentualReajuste, @novoSalario, @observacao);
        `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const criado = await buscarLotePorNumero(numero);
  if (!criado) throw new Error("Solicitação criada mas não encontrada logo em seguida.");
  return criado;
}

export async function buscarLotePorNumero(numero: number): Promise<AprovacaoLote | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("numero", sql.Int, numero)
    .query<ItemRow>(`
      SELECT ${colunasItem}
      FROM dbo.portal_aprovacoes AS a
      INNER JOIN dbo.portal_aprovacoes_aumento_salarial AS i ON i.[aprovacao_id] = a.[id]
      WHERE a.[numero] = @numero
      ORDER BY i.[criado_em] ASC;
    `);

  if (result.recordset.length === 0) return null;

  const primeiro = result.recordset[0];
  return {
    id: primeiro.aprovacao_id,
    numero: primeiro.aprovacao_numero,
    tipo: "aumento_salarial",
    observacao: primeiro.observacao_geral,
    criadoPorUsuarioId: primeiro.criado_por_usuario_id,
    criadoPorNome: primeiro.criado_por_nome,
    criadoEm: primeiro.criado_em,
    itens: result.recordset.map(mapItemRow),
  };
}

export async function buscarItemPorId(itemId: string): Promise<ItemAumentoSalarial | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("itemId", sql.UniqueIdentifier, itemId)
    .query<ItemRow>(`
      SELECT ${colunasItem}
      FROM dbo.portal_aprovacoes_aumento_salarial AS i
      INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = i.[aprovacao_id]
      WHERE i.[id] = @itemId;
    `);

  const row = result.recordset[0];
  return row ? mapItemRow(row) : null;
}

export interface FiltrosPainel {
  status?: StatusItemAprovacao | "todos";
  /* Nome do colaborador OU de quem solicitou. */
  busca?: string;
}

/*
 * Um item (colaborador) por linha -- não um lote por linha, já que cada
 * colaborador é decidido separadamente.
 *
 * `tiposAtendidos` vem de portal_aprovacoes_atendentes: quem não atende
 * nenhum tipo não vê nenhuma pendência (nega por padrão, inclusive para
 * administrador).
 */
export async function listarItensPainel(
  tiposAtendidos: TipoAprovacao[],
  filtros: FiltrosPainel = {}
): Promise<ItemAumentoSalarial[]> {
  if (tiposAtendidos.length === 0) return [];

  const pool = await getSqlServerPool();
  const request = pool.request();

  const parametrosTipo = tiposAtendidos.map((tipo, indice) => {
    const nome = `tipo${indice}`;
    request.input(nome, sql.VarChar(40), tipo);
    return `@${nome}`;
  });

  const status = filtros.status ?? "pendente";
  request.input("status", sql.VarChar(20), status === "todos" ? "" : status);

  const busca = (filtros.busca ?? "").trim();
  request.input("busca", sql.NVarChar(200), busca);
  request.input("buscaLike", sql.NVarChar(204), `%${busca}%`);

  const result = await request.query<ItemRow>(`
    SELECT ${colunasItem}
    FROM dbo.portal_aprovacoes_aumento_salarial AS i
    INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = i.[aprovacao_id]
    WHERE a.[tipo] IN (${parametrosTipo.join(", ")})
      AND (@status = '' OR i.[status] = @status)
      AND (
        @busca = ''
        OR i.[funcionario_nome] LIKE @buscaLike
        OR a.[criado_por_nome] LIKE @buscaLike
      )
    ORDER BY
      CASE WHEN i.[status] = 'pendente' THEN 0 ELSE 1 END,
      CASE WHEN i.[status] = 'pendente' THEN i.[criado_em] END ASC,
      i.[decidido_em] DESC;
  `);

  return result.recordset.map(mapItemRow);
}

export async function listarMinhasSolicitacoes(usuarioId: string): Promise<ItemAumentoSalarial[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<ItemRow>(`
      SELECT ${colunasItem}
      FROM dbo.portal_aprovacoes_aumento_salarial AS i
      INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = i.[aprovacao_id]
      WHERE a.[criado_por_usuario_id] = @usuarioId
      ORDER BY a.[criado_em] DESC, i.[criado_em] ASC;
    `);

  return result.recordset.map(mapItemRow);
}

/*
 * A direção pode ajustar valor/percentual na hora de decidir. Só é
 * enviado quando ela realmente mexeu nos campos -- o novo salário é
 * sempre recalculado aqui a partir do salário do snapshot, nunca aceito
 * do cliente (mesma regra da criação).
 */
export interface AjusteValoresDecisao {
  valorReajuste: number;
  percentualReajuste: number;
}

async function decidirItem(
  itemId: string,
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao">,
  novoStatus: Extract<StatusItemAprovacao, "aprovado" | "reprovado">,
  comentario: string | null,
  ajuste: AjusteValoresDecisao | null
): Promise<ItemAumentoSalarial> {
  const atual = await buscarItemPorId(itemId);
  if (!atual) {
    throw new ValidationError("Colaborador não encontrado nesta solicitação.");
  }
  if (atual.status !== "pendente") {
    throw new ValidationError("Este colaborador já foi decidido.");
  }

  let valorReajuste = atual.valorReajuste;
  let percentualReajuste = atual.percentualReajuste;
  let novoSalario = atual.novoSalario;
  let alterou = false;

  if (ajuste) {
    if (!Number.isFinite(ajuste.valorReajuste) || ajuste.valorReajuste <= 0) {
      throw new ValidationError("O valor do reajuste deve ser maior que zero.");
    }
    if (!Number.isFinite(ajuste.percentualReajuste) || ajuste.percentualReajuste <= 0) {
      throw new ValidationError("O percentual do reajuste deve ser maior que zero.");
    }

    const valorAjustado = Math.round(ajuste.valorReajuste * 100) / 100;
    const percentualAjustado = Math.round(ajuste.percentualReajuste * 10000) / 10000;

    alterou = valorAjustado !== atual.valorReajuste || percentualAjustado !== atual.percentualReajuste;

    if (alterou) {
      valorReajuste = valorAjustado;
      percentualReajuste = percentualAjustado;
      novoSalario = Math.round((atual.salarioAtual + valorAjustado) * 100) / 100;
    }
  }

  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("itemId", sql.UniqueIdentifier, itemId)
    .input("status", sql.VarChar(20), novoStatus)
    .input("decididoPorUsuarioId", sql.UniqueIdentifier, usuario.id)
    .input("decididoPorNome", sql.NVarChar(200), usuario.nomeExibicao)
    .input("comentario", sql.NVarChar(2000), comentario)
    .input("alterou", sql.Bit, alterou)
    .input("valorReajuste", sql.Decimal(14, 2), valorReajuste)
    .input("percentualReajuste", sql.Decimal(9, 4), percentualReajuste)
    .input("novoSalario", sql.Decimal(14, 2), novoSalario)
    .query(`
      UPDATE dbo.portal_aprovacoes_aumento_salarial
      SET
        /* Guarda o que o solicitante pediu só na PRIMEIRA alteração -- depois disso o "original" já está registrado. */
        [valor_reajuste_original] = CASE WHEN @alterou = 1 AND [valor_reajuste_original] IS NULL THEN [valor_reajuste] ELSE [valor_reajuste_original] END,
        [percentual_reajuste_original] = CASE WHEN @alterou = 1 AND [percentual_reajuste_original] IS NULL THEN [percentual_reajuste] ELSE [percentual_reajuste_original] END,
        [novo_salario_original] = CASE WHEN @alterou = 1 AND [novo_salario_original] IS NULL THEN [novo_salario] ELSE [novo_salario_original] END,
        [valor_reajuste] = @valorReajuste,
        [percentual_reajuste] = @percentualReajuste,
        [novo_salario] = @novoSalario,
        [status] = @status,
        [decidido_por_usuario_id] = @decididoPorUsuarioId,
        [decidido_por_nome] = @decididoPorNome,
        [decidido_em] = SYSDATETIME(),
        [comentario_decisao] = @comentario,
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @itemId AND [status] = 'pendente';
    `);

  if ((result.rowsAffected[0] ?? 0) === 0) {
    throw new ValidationError("Este colaborador já foi decidido ou não existe.");
  }

  const atualizado = await buscarItemPorId(itemId);
  if (!atualizado) throw new Error("Item decidido mas não encontrado logo em seguida.");
  return atualizado;
}

export function aprovarItem(
  itemId: string,
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao">,
  comentario: string | null,
  ajuste: AjusteValoresDecisao | null = null
): Promise<ItemAumentoSalarial> {
  return decidirItem(itemId, usuario, "aprovado", comentario, ajuste);
}

export function reprovarItem(
  itemId: string,
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao">,
  comentario: string,
  ajuste: AjusteValoresDecisao | null = null
): Promise<ItemAumentoSalarial> {
  return decidirItem(itemId, usuario, "reprovado", comentario, ajuste);
}
