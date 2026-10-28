import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { TipoAprovacao } from "../tipos-aprovacao";
import {
  escolherAlcada,
  escolherSugestao,
  etapasIniciais,
  transicionar,
  type AcaoEtapa,
  type ContextoAlcada,
  type ContextoSugestao,
  type StatusEtapa,
} from "./regras";

/*
 * Motor das alçadas: a cadeia de cada item e quem decide cada etapa.
 * Os módulos (reajuste, pedido de compra) chamam iniciarFluxo no envio
 * e decidirEtapa na decisão, DENTRO da transação deles -- a etapa e o
 * status do item mudam juntos ou não mudam.
 */

type Executor = sql.Transaction | sql.ConnectionPool;

/*
 * A etapa `alias` está aberta para @usuarioId: não foi direcionada, foi
 * direcionada a ele, ou foi direcionada a alguém que não pode mais
 * decidir (saiu do nível ou foi desativado) -- aí volta para todos.
 * A pertença ao nível é conferida à parte, por quem usa.
 */
function sqlEtapaAbertaPara(alias: string): string {
  return `(
    ${alias}.[direcionado_usuario_id] IS NULL
    OR ${alias}.[direcionado_usuario_id] = @usuarioId
    OR NOT EXISTS (
      SELECT 1
      FROM dbo.portal_alcadas_niveis_usuarios AS nd
      INNER JOIN dbo.portal_usuarios AS ud ON ud.[id] = nd.[usuario_id] AND ud.[ativo] = 1
      WHERE nd.[nivel_id] = ${alias}.[nivel_id] AND nd.[usuario_id] = ${alias}.[direcionado_usuario_id]
    )
  )`;
}

function requisicao(executor: Executor): sql.Request {
  return new sql.Request(executor as sql.Transaction);
}

interface NivelResolvido {
  id: string;
  ordem: number;
  nome: string;
  usuarios: number;
}

export interface AlcadaResolvida {
  id: string;
  empresa: number | null;
  setor: string | null;
  niveis: NivelResolvido[];
}

/* A alçada que vale para a solicitação, com os níveis ativos em ordem. */
export async function resolverAlcada(
  executor: Executor,
  tipo: TipoAprovacao,
  contexto: ContextoAlcada
): Promise<AlcadaResolvida | null> {
  const result = await requisicao(executor)
    .input("tipo", sql.VarChar(40), tipo)
    .query<{
      alcada_id: string;
      empresa: number | null;
      setor: string | null;
      nivel_id: string | null;
      ordem: number | null;
      nome: string | null;
      usuarios: number | null;
    }>(`
      SELECT
        CONVERT(VARCHAR(36), a.[id]) AS [alcada_id],
        a.[empresa],
        a.[setor],
        CONVERT(VARCHAR(36), n.[id]) AS [nivel_id],
        n.[ordem],
        n.[nome],
        (SELECT COUNT(*) FROM dbo.portal_alcadas_niveis_usuarios AS nu
         INNER JOIN dbo.portal_usuarios AS u ON u.[id] = nu.[usuario_id] AND u.[ativo] = 1
         WHERE nu.[nivel_id] = n.[id]) AS [usuarios]
      FROM dbo.portal_alcadas AS a
      LEFT JOIN dbo.portal_alcadas_niveis AS n ON n.[alcada_id] = a.[id] AND n.[ativo] = 1
      WHERE a.[tipo] = @tipo AND a.[ativo] = 1
      ORDER BY a.[id], n.[ordem];
    `);

  const porAlcada = new Map<string, AlcadaResolvida>();
  for (const linha of result.recordset) {
    const alcada =
      porAlcada.get(linha.alcada_id) ??
      ({ id: linha.alcada_id, empresa: linha.empresa, setor: linha.setor, niveis: [] } as AlcadaResolvida);
    if (linha.nivel_id && linha.ordem !== null && linha.nome) {
      alcada.niveis.push({ id: linha.nivel_id, ordem: linha.ordem, nome: linha.nome, usuarios: linha.usuarios ?? 0 });
    }
    porAlcada.set(linha.alcada_id, alcada);
  }

  return escolherAlcada([...porAlcada.values()], contexto);
}

function descreverContexto(contexto: ContextoAlcada, nomeEmpresa?: (codigo: number) => string): string {
  const partes = [
    contexto.empresa !== null ? (nomeEmpresa ? nomeEmpresa(contexto.empresa) : `empresa ${contexto.empresa}`) : null,
    contexto.setor ? `setor ${contexto.setor}` : null,
  ].filter(Boolean);
  return partes.length ? ` (${partes.join(", ")})` : "";
}

/*
 * Abre a cadeia de um item: no envio (ciclo 1) ou no reenvio depois de
 * uma devolução (ciclo seguinte, de novo do nível 1). Recusa quando não
 * há alçada para a solicitação ou quando algum nível está sem ninguém
 * -- senão o item ficaria parado num nível que ninguém decide.
 */
export async function iniciarFluxo(
  executor: Executor,
  params: {
    tipo: TipoAprovacao;
    itemId: string;
    contexto: ContextoAlcada;
    usuario: { id: string | null; nome: string };
    comentario?: string | null;
    nomeEmpresa?: (codigo: number) => string;
    /* Quando o envio aconteceu antes de entrar na alçada: o histórico mostra a data real (ISO). */
    enviadoEm?: string | null;
  }
): Promise<{ ciclo: number; niveis: { ordem: number; nome: string }[] }> {
  const alcada = await resolverAlcada(executor, params.tipo, params.contexto);
  const onde = descreverContexto(params.contexto, params.nomeEmpresa);

  if (!alcada || alcada.niveis.length === 0) {
    throw new ValidationError(`Não há alçada de aprovação configurada para esta solicitação${onde}.`);
  }

  const vazio = alcada.niveis.find((nivel) => nivel.usuarios === 0);
  if (vazio) {
    throw new ValidationError(`O nível "${vazio.nome}" da alçada${onde} está sem aprovadores.`);
  }

  const cicloAtual = await requisicao(executor)
    .input("itemId", sql.UniqueIdentifier, params.itemId)
    .query<{ ciclo: number | null }>(`
      SELECT MAX([ciclo]) AS [ciclo] FROM dbo.portal_aprovacoes_etapas WITH (UPDLOCK, HOLDLOCK)
      WHERE [item_id] = @itemId;
    `);
  const ciclo = (cicloAtual.recordset[0]?.ciclo ?? 0) + 1;

  for (const etapa of etapasIniciais(alcada.niveis)) {
    await requisicao(executor)
      .input("tipo", sql.VarChar(40), params.tipo)
      .input("itemId", sql.UniqueIdentifier, params.itemId)
      .input("ciclo", sql.Int, ciclo)
      .input("ordem", sql.Int, etapa.ordem)
      .input("nivelId", sql.UniqueIdentifier, etapa.id)
      .input("nivelNome", sql.NVarChar(100), etapa.nome)
      .input("status", sql.VarChar(20), etapa.status)
      .query(`
        INSERT INTO dbo.portal_aprovacoes_etapas
          ([tipo], [item_id], [ciclo], [ordem], [nivel_id], [nivel_nome], [status])
        VALUES (@tipo, @itemId, @ciclo, @ordem, @nivelId, @nivelNome, @status);
      `);
  }

  await registrarHistorico(executor, {
    tipo: params.tipo,
    itemId: params.itemId,
    acao: ciclo === 1 ? "enviado" : "reenviado",
    ciclo,
    usuarioId: params.usuario.id,
    usuarioNome: params.usuario.nome,
    comentario: params.comentario ?? null,
    criadoEm: params.enviadoEm ?? null,
  });

  return { ciclo, niveis: alcada.niveis.map(({ ordem, nome }) => ({ ordem, nome })) };
}

export interface ResultadoEtapa {
  resultado: "avancou" | "aprovado" | "devolvido";
  ciclo: number;
  nivelNome: string;
  ordem: number;
  proximoNivel: string | null;
  /* Nome de quem vai decidir o próximo nível, quando direcionado. */
  direcionadoPara: string | null;
}

/*
 * Decide a etapa pendente do item. Só quem está no nível da vez pode;
 * se o item não está pendente, já andou (outra pessoa do nível decidiu
 * antes) ou a pessoa não é do nível, recusa com mensagem clara.
 */
export async function decidirEtapa(
  executor: Executor,
  params: {
    tipo: TipoAprovacao;
    itemId: string;
    usuario: { id: string; nome: string };
    acao: AcaoEtapa;
    comentario: string | null;
    /*
     * Só ao aprovar com próximo nível: a pessoa desse nível que vai
     * decidir (só ela vê). null/undefined = deixa para todos do nível.
     */
    direcionarPara?: string | null;
  }
): Promise<ResultadoEtapa> {
  const etapas = await requisicao(executor)
    .input("itemId", sql.UniqueIdentifier, params.itemId)
    .input("tipo", sql.VarChar(40), params.tipo)
    .query<{
      id: string;
      ordem: number;
      status: StatusEtapa;
      ciclo: number;
      nivel_id: string;
      nivel_nome: string;
      direcionado_usuario_id: string | null;
    }>(`
      SELECT CONVERT(VARCHAR(36), e.[id]) AS [id], e.[ordem], e.[status], e.[ciclo],
             CONVERT(VARCHAR(36), e.[nivel_id]) AS [nivel_id], e.[nivel_nome],
             CONVERT(VARCHAR(36), e.[direcionado_usuario_id]) AS [direcionado_usuario_id]
      FROM dbo.portal_aprovacoes_etapas AS e WITH (UPDLOCK, HOLDLOCK)
      WHERE e.[item_id] = @itemId AND e.[tipo] = @tipo
        AND e.[ciclo] = (SELECT MAX([ciclo]) FROM dbo.portal_aprovacoes_etapas WHERE [item_id] = @itemId);
    `);

  const transicao = transicionar(etapas.recordset, params.acao);
  if (!transicao) {
    throw new ValidationError("Esta solicitação não está aguardando decisão.");
  }

  const decidida = etapas.recordset.find((etapa) => etapa.id === transicao.decidida.id)!;

  const doNivel = await requisicao(executor)
    .input("nivelId", sql.UniqueIdentifier, decidida.nivel_id)
    .input("usuarioId", sql.UniqueIdentifier, params.usuario.id)
    .input("etapaId", sql.UniqueIdentifier, decidida.id)
    .query<{ aberta: number }>(`
      SELECT CASE WHEN ${sqlEtapaAbertaPara("e")} THEN 1 ELSE 0 END AS [aberta]
      FROM dbo.portal_alcadas_niveis_usuarios AS nu
      INNER JOIN dbo.portal_aprovacoes_etapas AS e ON e.[id] = @etapaId
      WHERE nu.[nivel_id] = @nivelId AND nu.[usuario_id] = @usuarioId;
    `);

  if (doNivel.recordset.length === 0) {
    throw new ValidationError(`Esta solicitação está no nível "${decidida.nivel_nome}", do qual você não faz parte.`);
  }
  if (doNivel.recordset[0].aberta !== 1) {
    throw new ValidationError("Esta solicitação foi direcionada a outra pessoa do seu nível.");
  }

  /* Direcionamento: só faz sentido aprovando, com próximo nível, para alguém DESSE nível. */
  const proximaEtapa = transicao.proxima
    ? etapas.recordset.find((etapa) => etapa.id === transicao.proxima!.id) ?? null
    : null;
  let direcionado: { id: string; nome: string } | null = null;

  if (params.direcionarPara) {
    if (params.acao !== "aprovar" || !proximaEtapa) {
      throw new ValidationError("Só dá para direcionar ao aprovar, quando existe um próximo nível.");
    }

    const escolhido = await requisicao(executor)
      .input("nivelId", sql.UniqueIdentifier, proximaEtapa.nivel_id)
      .input("direcionadoId", sql.UniqueIdentifier, params.direcionarPara)
      .query<{ id: string; nome: string }>(`
        SELECT CONVERT(VARCHAR(36), u.[id]) AS [id], u.[nome_exibicao] AS [nome]
        FROM dbo.portal_alcadas_niveis_usuarios AS nu
        INNER JOIN dbo.portal_usuarios AS u ON u.[id] = nu.[usuario_id] AND u.[ativo] = 1
        WHERE nu.[nivel_id] = @nivelId AND nu.[usuario_id] = @direcionadoId;
      `);

    if (!escolhido.recordset[0]) {
      throw new ValidationError(`Só dá para direcionar para alguém do nível "${proximaEtapa.nivel_nome}".`);
    }
    direcionado = escolhido.recordset[0];
  }

  for (const mudanca of transicao.mudancas) {
    const ehDecidida = mudanca.id === decidida.id;
    await requisicao(executor)
      .input("id", sql.UniqueIdentifier, mudanca.id)
      .input("status", sql.VarChar(20), mudanca.status)
      .input("ehDecidida", sql.Bit, ehDecidida)
      .input("usuarioId", sql.UniqueIdentifier, params.usuario.id)
      .input("usuarioNome", sql.NVarChar(200), params.usuario.nome)
      .input("comentario", sql.NVarChar(2000), params.comentario)
      .query(`
        UPDATE dbo.portal_aprovacoes_etapas
        SET [status] = @status,
            [decidido_por_usuario_id] = CASE WHEN @ehDecidida = 1 THEN @usuarioId ELSE [decidido_por_usuario_id] END,
            [decidido_por_nome] = CASE WHEN @ehDecidida = 1 THEN @usuarioNome ELSE [decidido_por_nome] END,
            [decidido_em] = CASE WHEN @ehDecidida = 1 THEN SYSDATETIME() ELSE [decidido_em] END,
            [comentario] = CASE WHEN @ehDecidida = 1 THEN @comentario ELSE [comentario] END
        WHERE [id] = @id;
      `);
  }

  const base = {
    tipo: params.tipo,
    itemId: params.itemId,
    ciclo: decidida.ciclo,
    nivelOrdem: decidida.ordem,
    nivelNome: decidida.nivel_nome,
    usuarioId: params.usuario.id,
    usuarioNome: params.usuario.nome,
    comentario: params.comentario,
  };

  if (transicao.resultado === "devolvido") {
    await registrarHistorico(executor, { ...base, acao: "devolvido" });
  } else {
    await registrarHistorico(executor, { ...base, acao: "aprovado_nivel" });
    if (transicao.resultado === "aprovado") {
      await registrarHistorico(executor, { ...base, acao: "aprovado", comentario: null });
    }
  }

  if (direcionado && proximaEtapa) {
    await requisicao(executor)
      .input("id", sql.UniqueIdentifier, proximaEtapa.id)
      .input("direcionadoId", sql.UniqueIdentifier, direcionado.id)
      .input("direcionadoNome", sql.NVarChar(200), direcionado.nome)
      .query(`
        UPDATE dbo.portal_aprovacoes_etapas
        SET [direcionado_usuario_id] = @direcionadoId, [direcionado_nome] = @direcionadoNome
        WHERE [id] = @id;
      `);

    await registrarHistorico(executor, {
      ...base,
      acao: "direcionado",
      nivelOrdem: proximaEtapa.ordem,
      nivelNome: proximaEtapa.nivel_nome,
      comentario: `Direcionado para ${direcionado.nome}`,
    });
  }

  const proxima = transicao.proxima
    ? etapas.recordset.find((etapa) => etapa.id === transicao.proxima!.id)?.nivel_nome ?? null
    : null;

  return {
    resultado: transicao.resultado,
    ciclo: decidida.ciclo,
    nivelNome: decidida.nivel_nome,
    ordem: decidida.ordem,
    proximoNivel: proxima,
    direcionadoPara: direcionado?.nome ?? null,
  };
}

export type AcaoHistorico = "enviado" | "reenviado" | "aprovado_nivel" | "aprovado" | "devolvido" | "direcionado";

async function registrarHistorico(
  executor: Executor,
  params: {
    tipo: TipoAprovacao;
    itemId: string;
    acao: AcaoHistorico;
    ciclo: number | null;
    nivelOrdem?: number | null;
    nivelNome?: string | null;
    usuarioId: string | null;
    usuarioNome: string | null;
    comentario: string | null;
    /* NULL = agora. */
    criadoEm?: string | null;
  }
): Promise<void> {
  await requisicao(executor)
    .input("tipo", sql.VarChar(40), params.tipo)
    .input("itemId", sql.UniqueIdentifier, params.itemId)
    .input("acao", sql.VarChar(30), params.acao)
    .input("ciclo", sql.Int, params.ciclo)
    .input("nivelOrdem", sql.Int, params.nivelOrdem ?? null)
    .input("nivelNome", sql.NVarChar(100), params.nivelNome ?? null)
    .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
    .input("usuarioNome", sql.NVarChar(200), params.usuarioNome)
    .input("comentario", sql.NVarChar(2000), params.comentario)
    .input("criadoEm", sql.VarChar(33), params.criadoEm ?? null)
    .query(`
      INSERT INTO dbo.portal_aprovacoes_historico
        ([tipo], [item_id], [acao], [ciclo], [nivel_ordem], [nivel_nome], [usuario_id], [usuario_nome], [comentario], [criado_em])
      VALUES (@tipo, @itemId, @acao, @ciclo, @nivelOrdem, @nivelNome, @usuarioId, @usuarioNome, @comentario,
              COALESCE(CONVERT(DATETIME2, @criadoEm, 126), SYSDATETIME()));
    `);
}

/* ---------------------------------------------------------------
   Consultas para os painéis
   --------------------------------------------------------------- */

/*
 * Fragmentos SQL para as listas dos módulos. Esperam o parâmetro
 * @usuarioId na requisição e recebem a coluna do id do item.
 */

/* O item está no nível do usuário agora (é a vez dele decidir). */
export function sqlNaVezDoUsuario(colunaItemId: string): string {
  return `
    EXISTS (
      SELECT 1
      FROM dbo.portal_aprovacoes_etapas AS ev
      INNER JOIN dbo.portal_alcadas_niveis_usuarios AS nv ON nv.[nivel_id] = ev.[nivel_id]
      WHERE ev.[item_id] = ${colunaItemId} AND ev.[status] = 'pendente' AND nv.[usuario_id] = @usuarioId
        AND ${sqlEtapaAbertaPara("ev")}
    )`;
}

/*
 * A cadeia do item JÁ CHEGOU ao nível do usuário (é a vez dele, ou o
 * nível dele já decidiu) -- para o histórico. Nível que ainda está
 * "aguardando" (os de baixo não aprovaram) ou que foi "encerrado" sem
 * ter sido alcançado não vê o item: ninguém enxerga a solicitação
 * antes da hora.
 */
export function sqlParticipaDaCadeia(colunaItemId: string): string {
  return `
    EXISTS (
      SELECT 1
      FROM dbo.portal_aprovacoes_etapas AS ep
      INNER JOIN dbo.portal_alcadas_niveis_usuarios AS np ON np.[nivel_id] = ep.[nivel_id]
      WHERE ep.[item_id] = ${colunaItemId} AND np.[usuario_id] = @usuarioId
        AND ep.[status] IN ('pendente', 'aprovado', 'devolvido')
        AND ${sqlEtapaAbertaPara("ep")}
    )`;
}

/*
 * Colunas nivel_ordem / nivel_nome / nivel_total / nivel_direcionado:
 * em que nível o item (e para quem foi direcionado, se foi)
 * pendente está, e quantos níveis tem a cadeia atual. NULL quando não
 * há etapa pendente (decidido, devolvido, ou de antes das alçadas).
 */
export function sqlColunasNivelAtual(colunaItemId: string): string {
  return `
    (SELECT TOP 1 et.[ordem] FROM dbo.portal_aprovacoes_etapas AS et
     WHERE et.[item_id] = ${colunaItemId} AND et.[status] = 'pendente') AS [nivel_ordem],
    (SELECT TOP 1 et.[nivel_nome] FROM dbo.portal_aprovacoes_etapas AS et
     WHERE et.[item_id] = ${colunaItemId} AND et.[status] = 'pendente') AS [nivel_nome],
    (SELECT TOP 1 et.[direcionado_nome] FROM dbo.portal_aprovacoes_etapas AS et
     WHERE et.[item_id] = ${colunaItemId} AND et.[status] = 'pendente') AS [nivel_direcionado],
    (SELECT COUNT(*) FROM dbo.portal_aprovacoes_etapas AS et
     WHERE et.[item_id] = ${colunaItemId}
       AND et.[ciclo] = (SELECT MAX(ec.[ciclo]) FROM dbo.portal_aprovacoes_etapas AS ec WHERE ec.[item_id] = ${colunaItemId})) AS [nivel_total]`;
}

/* O item ainda não tem cadeia (entrou antes das alçadas). */
export function sqlSemCadeia(colunaItemId: string): string {
  return `NOT EXISTS (SELECT 1 FROM dbo.portal_aprovacoes_etapas AS es WHERE es.[item_id] = ${colunaItemId})`;
}

/*
 * E-mails de quem pode decidir agora (o nível pendente) os itens dados
 * -- para o aviso de "chegou a sua vez". Só gente ativa com e-mail.
 */
export async function listarEmailsDaVez(itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const pool = await getSqlServerPool();
  const request = pool.request();
  itemIds.forEach((id, i) => request.input(`i${i}`, sql.UniqueIdentifier, id));

  const result = await request.query<{ email: string }>(`
    SELECT DISTINCT u.[email]
    FROM dbo.portal_aprovacoes_etapas AS e
    INNER JOIN dbo.portal_alcadas_niveis_usuarios AS nu ON nu.[nivel_id] = e.[nivel_id]
    INNER JOIN dbo.portal_usuarios AS u ON u.[id] = nu.[usuario_id] AND u.[ativo] = 1
    WHERE e.[status] = 'pendente' AND u.[email] IS NOT NULL
      AND e.[item_id] IN (${itemIds.map((_, i) => `@i${i}`).join(", ")})
      AND (
        e.[direcionado_usuario_id] IS NULL
        OR e.[direcionado_usuario_id] = u.[id]
        OR NOT EXISTS (
          SELECT 1 FROM dbo.portal_alcadas_niveis_usuarios AS nd
          INNER JOIN dbo.portal_usuarios AS ud ON ud.[id] = nd.[usuario_id] AND ud.[ativo] = 1
          WHERE nd.[nivel_id] = e.[nivel_id] AND nd.[usuario_id] = e.[direcionado_usuario_id]
        )
      );
  `);
  return result.recordset.map((linha) => linha.email);
}

export interface PessoaDoNivel {
  id: string;
  nome: string;
}

export interface DirecionamentoDaVez {
  itemId: string;
  /* O nível que vem depois do nível do usuário. */
  proximoNivel: string;
  /* Quem pode receber o direcionamento: as pessoas ativas desse nível. */
  opcoes: PessoaDoNivel[];
  /* A pessoa que a regra da administração pré-escolhe; null = todos do nível. */
  sugestao: PessoaDoNivel | null;
}

/*
 * Para os itens que estão na vez do usuário E têm um nível depois do
 * dele: as pessoas desse próximo nível e a sugestão das regras da
 * alçada (empresa / centro de custo dos itens). Item no último nível,
 * ou fora da vez do usuário, não entra -- não há o que direcionar.
 *
 * `contextos` vem do módulo (o que ele sabe da solicitação), pelo id
 * do item em maiúsculas. `executor` só para o teste de integração (que
 * roda numa transação desfeita no fim).
 */
export async function buscarDirecionamentosDaVez(
  params: {
    usuarioId: string;
    contextos: Map<string, ContextoSugestao>;
  },
  executor?: Executor
): Promise<DirecionamentoDaVez[]> {
  const itemIds = [...params.contextos.keys()];
  if (itemIds.length === 0) return [];

  const conexao = executor ?? (await getSqlServerPool());
  const pedido = requisicao(conexao).input("usuarioId", sql.UniqueIdentifier, params.usuarioId);
  itemIds.forEach((id, i) => pedido.input(`i${i}`, sql.UniqueIdentifier, id));

  const proximos = await pedido.query<{ item_id: string; nivel_id: string; nivel_nome: string }>(`
    SELECT CONVERT(VARCHAR(36), ev.[item_id]) AS [item_id],
           CONVERT(VARCHAR(36), px.[nivel_id]) AS [nivel_id], px.[nivel_nome]
    FROM dbo.portal_aprovacoes_etapas AS ev
    INNER JOIN dbo.portal_alcadas_niveis_usuarios AS nv ON nv.[nivel_id] = ev.[nivel_id] AND nv.[usuario_id] = @usuarioId
    CROSS APPLY (
      SELECT TOP 1 ex.[nivel_id], ex.[nivel_nome]
      FROM dbo.portal_aprovacoes_etapas AS ex
      WHERE ex.[item_id] = ev.[item_id] AND ex.[ciclo] = ev.[ciclo] AND ex.[status] = 'aguardando' AND ex.[ordem] > ev.[ordem]
      ORDER BY ex.[ordem]
    ) AS px
    WHERE ev.[status] = 'pendente'
      AND ev.[item_id] IN (${itemIds.map((_, i) => `@i${i}`).join(", ")})
      AND ${sqlEtapaAbertaPara("ev")};
  `);

  if (proximos.recordset.length === 0) return [];

  const nivelIds = [...new Set(proximos.recordset.map((linha) => linha.nivel_id))];
  const listaNiveis = nivelIds.map((_, i) => `@n${i}`).join(", ");
  const porNivel = () => {
    const request = requisicao(conexao);
    nivelIds.forEach((id, i) => request.input(`n${i}`, sql.UniqueIdentifier, id));
    return request;
  };

  /* Uma depois da outra: numa transação, a conexão é uma só. */
  const pessoas = await porNivel().query<{ nivel_id: string; id: string; nome: string }>(`
    SELECT CONVERT(VARCHAR(36), nu.[nivel_id]) AS [nivel_id], CONVERT(VARCHAR(36), u.[id]) AS [id],
           u.[nome_exibicao] AS [nome]
    FROM dbo.portal_alcadas_niveis_usuarios AS nu
    INNER JOIN dbo.portal_usuarios AS u ON u.[id] = nu.[usuario_id] AND u.[ativo] = 1
    WHERE nu.[nivel_id] IN (${listaNiveis})
    ORDER BY u.[nome_exibicao];
  `);
  const regras = await porNivel().query<{
    id: string;
    nivel_id: string;
    empresa: number | null;
    centros_custo: string | null;
    usuario_id: string | null;
    ordem: number;
  }>(`
    SELECT CONVERT(VARCHAR(36), s.[id]) AS [id], CONVERT(VARCHAR(36), s.[nivel_id]) AS [nivel_id],
           s.[empresa], s.[centros_custo], CONVERT(VARCHAR(36), s.[usuario_id]) AS [usuario_id], s.[ordem]
    FROM dbo.portal_alcadas_sugestoes AS s
    INNER JOIN dbo.portal_alcadas AS a ON a.[id] = s.[alcada_id] AND a.[ativo] = 1
    WHERE s.[nivel_id] IN (${listaNiveis});
  `);

  return proximos.recordset.map((linha) => {
    const opcoes = pessoas.recordset
      .filter((pessoa) => pessoa.nivel_id === linha.nivel_id)
      .map(({ id, nome }) => ({ id, nome }));
    const regra = escolherSugestao(
      regras.recordset
        .filter((r) => r.nivel_id === linha.nivel_id)
        .map((r) => ({ id: r.id, empresa: r.empresa, centrosCusto: r.centros_custo, usuarioId: r.usuario_id, ordem: r.ordem })),
      params.contextos.get(linha.item_id) ?? { empresa: null, centrosCustoItens: [] }
    );

    return {
      itemId: linha.item_id,
      proximoNivel: linha.nivel_nome,
      opcoes,
      /* Sugerida que saiu do nível (ou foi desativada): fica "todos". */
      sugestao: opcoes.find((pessoa) => pessoa.id === regra?.usuarioId) ?? null,
    };
  });
}

/* Tipos em que o usuário está em algum nível de alçada ativa -- as abas do painel. */
export async function listarTiposDasAlcadasDoUsuario(usuarioId: string): Promise<string[]> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("usuarioId", sql.UniqueIdentifier, usuarioId)
    .query<{ tipo: string }>(`
      SELECT DISTINCT a.[tipo]
      FROM dbo.portal_alcadas AS a
      INNER JOIN dbo.portal_alcadas_niveis AS n ON n.[alcada_id] = a.[id] AND n.[ativo] = 1
      INNER JOIN dbo.portal_alcadas_niveis_usuarios AS nu ON nu.[nivel_id] = n.[id]
      WHERE a.[ativo] = 1 AND nu.[usuario_id] = @usuarioId;
    `);
  return result.recordset.map((linha) => linha.tipo);
}

export interface EtapaDoItem {
  ciclo: number;
  ordem: number;
  nivelNome: string;
  status: StatusEtapa;
  decididoPor: string | null;
  decididoEm: string | null;
  comentario: string | null;
  /* Quem pode decidir este nível agora (nomes). */
  aprovadores: string[];
  /* Direcionado a uma pessoa do nível (só ela decide). */
  direcionadoPara: string | null;
}

export interface EventoHistorico {
  acao: AcaoHistorico;
  ciclo: number | null;
  nivelNome: string | null;
  usuarioNome: string | null;
  comentario: string | null;
  criadoEm: string;
}

/* A cadeia do ciclo atual e o histórico completo do item -- para o detalhe. */
export async function buscarFluxoDoItem(
  itemId: string
): Promise<{ etapas: EtapaDoItem[]; historico: EventoHistorico[] }> {
  const pool = await getSqlServerPool();

  const [etapas, historico] = await Promise.all([
    pool
      .request()
      .input("itemId", sql.UniqueIdentifier, itemId)
      .query<{
        ciclo: number;
        ordem: number;
        nivel_nome: string;
        status: StatusEtapa;
        decidido_por_nome: string | null;
        decidido_em: string | null;
        comentario: string | null;
        aprovadores: string | null;
        direcionado_nome: string | null;
      }>(`
        SELECT e.[ciclo], e.[ordem], e.[nivel_nome], e.[status], e.[decidido_por_nome],
               CONVERT(VARCHAR(33), e.[decidido_em], 126) AS [decidido_em], e.[comentario], e.[direcionado_nome],
               (SELECT STRING_AGG(u.[nome_exibicao], N', ') WITHIN GROUP (ORDER BY u.[nome_exibicao])
                FROM dbo.portal_alcadas_niveis_usuarios AS nu
                INNER JOIN dbo.portal_usuarios AS u ON u.[id] = nu.[usuario_id] AND u.[ativo] = 1
                WHERE nu.[nivel_id] = e.[nivel_id]) AS [aprovadores]
        FROM dbo.portal_aprovacoes_etapas AS e
        WHERE e.[item_id] = @itemId
          AND e.[ciclo] = (SELECT MAX([ciclo]) FROM dbo.portal_aprovacoes_etapas WHERE [item_id] = @itemId)
        ORDER BY e.[ordem];
      `),
    pool
      .request()
      .input("itemId", sql.UniqueIdentifier, itemId)
      .query<{
        acao: AcaoHistorico;
        ciclo: number | null;
        nivel_nome: string | null;
        usuario_nome: string | null;
        comentario: string | null;
        criado_em: string;
      }>(`
        SELECT [acao], [ciclo], [nivel_nome], [usuario_nome], [comentario],
               CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
        FROM dbo.portal_aprovacoes_historico
        WHERE [item_id] = @itemId
        ORDER BY [criado_em], [id];
      `),
  ]);

  return {
    etapas: etapas.recordset.map((linha) => ({
      ciclo: linha.ciclo,
      ordem: linha.ordem,
      nivelNome: linha.nivel_nome,
      status: linha.status,
      decididoPor: linha.decidido_por_nome,
      decididoEm: linha.decidido_em,
      comentario: linha.comentario,
      aprovadores: linha.aprovadores ? linha.aprovadores.split(", ") : [],
      direcionadoPara: linha.direcionado_nome,
    })),
    historico: historico.recordset.map((linha) => ({
      acao: linha.acao,
      ciclo: linha.ciclo,
      nivelNome: linha.nivel_nome,
      usuarioNome: linha.usuario_nome,
      comentario: linha.comentario,
      criadoEm: linha.criado_em,
    })),
  };
}
