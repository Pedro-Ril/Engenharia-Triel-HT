import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText, requiredUuidArray } from "@/lib/auth/validation";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { nomeEmpresaPedidoCompra } from "../empresas-pedido-compra";
import {
  centroCustoNaSugestaoDoTipo,
  criteriosAlcadaDoTipo,
  ehTipoAprovacao,
  rotuloTipoAprovacao,
  type TipoAprovacao,
} from "../tipos-aprovacao";
import { lerPrefixos } from "./regras";

/*
 * Configuração das alçadas (Administração → Diretoria → Alçadas): cada
 * regra é salva inteira -- empresa/setor, níveis em ordem e as pessoas
 * de cada nível -- e cada mudança vira uma linha legível no histórico.
 *
 * Sugestões de direcionamento vão junto: para um nível a partir do 2º,
 * quem a administração pré-escolhe (por empresa e, no pedido de compra,
 * centro de custo) quando o nível anterior aprova. A pessoa sugerida tem
 * que ser aprovadora daquele nível; sem pessoa = "todos do nível".
 *
 * Nível removido não é apagado: fica inativo, porque etapas antigas
 * (inclusive as que ainda estão na fila) apontam para ele, e as pessoas
 * dele continuam podendo decidir o que já estava lá.
 */

export interface UsuarioNivel {
  id: string;
  nome: string;
}

export interface NivelAlcada {
  id: string;
  ordem: number;
  nome: string;
  usuarios: UsuarioNivel[];
}

export interface SugestaoDirecionamento {
  id: string;
  /* O nível que recebe o direcionamento (2º em diante). */
  nivelId: string;
  empresa: number | null;
  /* Prefixos separados por vírgula ("90.02, 90.90"); null = qualquer centro de custo. */
  centrosCusto: string | null;
  /* null = deixar para todos do nível. */
  usuarioId: string | null;
  usuarioNome: string | null;
}

export interface AlcadaConfig {
  id: string;
  tipo: TipoAprovacao;
  empresa: number | null;
  setor: string | null;
  niveis: NivelAlcada[];
  /* Em ordem de prioridade (empate de especificidade: vale a primeira). */
  sugestoes: SugestaoDirecionamento[];
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export async function listarAlcadas(): Promise<AlcadaConfig[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    alcada_id: string;
    tipo: TipoAprovacao;
    empresa: number | null;
    setor: string | null;
    atualizado_em: string;
    atualizado_por: string | null;
    nivel_id: string | null;
    ordem: number | null;
    nome: string | null;
    usuario_id: string | null;
    usuario_nome: string | null;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), a.[id]) AS [alcada_id], a.[tipo], a.[empresa], a.[setor],
      CONVERT(VARCHAR(33), a.[atualizado_em], 126) AS [atualizado_em], a.[atualizado_por],
      CONVERT(VARCHAR(36), n.[id]) AS [nivel_id], n.[ordem], n.[nome],
      CONVERT(VARCHAR(36), u.[id]) AS [usuario_id], u.[nome_exibicao] AS [usuario_nome]
    FROM dbo.portal_alcadas AS a
    LEFT JOIN dbo.portal_alcadas_niveis AS n ON n.[alcada_id] = a.[id] AND n.[ativo] = 1
    LEFT JOIN dbo.portal_alcadas_niveis_usuarios AS nu ON nu.[nivel_id] = n.[id]
    LEFT JOIN dbo.portal_usuarios AS u ON u.[id] = nu.[usuario_id]
    WHERE a.[ativo] = 1
    ORDER BY a.[tipo], a.[empresa], a.[setor], n.[ordem], u.[nome_exibicao];
  `);

  const alcadas = new Map<string, AlcadaConfig>();

  for (const linha of result.recordset) {
    let alcada = alcadas.get(linha.alcada_id);
    if (!alcada) {
      alcada = {
        id: linha.alcada_id,
        tipo: linha.tipo,
        empresa: linha.empresa,
        setor: linha.setor,
        niveis: [],
        sugestoes: [],
        atualizadoEm: linha.atualizado_em,
        atualizadoPor: linha.atualizado_por,
      };
      alcadas.set(linha.alcada_id, alcada);
    }

    if (!linha.nivel_id || linha.ordem === null || !linha.nome) continue;

    let nivel = alcada.niveis.find((n) => n.id === linha.nivel_id);
    if (!nivel) {
      nivel = { id: linha.nivel_id, ordem: linha.ordem, nome: linha.nome, usuarios: [] };
      alcada.niveis.push(nivel);
    }
    if (linha.usuario_id && linha.usuario_nome) {
      nivel.usuarios.push({ id: linha.usuario_id, nome: linha.usuario_nome });
    }
  }

  /* Só as sugestões de níveis ativos: as de nível removido não valem mais. */
  const sugestoes = await pool.request().query<{
    id: string;
    alcada_id: string;
    nivel_id: string;
    empresa: number | null;
    centros_custo: string | null;
    usuario_id: string | null;
    usuario_nome: string | null;
  }>(`
    SELECT CONVERT(VARCHAR(36), s.[id]) AS [id], CONVERT(VARCHAR(36), s.[alcada_id]) AS [alcada_id],
           CONVERT(VARCHAR(36), s.[nivel_id]) AS [nivel_id], s.[empresa], s.[centros_custo],
           CONVERT(VARCHAR(36), s.[usuario_id]) AS [usuario_id], u.[nome_exibicao] AS [usuario_nome]
    FROM dbo.portal_alcadas_sugestoes AS s
    INNER JOIN dbo.portal_alcadas_niveis AS n ON n.[id] = s.[nivel_id] AND n.[ativo] = 1
    LEFT JOIN dbo.portal_usuarios AS u ON u.[id] = s.[usuario_id]
    ORDER BY s.[ordem];
  `);

  for (const linha of sugestoes.recordset) {
    alcadas.get(linha.alcada_id)?.sugestoes.push({
      id: linha.id,
      nivelId: linha.nivel_id,
      empresa: linha.empresa,
      centrosCusto: linha.centros_custo,
      usuarioId: linha.usuario_id,
      usuarioNome: linha.usuario_nome,
    });
  }

  return [...alcadas.values()];
}

export interface DadosSugestao {
  /* Posição (0 = 1º nível) do nível que recebe o direcionamento, na lista `niveis` enviada. */
  nivelIndice: number;
  empresa: number | null;
  centrosCusto: string | null;
  usuarioId: string | null;
}

export interface DadosAlcada {
  /* Sem id = regra nova. */
  id?: string;
  tipo: string;
  empresa: number | null;
  setor: string | null;
  niveis: { id?: string; nome: string; usuarioIds: string[] }[];
  sugestoes: DadosSugestao[];
}

const MAXIMO_NIVEIS = 10;
const MAXIMO_SUGESTOES = 50;

function lerEmpresa(valor: unknown): number | null {
  return valor === null || valor === undefined || valor === "" ? null : Number(valor);
}

/* Corpo do POST/PUT da administração -- a validação de regra fica em validarDadosAlcada. */
export function lerCorpoAlcada(body: unknown, id?: string): DadosAlcada {
  if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
  if (!Array.isArray(body.niveis)) throw new ValidationError("Informe os níveis da alçada.");
  if (body.sugestoes !== undefined && !Array.isArray(body.sugestoes)) {
    throw new ValidationError("As sugestões de direcionamento são inválidas.");
  }

  return {
    id,
    tipo: requiredText(body.tipo, "tipo", 40),
    empresa: lerEmpresa(body.empresa),
    setor: optionalText(body.setor, "setor", 200),
    niveis: body.niveis.map((nivel, indice) => {
      if (!isObject(nivel) || !Array.isArray(nivel.usuarioIds)) {
        throw new ValidationError(`O nível ${indice + 1} é inválido.`);
      }
      return {
        id: optionalText(nivel.id, "id do nível", 36) ?? undefined,
        nome: typeof nivel.nome === "string" ? nivel.nome : "",
        /* Vazio passa adiante: validarDadosAlcada explica que o nível precisa de aprovador. */
        usuarioIds: nivel.usuarioIds.length
          ? requiredUuidArray(nivel.usuarioIds, `aprovadores do nível ${indice + 1}`)
          : [],
      };
    }),
    sugestoes: ((body.sugestoes as unknown[] | undefined) ?? []).map((sugestao, indice) => {
      if (!isObject(sugestao)) throw new ValidationError(`A sugestão ${indice + 1} é inválida.`);
      const usuarioId = optionalText(sugestao.usuarioId, "pessoa sugerida", 36);
      return {
        nivelIndice: Number(sugestao.nivelIndice),
        empresa: lerEmpresa(sugestao.empresa),
        centrosCusto: optionalText(sugestao.centrosCusto, "centros de custo", 400),
        usuarioId: usuarioId ? requiredUuidArray([usuarioId], "pessoa sugerida")[0] : null,
      };
    }),
  };
}

/* "90.02;90.90 , 91" -> "90.02, 90.90, 91": cada prefixo precisa ter número. */
function normalizarCentrosCusto(valor: string | null, indice: number): string | null {
  const partes = (valor ?? "")
    .split(/[,;]/)
    .map((parte) => parte.trim())
    .filter(Boolean);
  if (partes.length === 0) return null;
  if (partes.some((parte) => lerPrefixos(parte).length === 0)) {
    throw new ValidationError(`Na sugestão ${indice + 1}, informe os centros de custo com números (ex.: 90.02, 90.90).`);
  }
  return partes.join(", ");
}

/* Validação de formato -- exportada para teste (config.test.ts). */
export function validarDadosAlcada(dados: DadosAlcada): DadosAlcada & { tipo: TipoAprovacao } {
  if (!ehTipoAprovacao(dados.tipo)) throw new ValidationError("Tipo de aprovação inválido.");
  const tipo = dados.tipo;

  if (dados.empresa !== null && (!Number.isSafeInteger(dados.empresa) || dados.empresa <= 0)) {
    throw new ValidationError("Empresa inválida.");
  }

  /* Critério que o tipo não carrega nunca casaria: recusa em vez de criar uma regra morta. */
  const criterios = criteriosAlcadaDoTipo(dados.tipo);
  if (dados.empresa !== null && !criterios.includes("empresa")) {
    throw new ValidationError(`${rotuloTipoAprovacao(dados.tipo)} não usa empresa na alçada.`);
  }
  if (dados.setor?.trim() && !criterios.includes("setor")) {
    throw new ValidationError(`${rotuloTipoAprovacao(dados.tipo)} não usa setor na alçada.`);
  }

  const setor = dados.setor?.trim() || null;
  if (setor && setor.length > 200) throw new ValidationError("O setor deve ter no máximo 200 caracteres.");

  if (dados.niveis.length === 0) throw new ValidationError("A alçada precisa de pelo menos um nível.");
  if (dados.niveis.length > MAXIMO_NIVEIS) {
    throw new ValidationError(`A alçada pode ter no máximo ${MAXIMO_NIVEIS} níveis.`);
  }

  const vistos = new Set<string>();

  const niveis = dados.niveis.map((nivel, indice) => {
    const nome = nivel.nome.trim();
    if (!nome) throw new ValidationError(`Dê um nome ao nível ${indice + 1}.`);
    if (nome.length > 100) throw new ValidationError(`O nome do nível ${indice + 1} deve ter no máximo 100 caracteres.`);

    const usuarioIds = [...new Set(nivel.usuarioIds)];
    if (usuarioIds.length === 0) throw new ValidationError(`O nível "${nome}" precisa de pelo menos um aprovador.`);

    /* A mesma pessoa em dois níveis aprovaria duas vezes -- a alçada pede pessoas diferentes. */
    for (const usuarioId of usuarioIds) {
      if (vistos.has(usuarioId)) {
        throw new ValidationError(`Uma mesma pessoa não pode estar em dois níveis (nível "${nome}").`);
      }
      vistos.add(usuarioId);
    }

    return { id: nivel.id, nome, usuarioIds };
  });

  if (dados.sugestoes.length > MAXIMO_SUGESTOES) {
    throw new ValidationError(`A alçada pode ter no máximo ${MAXIMO_SUGESTOES} sugestões de direcionamento.`);
  }

  const combinacoes = new Set<string>();

  const sugestoes = dados.sugestoes.map((sugestao, indice) => {
    const numero = indice + 1;
    const nivel = niveis[sugestao.nivelIndice];

    /* O 1º nível recebe direto no envio -- não há quem direcione para ele. */
    if (!Number.isInteger(sugestao.nivelIndice) || sugestao.nivelIndice < 1 || !nivel) {
      throw new ValidationError(`A sugestão ${numero} precisa apontar para um nível a partir do 2º.`);
    }

    if (sugestao.empresa !== null) {
      if (!Number.isSafeInteger(sugestao.empresa) || sugestao.empresa <= 0) {
        throw new ValidationError(`Empresa inválida na sugestão ${numero}.`);
      }
      if (!criterios.includes("empresa")) {
        throw new ValidationError(`${rotuloTipoAprovacao(tipo)} não usa empresa nas sugestões.`);
      }
      if (dados.empresa !== null && sugestao.empresa !== dados.empresa) {
        throw new ValidationError(
          `A sugestão ${numero} é de outra empresa: esta alçada só vale para a empresa ${dados.empresa}.`
        );
      }
    }

    const centrosCusto = normalizarCentrosCusto(sugestao.centrosCusto, indice);
    if (centrosCusto && !centroCustoNaSugestaoDoTipo(tipo)) {
      throw new ValidationError(`${rotuloTipoAprovacao(tipo)} não tem centro de custo nas sugestões.`);
    }

    if (sugestao.usuarioId && !nivel.usuarioIds.some((id) => id.toUpperCase() === sugestao.usuarioId!.toUpperCase())) {
      throw new ValidationError(`Na sugestão ${numero}, a pessoa tem que ser aprovadora do nível "${nivel.nome}".`);
    }

    const chave = [sugestao.nivelIndice, sugestao.empresa ?? "", lerPrefixos(centrosCusto).sort().join(",")].join("|");
    if (combinacoes.has(chave)) {
      throw new ValidationError(`A sugestão ${numero} repete o nível, a empresa e os centros de custo de outra.`);
    }
    combinacoes.add(chave);

    return { nivelIndice: sugestao.nivelIndice, empresa: sugestao.empresa, centrosCusto, usuarioId: sugestao.usuarioId };
  });

  return { ...dados, tipo: dados.tipo, setor, niveis, sugestoes };
}

function descreverRegra(tipo: TipoAprovacao, empresa: number | null, setor: string | null): string {
  const partes = [
    rotuloTipoAprovacao(tipo),
    empresa !== null ? nomeEmpresaPedidoCompra(empresa) : "todas as empresas",
    setor ? `setor ${setor}` : "todos os setores",
  ];
  return partes.join(" · ");
}

function descreverNiveis(niveis: { nome: string; usuarios: string[] }[]): string {
  return niveis.map((nivel, i) => `${i + 1}. ${nivel.nome} (${nivel.usuarios.join(", ")})`).join("; ");
}

function descreverSugestoes(
  sugestoes: { nivelNome: string; empresa: number | null; centrosCusto: string | null; usuarioNome: string | null }[]
): string {
  if (sugestoes.length === 0) return "nenhuma";
  return sugestoes
    .map((s) => {
      const quando = [
        s.empresa !== null ? nomeEmpresaPedidoCompra(s.empresa) : "qualquer empresa",
        s.centrosCusto ? `centros de custo ${s.centrosCusto}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `${quando} → ${s.nivelNome}: ${s.usuarioNome ?? "todos do nível"}`;
    })
    .join("; ");
}

/*
 * Cria ou atualiza uma regra inteira numa transação. Os níveis que
 * vierem com id são atualizados (nome, ordem, pessoas); os novos são
 * criados; os que sumiram ficam inativos.
 */
export async function salvarAlcada(
  dadosBrutos: DadosAlcada,
  usuario: { id: string; nomeExibicao: string }
): Promise<AlcadaConfig> {
  const dados = validarDadosAlcada(dadosBrutos);
  const pool = await getSqlServerPool();

  /* Só gente ativa do portal entra num nível. */
  const todosIds = [...new Set(dados.niveis.flatMap((nivel) => nivel.usuarioIds))];
  const pedidoUsuarios = pool.request();
  todosIds.forEach((id, i) => pedidoUsuarios.input(`u${i}`, sql.UniqueIdentifier, id));
  const usuarios = await pedidoUsuarios.query<{ id: string; nome: string }>(`
    SELECT CONVERT(VARCHAR(36), [id]) AS [id], [nome_exibicao] AS [nome]
    FROM dbo.portal_usuarios
    WHERE [ativo] = 1 AND [id] IN (${todosIds.map((_, i) => `@u${i}`).join(", ")});
  `);
  const nomePorId = new Map(usuarios.recordset.map((u) => [u.id.toUpperCase(), u.nome]));
  const faltando = todosIds.filter((id) => !nomePorId.has(id.toUpperCase()));
  if (faltando.length > 0) throw new ValidationError("Há aprovador inativo ou inexistente na alçada.");

  const antes = dados.id ? (await listarAlcadas()).find((a) => a.id.toUpperCase() === dados.id!.toUpperCase()) : null;
  if (dados.id && !antes) throw new ValidationError("Alçada não encontrada.");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    let alcadaId = dados.id ?? null;

    if (alcadaId) {
      await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, alcadaId)
        .input("empresa", sql.Int, dados.empresa)
        .input("setor", sql.NVarChar(200), dados.setor)
        .input("por", sql.NVarChar(200), usuario.nomeExibicao)
        .query(`
          UPDATE dbo.portal_alcadas
          SET [empresa] = @empresa, [setor] = @setor, [atualizado_em] = SYSDATETIME(), [atualizado_por] = @por
          WHERE [id] = @id AND [ativo] = 1;
        `);
    } else {
      const criada = await new sql.Request(transaction)
        .input("tipo", sql.VarChar(40), dados.tipo)
        .input("empresa", sql.Int, dados.empresa)
        .input("setor", sql.NVarChar(200), dados.setor)
        .input("por", sql.NVarChar(200), usuario.nomeExibicao)
        .query<{ id: string }>(`
          INSERT INTO dbo.portal_alcadas ([tipo], [empresa], [setor], [criado_por], [atualizado_por])
          OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
          VALUES (@tipo, @empresa, @setor, @por, @por);
        `);
      alcadaId = criada.recordset[0].id;
    }

    /* Níveis que saíram da regra: inativos (as etapas antigas continuam apontando para eles). */
    const mantidos = dados.niveis.filter((n) => n.id).map((n) => n.id!.toUpperCase());
    for (const nivel of antes?.niveis ?? []) {
      if (!mantidos.includes(nivel.id.toUpperCase())) {
        await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, nivel.id)
          .query(`UPDATE dbo.portal_alcadas_niveis SET [ativo] = 0 WHERE [id] = @id;`);
      }
    }

    const nivelIds: string[] = [];

    for (const [indice, nivel] of dados.niveis.entries()) {
      let nivelId = nivel.id ?? null;

      if (nivelId) {
        const atualizado = await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, nivelId)
          .input("alcadaId", sql.UniqueIdentifier, alcadaId)
          .input("ordem", sql.Int, indice + 1)
          .input("nome", sql.NVarChar(100), nivel.nome)
          .query(`
            UPDATE dbo.portal_alcadas_niveis SET [ordem] = @ordem, [nome] = @nome
            WHERE [id] = @id AND [alcada_id] = @alcadaId AND [ativo] = 1;
          `);
        if ((atualizado.rowsAffected[0] ?? 0) === 0) throw new ValidationError("Nível não encontrado nesta alçada.");
      } else {
        const criado = await new sql.Request(transaction)
          .input("alcadaId", sql.UniqueIdentifier, alcadaId)
          .input("ordem", sql.Int, indice + 1)
          .input("nome", sql.NVarChar(100), nivel.nome)
          .query<{ id: string }>(`
            INSERT INTO dbo.portal_alcadas_niveis ([alcada_id], [ordem], [nome])
            OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
            VALUES (@alcadaId, @ordem, @nome);
          `);
        nivelId = criado.recordset[0].id;
      }

      nivelIds.push(nivelId!);

      await new sql.Request(transaction)
        .input("nivelId", sql.UniqueIdentifier, nivelId)
        .query(`DELETE FROM dbo.portal_alcadas_niveis_usuarios WHERE [nivel_id] = @nivelId;`);

      for (const usuarioId of nivel.usuarioIds) {
        await new sql.Request(transaction)
          .input("nivelId", sql.UniqueIdentifier, nivelId)
          .input("usuarioId", sql.UniqueIdentifier, usuarioId)
          .query(`INSERT INTO dbo.portal_alcadas_niveis_usuarios ([nivel_id], [usuario_id]) VALUES (@nivelId, @usuarioId);`);
      }
    }

    /* Sugestões: a lista inteira é trocada (a ordem é a prioridade). */
    await new sql.Request(transaction)
      .input("alcadaId", sql.UniqueIdentifier, alcadaId)
      .query(`DELETE FROM dbo.portal_alcadas_sugestoes WHERE [alcada_id] = @alcadaId;`);

    for (const [indice, sugestao] of dados.sugestoes.entries()) {
      await new sql.Request(transaction)
        .input("alcadaId", sql.UniqueIdentifier, alcadaId)
        .input("nivelId", sql.UniqueIdentifier, nivelIds[sugestao.nivelIndice])
        .input("empresa", sql.Int, sugestao.empresa)
        .input("centrosCusto", sql.NVarChar(400), sugestao.centrosCusto)
        .input("usuarioId", sql.UniqueIdentifier, sugestao.usuarioId)
        .input("ordem", sql.Int, indice + 1)
        .query(`
          INSERT INTO dbo.portal_alcadas_sugestoes ([alcada_id], [nivel_id], [empresa], [centros_custo], [usuario_id], [ordem])
          VALUES (@alcadaId, @nivelId, @empresa, @centrosCusto, @usuarioId, @ordem);
        `);
    }

    const depois = dados.niveis.map((nivel) => ({
      nome: nivel.nome,
      usuarios: nivel.usuarioIds.map((id) => nomePorId.get(id.toUpperCase()) ?? id),
    }));
    const regra = descreverRegra(dados.tipo, dados.empresa, dados.setor);
    const niveisAgora = descreverNiveis(depois);
    const sugestoesAgora = descreverSugestoes(
      dados.sugestoes.map((s) => ({
        ...s,
        nivelNome: dados.niveis[s.nivelIndice].nome,
        usuarioNome: s.usuarioId ? (nomePorId.get(s.usuarioId.toUpperCase()) ?? s.usuarioId) : null,
      }))
    );

    let descricao = `Alçada criada (${regra}): ${niveisAgora}.${dados.sugestoes.length ? ` Sugestões: ${sugestoesAgora}.` : ""}`;

    if (antes) {
      const niveisAntes = descreverNiveis(antes.niveis.map((n) => ({ nome: n.nome, usuarios: n.usuarios.map((u) => u.nome) })));
      const sugestoesAntes = descreverSugestoes(
        antes.sugestoes.map((s) => ({
          ...s,
          nivelNome: antes.niveis.find((n) => n.id.toUpperCase() === s.nivelId.toUpperCase())?.nome ?? "?",
        }))
      );
      /* Só entra no histórico o que mudou: níveis, sugestões ou os dois. */
      const mudancas = [
        niveisAntes !== niveisAgora ? `Níveis antes: ${niveisAntes}. Agora: ${niveisAgora}.` : null,
        sugestoesAntes !== sugestoesAgora ? `Sugestões antes: ${sugestoesAntes}. Agora: ${sugestoesAgora}.` : null,
      ].filter(Boolean);
      descricao = `Alçada alterada (${regra}). ${mudancas.length ? mudancas.join(" ") : "Sem mudança nos níveis nem nas sugestões."}`;
    }

    await registrarHistoricoConfig(transaction, {
      alcadaId,
      tipo: dados.tipo,
      descricao,
      usuario,
    });

    await transaction.commit();

    return (await listarAlcadas()).find((a) => a.id.toUpperCase() === alcadaId!.toUpperCase())!;
  } catch (error) {
    await transaction.rollback().catch(() => {});

    const numero = (error as { number?: number })?.number;
    if (numero === 2601 || numero === 2627) {
      throw new ValidationError("Já existe uma alçada para essa combinação de tipo, empresa e setor.");
    }
    throw error;
  }
}

/* Remove a regra (inativa). O que já está na fila continua com a cadeia que tinha. */
export async function excluirAlcada(id: string, usuario: { id: string; nomeExibicao: string }): Promise<void> {
  const alcada = (await listarAlcadas()).find((a) => a.id.toUpperCase() === id.toUpperCase());
  if (!alcada) throw new ValidationError("Alçada não encontrada.");

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("por", sql.NVarChar(200), usuario.nomeExibicao)
      .query(`
        UPDATE dbo.portal_alcadas SET [ativo] = 0, [atualizado_em] = SYSDATETIME(), [atualizado_por] = @por
        WHERE [id] = @id;
      `);

    await registrarHistoricoConfig(transaction, {
      alcadaId: id,
      tipo: alcada.tipo,
      descricao: `Alçada removida (${descreverRegra(alcada.tipo, alcada.empresa, alcada.setor)}).`,
      usuario,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

async function registrarHistoricoConfig(
  transaction: sql.Transaction,
  params: { alcadaId: string | null; tipo: TipoAprovacao; descricao: string; usuario: { id: string; nomeExibicao: string } }
): Promise<void> {
  await new sql.Request(transaction)
    .input("alcadaId", sql.UniqueIdentifier, params.alcadaId)
    .input("tipo", sql.VarChar(40), params.tipo)
    .input("descricao", sql.NVarChar(4000), params.descricao.slice(0, 4000))
    .input("usuarioId", sql.UniqueIdentifier, params.usuario.id)
    .input("usuarioNome", sql.NVarChar(200), params.usuario.nomeExibicao)
    .query(`
      INSERT INTO dbo.portal_alcadas_historico ([alcada_id], [tipo], [descricao], [usuario_id], [usuario_nome])
      VALUES (@alcadaId, @tipo, @descricao, @usuarioId, @usuarioNome);
    `);
}

export interface HistoricoConfigAlcada {
  tipo: TipoAprovacao;
  descricao: string;
  usuarioNome: string | null;
  criadoEm: string;
}

export async function listarHistoricoAlcadas(limite = 100): Promise<HistoricoConfigAlcada[]> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("limite", sql.Int, limite)
    .query<{ tipo: TipoAprovacao; descricao: string; usuario_nome: string | null; criado_em: string }>(`
      SELECT TOP (@limite) [tipo], [descricao], [usuario_nome], CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
      FROM dbo.portal_alcadas_historico
      ORDER BY [criado_em] DESC;
    `);
  return result.recordset.map((linha) => ({
    tipo: linha.tipo,
    descricao: linha.descricao,
    usuarioNome: linha.usuario_nome,
    criadoEm: linha.criado_em,
  }));
}

/* Setores que já apareceram em reajustes -- sugestões no campo setor da alçada (o campo aceita digitar outro). */
export async function listarSetoresConhecidos(): Promise<string[]> {
  const pool = await getSqlServerPool();
  const result = await pool.request().query<{ setor: string }>(`
    SELECT DISTINCT LTRIM(RTRIM([setor])) AS [setor]
    FROM dbo.portal_aprovacoes_aumento_salarial
    WHERE [setor] IS NOT NULL AND LTRIM(RTRIM([setor])) <> ''
    ORDER BY 1;
  `);
  return result.recordset.map((linha) => linha.setor);
}
