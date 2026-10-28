import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";
import type { PortalUsuario } from "@/lib/auth/usuarios";

import {
  decidirEtapa,
  iniciarFluxo,
  sqlColunasNivelAtual,
  sqlNaVezDoUsuario,
  sqlParticipaDaCadeia,
  sqlSemCadeia,
  type ResultadoEtapa,
} from "./alcadas/fluxo";
import type { TipoAprovacao } from "./tipos-aprovacao";

export const MAXIMO_COLABORADORES_POR_SOLICITACAO = 100;

/* "reprovado" só existe em itens decididos antes das alçadas; hoje a negativa é "devolvido". */
export type StatusItemAprovacao = "pendente" | "aprovado" | "reprovado" | "devolvido";

const TIPO_REAJUSTE: TipoAprovacao = "aumento_salarial";

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
  /* De que tipo de aprovação este item é -- o painel atende vários. */
  tipo: TipoAprovacao;
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
  /* "YYYY-MM-DD", copiada do RH na criação (GER_FUNCIONARIO.FUN_DTADM). */
  dataAdmissao: string | null;
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
  /* Último envio do relatório da SOLICITAÇÃO (repetido em cada item dela). */
  relatorioEnviado: EnvioRelatorio | null;
  /* É a vez de quem está consultando decidir (o nível pendente é o dele). */
  naMinhaVez: boolean;
  /* Pendente: em que nível da alçada está. */
  nivelAtual: { ordem: number; total: number; nome: string; direcionadoPara: string | null } | null;
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

export interface EnvioRelatorio {
  em: string;
  por: string;
  para: string;
}

/* Marca o último envio do relatório -- a tela usa isso pra dizer que já foi e evitar reenvio às cegas. */
export async function registrarEnvioRelatorio(
  numero: number,
  enviadoPor: string,
  enviadoPara: string
): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("numero", sql.Int, numero)
    .input("por", sql.NVarChar(200), enviadoPor)
    .input("para", sql.NVarChar(200), enviadoPara)
    .query(`
      UPDATE dbo.portal_aprovacoes
      SET [relatorio_enviado_em] = SYSDATETIME(),
          [relatorio_enviado_por] = @por,
          [relatorio_enviado_para] = @para
      WHERE [numero] = @numero;
    `);
}

interface ItemRow {
  item_id: string;
  aprovacao_id: string;
  aprovacao_numero: number;
  tipo: TipoAprovacao;
  observacao_geral: string | null;
  criado_por_usuario_id: string;
  criado_por_nome: string;
  criado_em: string;
  funcionario_codigo: string;
  funcionario_nome: string;
  funcionario_cpf: string | null;
  departamento: string | null;
  setor: string | null;
  data_admissao: string | null;
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
  relatorio_enviado_em: string | null;
  relatorio_enviado_por: string | null;
  relatorio_enviado_para: string | null;
  na_minha_vez: number;
  nivel_ordem: number | null;
  nivel_nome: string | null;
  nivel_total: number | null;
  nivel_direcionado: string | null;
}

/* Toda consulta com colunasItem declara @usuarioId (quem está vendo; NULL = ninguém em particular). */
const colunasItem = `
  CONVERT(VARCHAR(36), i.[id]) AS [item_id],
  CONVERT(VARCHAR(36), a.[id]) AS [aprovacao_id],
  a.[numero] AS [aprovacao_numero],
  a.[tipo],
  a.[observacao] AS [observacao_geral],
  CONVERT(VARCHAR(36), a.[criado_por_usuario_id]) AS [criado_por_usuario_id],
  a.[criado_por_nome],
  CONVERT(VARCHAR(33), a.[criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), a.[relatorio_enviado_em], 126) AS [relatorio_enviado_em],
  a.[relatorio_enviado_por],
  a.[relatorio_enviado_para],
  i.[funcionario_codigo],
  i.[funcionario_nome],
  i.[funcionario_cpf],
  i.[departamento],
  i.[setor],
  CONVERT(VARCHAR(10), i.[data_admissao], 23) AS [data_admissao],
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
  i.[observacao],
  CASE WHEN ${sqlNaVezDoUsuario("i.[id]")} THEN 1 ELSE 0 END AS [na_minha_vez],
  ${sqlColunasNivelAtual("i.[id]")}
`;

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mapItemRow(row: ItemRow): ItemAumentoSalarial {
  return {
    id: row.item_id,
    aprovacaoId: row.aprovacao_id,
    aprovacaoNumero: row.aprovacao_numero,
    tipo: row.tipo,
    observacaoGeral: row.observacao_geral,
    criadoPorUsuarioId: row.criado_por_usuario_id,
    criadoPorNome: row.criado_por_nome,
    criadoEm: row.criado_em,
    funcionarioCodigo: row.funcionario_codigo,
    funcionarioNome: row.funcionario_nome,
    funcionarioCpf: row.funcionario_cpf,
    departamento: row.departamento,
    setor: row.setor,
    dataAdmissao: row.data_admissao,
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
    relatorioEnviado: row.relatorio_enviado_em
      ? {
          em: row.relatorio_enviado_em,
          por: row.relatorio_enviado_por ?? "-",
          para: row.relatorio_enviado_para ?? "-",
        }
      : null,
    naMinhaVez: row.na_minha_vez === 1,
    nivelAtual:
      row.nivel_ordem !== null && row.nivel_nome
        ? {
            ordem: row.nivel_ordem,
            total: row.nivel_total ?? row.nivel_ordem,
            nome: row.nivel_nome,
            direcionadoPara: row.nivel_direcionado,
          }
        : null,
  };
}

/*
 * Quem enxerga o item `i` no painel: na fila ("pendente"), só quando é
 * a vez do nível dele; no histórico, quando a cadeia já chegou ao nível
 * dele. Itens de antes das alçadas (sem cadeia) seguem visíveis para
 * quem decide reajuste, como antes.
 */
const visibilidadePainel = `(
  (@status = 'pendente' AND i.[status] = 'pendente' AND ${sqlNaVezDoUsuario("i.[id]")})
  OR (
    @status <> 'pendente'
    AND (${sqlParticipaDaCadeia("i.[id]")} OR ${sqlSemCadeia("i.[id]")})
    AND (@status = '' OR i.[status] = @status)
  )
)`;

export interface ItemCriarSolicitacaoParams {
  funcionarioCodigo: string;
  funcionarioNome: string;
  funcionarioCpf: string | null;
  departamento: string | null;
  setor: string | null;
  dataAdmissao: string | null;
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

  /*
   * Teto para não existir solicitação impossível de decidir e de
   * relatar: cada colaborador vira uma linha no painel, uma decisão
   * individual e uma linha no PDF/Excel do relatório.
   */
  if (params.itens.length > MAXIMO_COLABORADORES_POR_SOLICITACAO) {
    throw new ValidationError(
      `Uma solicitação aceita no máximo ${MAXIMO_COLABORADORES_POR_SOLICITACAO} colaboradores. Divida em mais de uma.`
    );
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

      const inserido = await new sql.Request(transaction)
        .input("aprovacaoId", sql.UniqueIdentifier, aprovacaoId)
        .input("funcionarioCodigo", sql.VarChar(30), item.funcionarioCodigo)
        .input("funcionarioNome", sql.NVarChar(200), item.funcionarioNome)
        .input("funcionarioCpf", sql.VarChar(14), item.funcionarioCpf)
        .input("departamento", sql.NVarChar(200), item.departamento)
        .input("setor", sql.NVarChar(200), item.setor)
        /* VarChar em vez de sql.Date: "YYYY-MM-DD" o SQL Server converte sem ambiguidade, e um Date do JS traria fuso junto. */
        .input("dataAdmissao", sql.VarChar(10), item.dataAdmissao)
        .input("salarioAtual", sql.Decimal(14, 2), item.salarioAtual)
        .input("valorReajuste", sql.Decimal(14, 2), item.valorReajuste)
        .input("percentualReajuste", sql.Decimal(9, 4), item.percentualReajuste)
        .input("novoSalario", sql.Decimal(14, 2), novoSalario)
        .input("observacao", sql.NVarChar(2000), item.observacao)
        .query<{ id: string }>(`
          INSERT INTO dbo.portal_aprovacoes_aumento_salarial
            ([aprovacao_id], [funcionario_codigo], [funcionario_nome], [funcionario_cpf], [departamento], [setor], [data_admissao], [salario_atual], [valor_reajuste], [percentual_reajuste], [novo_salario], [observacao])
          OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
          VALUES
            (@aprovacaoId, @funcionarioCodigo, @funcionarioNome, @funcionarioCpf, @departamento, @setor, @dataAdmissao, @salarioAtual, @valorReajuste, @percentualReajuste, @novoSalario, @observacao);
        `);

      /*
       * Cada colaborador entra na cadeia da alçada do SEU setor. Sem
       * alçada (ou nível sem aprovador), a solicitação inteira não é
       * criada -- o solicitante vê o motivo.
       */
      await iniciarFluxo(transaction, {
        tipo: TIPO_REAJUSTE,
        itemId: inserido.recordset[0].id,
        contexto: { empresa: null, setor: item.setor },
        usuario: { id: usuario.id, nome: usuario.nomeExibicao },
        comentario: item.observacao ?? params.observacao,
      });
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

/*
 * O item `i` já chegou ao nível do usuário (ou é de antes das alçadas):
 * o que o painel pode mostrar fora da fila. Sem @restringir, tudo.
 */
const visivelSeRestrito = `(
  @restringir = 0
  OR ${sqlParticipaDaCadeia("i.[id]")}
  OR ${sqlSemCadeia("i.[id]")}
)`;

/*
 * A solicitação com os colaboradores. Com `somenteVisiveis`, só os que a
 * cadeia já trouxe ao nível do usuário -- na mesma solicitação pode
 * haver colaborador de outro setor, numa alçada em que ele não está.
 */
export async function buscarLotePorNumero(
  numero: number,
  usuarioId: string | null = null,
  opcoes: { somenteVisiveis?: boolean } = {}
): Promise<AprovacaoLote | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("numero", sql.Int, numero)
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("restringir", sql.Bit, opcoes.somenteVisiveis === true)
    .query<ItemRow>(`
      SELECT ${colunasItem}
      FROM dbo.portal_aprovacoes AS a
      INNER JOIN dbo.portal_aprovacoes_aumento_salarial AS i ON i.[aprovacao_id] = a.[id]
      WHERE a.[numero] = @numero AND ${visivelSeRestrito}
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

export async function buscarItemPorId(
  itemId: string,
  usuarioId: string | null = null,
  opcoes: { somenteVisiveis?: boolean } = {}
): Promise<ItemAumentoSalarial | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("itemId", sql.UniqueIdentifier, itemId)
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .input("restringir", sql.Bit, opcoes.somenteVisiveis === true)
    .query<ItemRow>(`
      SELECT ${colunasItem}
      FROM dbo.portal_aprovacoes_aumento_salarial AS i
      INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = i.[aprovacao_id]
      WHERE i.[id] = @itemId AND ${visivelSeRestrito};
    `);

  const row = result.recordset[0];
  return row ? mapItemRow(row) : null;
}

export type OrdemPainel = "fila" | "colaborador" | "recentes";

export interface FiltrosPainel {
  status?: StatusItemAprovacao | "todos";
  /* Nome do colaborador OU de quem solicitou. */
  busca?: string;
  departamento?: string;
  setor?: string;
  /* Um tipo específico, ou vazio para todos os que a pessoa atende. */
  tipo?: TipoAprovacao | "";
  ordem?: OrdemPainel;
}

/*
 * ORDER BY montado a partir de um conjunto fechado -- nunca de texto
 * vindo da requisição.
 *
 * "fila" (padrão) é a ordem de trabalho: pendentes primeiro, mais
 * antigos no topo; decididos depois, decisão mais recente primeiro.
 */
const ORDENACOES: Record<OrdemPainel, string> = {
  fila: `
    CASE WHEN i.[status] = 'pendente' THEN 0 ELSE 1 END,
    CASE WHEN i.[status] = 'pendente' THEN i.[criado_em] END ASC,
    i.[decidido_em] DESC`,
  colaborador: "i.[funcionario_nome] ASC, i.[criado_em] ASC",
  recentes: "i.[criado_em] DESC",
};

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
  filtros: FiltrosPainel = {},
  usuarioId: string
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
  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

  const busca = (filtros.busca ?? "").trim();
  request.input("busca", sql.NVarChar(200), busca);
  request.input("buscaLike", sql.NVarChar(204), `%${busca}%`);

  request.input("tipoFiltro", sql.VarChar(40), (filtros.tipo ?? "").trim());
  request.input("departamento", sql.NVarChar(200), (filtros.departamento ?? "").trim());
  request.input("setor", sql.NVarChar(200), (filtros.setor ?? "").trim());

  const ordem = ORDENACOES[filtros.ordem ?? "fila"] ?? ORDENACOES.fila;

  const result = await request.query<ItemRow>(`
    SELECT ${colunasItem}
    FROM dbo.portal_aprovacoes_aumento_salarial AS i
    INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = i.[aprovacao_id]
    WHERE a.[tipo] IN (${parametrosTipo.join(", ")})
      AND ${visibilidadePainel}
      AND (
        @busca = ''
        OR i.[funcionario_nome] LIKE @buscaLike
        OR a.[criado_por_nome] LIKE @buscaLike
      )
      AND (@tipoFiltro = '' OR a.[tipo] = @tipoFiltro)
      AND (@departamento = '' OR i.[departamento] = @departamento)
      AND (@setor = '' OR i.[setor] = @setor)
    ORDER BY ${ordem};
  `);

  return result.recordset.map(mapItemRow);
}

export interface SolicitacaoResumoPainel {
  numero: number;
  tipo: TipoAprovacao;
  criadoPorNome: string;
  criadoEm: string;
  totalItens: number;
  totalReajuste: number;
  pendentes: number;
}

/*
 * Resumo por SOLICITAÇÃO para o modo agrupado do painel.
 *
 * Os filtros decidem QUAIS solicitações aparecem (basta um colaborador
 * dentro dela bater), mas as contagens são sempre sobre a solicitação
 * INTEIRA. Somar só o que passou pelo filtro faria um lote de 5 com 3
 * já decididos aparecer como "2 colaboradores", e o modal -- que busca
 * o lote completo -- contradiria a lista.
 */
export async function listarSolicitacoesPainel(
  tiposAtendidos: TipoAprovacao[],
  filtros: FiltrosPainel = {},
  usuarioId: string
): Promise<SolicitacaoResumoPainel[]> {
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
  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

  const busca = (filtros.busca ?? "").trim();
  request.input("busca", sql.NVarChar(200), busca);
  request.input("buscaLike", sql.NVarChar(204), `%${busca}%`);
  request.input("tipoFiltro", sql.VarChar(40), (filtros.tipo ?? "").trim());
  request.input("departamento", sql.NVarChar(200), (filtros.departamento ?? "").trim());
  request.input("setor", sql.NVarChar(200), (filtros.setor ?? "").trim());

  const result = await request.query<{
    numero: number;
    tipo: TipoAprovacao;
    criado_por_nome: string;
    criado_em: string;
    total_itens: number;
    total_reajuste: number;
    pendentes: number;
  }>(`
    SELECT
      a.[numero],
      a.[tipo],
      a.[criado_por_nome],
      CONVERT(VARCHAR(33), a.[criado_em], 126) AS [criado_em],
      COUNT(*) AS [total_itens],
      SUM(ia.[valor_reajuste]) AS [total_reajuste],
      SUM(CASE WHEN ia.[status] = 'pendente' THEN 1 ELSE 0 END) AS [pendentes]
    FROM dbo.portal_aprovacoes AS a
    INNER JOIN dbo.portal_aprovacoes_aumento_salarial AS ia ON ia.[aprovacao_id] = a.[id]
    WHERE a.[tipo] IN (${parametrosTipo.join(", ")})
      AND EXISTS (
        SELECT 1
        FROM dbo.portal_aprovacoes_aumento_salarial AS i
        WHERE i.[aprovacao_id] = a.[id]
          AND ${visibilidadePainel}
          AND (@tipoFiltro = '' OR a.[tipo] = @tipoFiltro)
          AND (@departamento = '' OR i.[departamento] = @departamento)
          AND (@setor = '' OR i.[setor] = @setor)
          AND (
            @busca = ''
            OR i.[funcionario_nome] LIKE @buscaLike
            OR a.[criado_por_nome] LIKE @buscaLike
          )
      )
    GROUP BY a.[numero], a.[tipo], a.[criado_por_nome], a.[criado_em]
    ORDER BY
      CASE WHEN SUM(CASE WHEN ia.[status] = 'pendente' THEN 1 ELSE 0 END) > 0 THEN 0 ELSE 1 END,
      a.[criado_em] DESC;
  `);

  return result.recordset.map((row) => ({
    numero: row.numero,
    tipo: row.tipo,
    criadoPorNome: row.criado_por_nome,
    criadoEm: row.criado_em,
    totalItens: row.total_itens,
    totalReajuste: Number(row.total_reajuste),
    pendentes: row.pendentes,
  }));
}

/*
 * Quantas pendências cada tipo tem, sem considerar os filtros da tela.
 * É o contador das abas por tipo: com a fila separada por módulo, é o
 * que impede uma solicitação de ficar esquecida numa aba que ninguém
 * abriu.
 */
export async function contarPendentesPorTipo(
  tiposAtendidos: TipoAprovacao[],
  usuarioId: string
): Promise<Record<string, number>> {
  if (tiposAtendidos.length === 0) return {};

  const pool = await getSqlServerPool();
  const request = pool.request();

  const parametrosTipo = tiposAtendidos.map((tipo, indice) => {
    const nome = `tipo${indice}`;
    request.input(nome, sql.VarChar(40), tipo);
    return `@${nome}`;
  });

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

  const result = await request.query<{ tipo: string; total: number }>(`
    SELECT a.[tipo], COUNT(*) AS [total]
    FROM dbo.portal_aprovacoes_aumento_salarial AS i
    INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = i.[aprovacao_id]
    WHERE a.[tipo] IN (${parametrosTipo.join(", ")})
      AND i.[status] = 'pendente'
      AND ${sqlNaVezDoUsuario("i.[id]")}
    GROUP BY a.[tipo];
  `);

  const contagem: Record<string, number> = {};
  for (const tipo of tiposAtendidos) contagem[tipo] = 0;
  for (const row of result.recordset) contagem[row.tipo] = row.total;

  return contagem;
}

/* Alimenta os dropdowns do painel: só o que realmente aparece na fila de quem está olhando. */
export async function listarOpcoesFiltroPainel(
  tiposAtendidos: TipoAprovacao[]
): Promise<{ departamentos: string[]; setores: string[] }> {
  if (tiposAtendidos.length === 0) return { departamentos: [], setores: [] };

  const pool = await getSqlServerPool();
  const request = pool.request();

  const parametrosTipo = tiposAtendidos.map((tipo, indice) => {
    const nome = `tipo${indice}`;
    request.input(nome, sql.VarChar(40), tipo);
    return `@${nome}`;
  });

  const result = await request.query<{ departamento: string | null; setor: string | null }>(`
    SELECT DISTINCT i.[departamento], i.[setor]
    FROM dbo.portal_aprovacoes_aumento_salarial AS i
    INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = i.[aprovacao_id]
    WHERE a.[tipo] IN (${parametrosTipo.join(", ")});
  `);

  const departamentos = new Set<string>();
  const setores = new Set<string>();

  for (const row of result.recordset) {
    if (row.departamento) departamentos.add(row.departamento);
    if (row.setor) setores.add(row.setor);
  }

  const ordenar = (valores: Set<string>) =>
    Array.from(valores).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return { departamentos: ordenar(departamentos), setores: ordenar(setores) };
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

export interface DecisaoItem {
  item: ItemAumentoSalarial;
  /* avancou: subiu de nível | aprovado: era o último | devolvido: voltou ao solicitante. */
  etapa: ResultadoEtapa;
}

/*
 * Decide o colaborador no nível da vez de quem decide: aprovar sobe para
 * o próximo nível (ou aprova em definitivo no último); devolver encerra
 * a cadeia e o solicitante pode ajustar e reenviar. A etapa e o item
 * mudam na mesma transação.
 *
 * O ajuste de valor/percentual continua valendo em qualquer nível -- o
 * "original" guarda o que o solicitante pediu, na primeira alteração.
 */
async function decidirItem(
  itemId: string,
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao">,
  acao: "aprovar" | "devolver",
  comentario: string | null,
  ajuste: AjusteValoresDecisao | null
): Promise<DecisaoItem> {
  const atual = await buscarItemPorId(itemId, usuario.id);
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
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  let etapa: ResultadoEtapa;

  try {
    /* Trava o item: duas pessoas do mesmo nível decidindo ao mesmo tempo -- a segunda recebe "já decidido". */
    const travado = await new sql.Request(transaction)
      .input("itemId", sql.UniqueIdentifier, itemId)
      .query<{ status: string }>(`
        SELECT [status] FROM dbo.portal_aprovacoes_aumento_salarial WITH (UPDLOCK, HOLDLOCK) WHERE [id] = @itemId;
      `);
    if (travado.recordset[0]?.status !== "pendente") {
      throw new ValidationError("Este colaborador já foi decidido.");
    }

    etapa = await decidirEtapa(transaction, {
      tipo: TIPO_REAJUSTE,
      itemId,
      usuario: { id: usuario.id, nome: usuario.nomeExibicao },
      acao,
      comentario,
    });

    const terminou = etapa.resultado !== "avancou";

    await new sql.Request(transaction)
      .input("itemId", sql.UniqueIdentifier, itemId)
      .input("terminou", sql.Bit, terminou)
      .input("status", sql.VarChar(20), etapa.resultado === "devolvido" ? "devolvido" : "aprovado")
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
          /* Só a última aprovação (ou a devolução) fecha o item; subir de nível não muda o status. */
          [status] = CASE WHEN @terminou = 1 THEN @status ELSE [status] END,
          [decidido_por_usuario_id] = CASE WHEN @terminou = 1 THEN @decididoPorUsuarioId ELSE [decidido_por_usuario_id] END,
          [decidido_por_nome] = CASE WHEN @terminou = 1 THEN @decididoPorNome ELSE [decidido_por_nome] END,
          [decidido_em] = CASE WHEN @terminou = 1 THEN SYSDATETIME() ELSE [decidido_em] END,
          [comentario_decisao] = CASE WHEN @terminou = 1 THEN @comentario ELSE [comentario_decisao] END,
          [atualizado_em] = SYSDATETIME()
        WHERE [id] = @itemId;
      `);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }

  const atualizado = await buscarItemPorId(itemId, usuario.id);
  if (!atualizado) throw new Error("Item decidido mas não encontrado logo em seguida.");
  return { item: atualizado, etapa };
}

export function aprovarItem(
  itemId: string,
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao">,
  comentario: string | null,
  ajuste: AjusteValoresDecisao | null = null
): Promise<DecisaoItem> {
  return decidirItem(itemId, usuario, "aprovar", comentario, ajuste);
}

/* Devolve ao solicitante (antes: "reprovar"). O motivo é obrigatório na rota. */
export function devolverItem(
  itemId: string,
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao">,
  comentario: string,
  ajuste: AjusteValoresDecisao | null = null
): Promise<DecisaoItem> {
  return decidirItem(itemId, usuario, "devolver", comentario, ajuste);
}

export interface FalhaDecisaoLote {
  itemId: string;
  motivo: string;
}

export interface ResultadoDecisaoLote {
  decididos: DecisaoItem[];
  falhas: FalhaDecisaoLote[];
}

/*
 * Decide vários colaboradores de uma vez no painel, no nível de quem
 * decide. Sem ajuste de valores de propósito: mexer em valor é
 * conferência individual, não cabe numa ação que atinge a seleção.
 *
 * Um item que falha (já decidido por outra pessoa, ou não está na vez
 * de quem decide) não derruba os demais -- entra em `falhas`.
 */
export async function decidirItensEmLote(
  itemIds: string[],
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao">,
  acao: "aprovar" | "devolver",
  comentario: string | null
): Promise<ResultadoDecisaoLote> {
  if (itemIds.length === 0) {
    throw new ValidationError("Selecione ao menos um colaborador.");
  }

  const decididos: DecisaoItem[] = [];
  const falhas: FalhaDecisaoLote[] = [];

  for (const itemId of itemIds) {
    try {
      decididos.push(await decidirItem(itemId, usuario, acao, comentario, null));
    } catch (error) {
      falhas.push({
        itemId,
        motivo: error instanceof ValidationError ? error.message : "Erro inesperado ao decidir.",
      });
    }
  }

  return { decididos, falhas };
}

/*
 * O solicitante ajusta e reenvia um colaborador devolvido: os valores
 * novos viram o "pedido" (o original da direção é zerado, já que a
 * base mudou) e a cadeia recomeça do nível 1, num ciclo novo.
 */
export async function reenviarItem(
  itemId: string,
  usuario: Pick<PortalUsuario, "id" | "nomeExibicao">,
  dados: { valorReajuste: number; percentualReajuste: number; comentario: string | null }
): Promise<ItemAumentoSalarial> {
  const atual = await buscarItemPorId(itemId, usuario.id);
  if (!atual || atual.criadoPorUsuarioId.toUpperCase() !== usuario.id.toUpperCase()) {
    throw new ValidationError("Colaborador não encontrado nas suas solicitações.");
  }
  if (atual.status !== "devolvido") {
    throw new ValidationError("Só dá para reenviar um colaborador devolvido.");
  }
  if (!Number.isFinite(dados.valorReajuste) || dados.valorReajuste <= 0) {
    throw new ValidationError("O valor do reajuste deve ser maior que zero.");
  }
  if (!Number.isFinite(dados.percentualReajuste) || dados.percentualReajuste <= 0) {
    throw new ValidationError("O percentual do reajuste deve ser maior que zero.");
  }

  const valorReajuste = Math.round(dados.valorReajuste * 100) / 100;
  const percentualReajuste = Math.round(dados.percentualReajuste * 10000) / 10000;
  const novoSalario = Math.round((atual.salarioAtual + valorReajuste) * 100) / 100;

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const atualizado = await new sql.Request(transaction)
      .input("itemId", sql.UniqueIdentifier, itemId)
      .input("valorReajuste", sql.Decimal(14, 2), valorReajuste)
      .input("percentualReajuste", sql.Decimal(9, 4), percentualReajuste)
      .input("novoSalario", sql.Decimal(14, 2), novoSalario)
      .query(`
        UPDATE dbo.portal_aprovacoes_aumento_salarial
        SET [valor_reajuste] = @valorReajuste,
            [percentual_reajuste] = @percentualReajuste,
            [novo_salario] = @novoSalario,
            [valor_reajuste_original] = NULL,
            [percentual_reajuste_original] = NULL,
            [novo_salario_original] = NULL,
            [status] = 'pendente',
            [decidido_por_usuario_id] = NULL,
            [decidido_por_nome] = NULL,
            [decidido_em] = NULL,
            [comentario_decisao] = NULL,
            [atualizado_em] = SYSDATETIME()
        WHERE [id] = @itemId AND [status] = 'devolvido';
      `);

    if ((atualizado.rowsAffected[0] ?? 0) === 0) {
      throw new ValidationError("Este colaborador não está mais devolvido.");
    }

    await iniciarFluxo(transaction, {
      tipo: TIPO_REAJUSTE,
      itemId,
      contexto: { empresa: null, setor: atual.setor },
      usuario: { id: usuario.id, nome: usuario.nomeExibicao },
      comentario: dados.comentario,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }

  const final = await buscarItemPorId(itemId, usuario.id);
  if (!final) throw new Error("Item reenviado mas não encontrado logo em seguida.");
  return final;
}

/*
 * Colaboradores pendentes que entraram antes das alçadas (sem cadeia):
 * entram no nível 1 da alçada do setor assim que ela existir. Sem
 * alçada ainda, ficam como estão -- a próxima carga do painel tenta de
 * novo. Devolve os ids que entraram (para avisar o nível 1).
 */
export async function iniciarFluxosReajusteSemEtapa(): Promise<string[]> {
  const pool = await getSqlServerPool();

  const semCadeia = await pool.request().query<{
    id: string;
    setor: string | null;
    observacao: string | null;
    criado_por_usuario_id: string | null;
    criado_por_nome: string;
    enviado_em: string;
  }>(`
    SELECT TOP 100 CONVERT(VARCHAR(36), i.[id]) AS [id], i.[setor], i.[observacao],
           CONVERT(VARCHAR(33), i.[criado_em], 126) AS [enviado_em],
           CONVERT(VARCHAR(36), a.[criado_por_usuario_id]) AS [criado_por_usuario_id], a.[criado_por_nome]
    FROM dbo.portal_aprovacoes_aumento_salarial AS i
    INNER JOIN dbo.portal_aprovacoes AS a ON a.[id] = i.[aprovacao_id]
    WHERE i.[status] = 'pendente' AND ${sqlSemCadeia("i.[id]")}
    ORDER BY i.[criado_em];
  `);

  const iniciados: string[] = [];

  for (const item of semCadeia.recordset) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await iniciarFluxo(transaction, {
        tipo: TIPO_REAJUSTE,
        itemId: item.id,
        contexto: { empresa: null, setor: item.setor },
        usuario: { id: item.criado_por_usuario_id, nome: item.criado_por_nome },
        comentario: item.observacao,
        enviadoEm: item.enviado_em,
      });
      await transaction.commit();
      iniciados.push(item.id);
    } catch (error) {
      await transaction.rollback().catch(() => {});
      if (!(error instanceof ValidationError)) throw error;
    }
  }

  return iniciados;
}

export interface RelatorioSolicitacao {
  numero: number;
  criadoPorNome: string;
  criadoEm: string;
  observacao: string | null;
  aprovados: ItemAumentoSalarial[];
  totalItens: number;
  totalReprovados: number;
}

/*
 * Relatório que o próprio solicitante dispara quando a solicitação
 * termina. Duas regras de negócio moram aqui: só o dono da solicitação
 * pede, e só depois que NÃO sobrou nada pendente -- relatório de algo
 * pela metade daria a entender que a direção já bateu o martelo.
 */
export async function montarRelatorioSolicitacao(
  numero: number,
  usuarioId: string
): Promise<RelatorioSolicitacao> {
  const lote = await buscarLotePorNumero(numero);

  if (!lote || lote.criadoPorUsuarioId !== usuarioId) {
    throw new ValidationError("Solicitação não encontrada.");
  }

  if (lote.itens.some((item) => item.status === "pendente")) {
    throw new ValidationError(
      "Esta solicitação ainda tem colaboradores aguardando decisão da direção."
    );
  }

  const aprovados = lote.itens.filter((item) => item.status === "aprovado");

  if (aprovados.length === 0) {
    throw new ValidationError("Nenhum colaborador desta solicitação foi aprovado.");
  }

  return {
    numero: lote.numero,
    criadoPorNome: lote.criadoPorNome,
    criadoEm: lote.criadoEm,
    observacao: lote.observacao,
    aprovados,
    totalItens: lote.itens.length,
    /* Devolvido conta junto: não foi aprovado nesta rodada. */
    totalReprovados: lote.itens.filter((item) => item.status === "reprovado" || item.status === "devolvido").length,
  };
}
