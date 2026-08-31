import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface GradeTv {
  id: string;
  nome: string;
  ativa: boolean;
  criadoPor: string | null;
  criadoEm: string;
}

export interface ItemSlotTv {
  id: string;
  tipoConteudo: "video" | "foto" | "documento" | "pagina_web";
  midiaId: string | null;
  urlPaginaWeb: string | null;
  duracaoSegundos: number;
  ordem: number;
  /*
   * Agendamento próprio do item, opcional — "todos"/00:00-23:59
   * (padrão) significa "sem restrição além da janela do próprio
   * slot"; um item pode ser restringido a dias/horários específicos
   * DENTRO da janela do slot (ex: slot "Manhã 08h-12h" com um item
   * que só aparece às terças). Mesma codificação de diasSemana do
   * slot (ver SlotTv).
   */
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
}

export interface SlotTv {
  id: string;
  nome: string | null;
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  ordem: number;
  itens: ItemSlotTv[];
}

export interface GradeComSlots extends GradeTv {
  slots: SlotTv[];
}

export async function listarGrades(): Promise<GradeTv[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    id: string;
    nome: string;
    ativa: boolean;
    criado_por: string | null;
    criado_em: string;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [nome],
      CAST([ativa] AS BIT) AS [ativa],
      [criado_por],
      CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
    FROM dbo.portal_tv_grades
    ORDER BY [nome];
  `);

  return result.recordset.map((row) => ({
    id: row.id,
    nome: row.nome,
    ativa: row.ativa,
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
  }));
}

export async function criarGrade(params: {
  nome: string;
  criadoPor: string;
}): Promise<GradeTv> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("nome", sql.NVarChar(150), params.nome);
  request.input("criadoPor", sql.NVarChar(150), params.criadoPor);

  const result = await request.query<{
    id: string;
    nome: string;
    ativa: boolean;
    criado_por: string | null;
    criado_em: string;
  }>(`
    INSERT INTO dbo.portal_tv_grades ([nome], [criado_por])
    OUTPUT
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[nome],
      CAST(INSERTED.[ativa] AS BIT) AS [ativa],
      INSERTED.[criado_por],
      CONVERT(VARCHAR(33), INSERTED.[criado_em], 126) AS [criado_em]
    VALUES (@nome, @criadoPor);
  `);

  const row = result.recordset[0];
  return {
    id: row.id,
    nome: row.nome,
    ativa: row.ativa,
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
  };
}

export async function atualizarGrade(
  id: string,
  params: { nome: string; ativa: boolean }
): Promise<GradeTv | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);
  request.input("nome", sql.NVarChar(150), params.nome);
  request.input("ativa", sql.Bit, params.ativa);

  const result = await request.query<{
    id: string;
    nome: string;
    ativa: boolean;
    criado_por: string | null;
    criado_em: string;
  }>(`
    UPDATE dbo.portal_tv_grades
    SET [nome] = @nome, [ativa] = @ativa, [atualizado_em] = SYSDATETIME()
    OUTPUT
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[nome],
      CAST(INSERTED.[ativa] AS BIT) AS [ativa],
      INSERTED.[criado_por],
      CONVERT(VARCHAR(33), INSERTED.[criado_em], 126) AS [criado_em]
    WHERE [id] = @id;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    id: row.id,
    nome: row.nome,
    ativa: row.ativa,
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
  };
}

/*
 * Exclusão real. Terminais que apontavam pra essa grade ficam sem
 * grade atribuída (portal_tv_terminais.grade_id tem ON DELETE SET
 * NULL) em vez de travar a exclusão — o admin decide reatribuir
 * depois.
 */
export async function excluirGrade(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    DELETE FROM dbo.portal_tv_grades WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function buscarGradeComSlots(id: string): Promise<GradeComSlots | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const gradeResult = await request.query<{
    id: string;
    nome: string;
    ativa: boolean;
    criado_por: string | null;
    criado_em: string;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [nome],
      CAST([ativa] AS BIT) AS [ativa],
      [criado_por],
      CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
    FROM dbo.portal_tv_grades
    WHERE [id] = @id;
  `);

  const grade = gradeResult.recordset[0];
  if (!grade) return null;

  const slotsRequest = pool.request();
  slotsRequest.input("gradeId", sql.UniqueIdentifier, id);

  const slotsResult = await slotsRequest.query<{
    id: string;
    nome: string | null;
    dias_semana: string;
    hora_inicio: string;
    hora_fim: string;
    ordem: number;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [nome],
      [dias_semana],
      CONVERT(VARCHAR(8), [hora_inicio], 108) AS [hora_inicio],
      CONVERT(VARCHAR(8), [hora_fim], 108) AS [hora_fim],
      [ordem]
    FROM dbo.portal_tv_grade_slots
    WHERE [grade_id] = @gradeId
    ORDER BY [ordem];
  `);

  const itensRequest = pool.request();
  itensRequest.input("gradeId", sql.UniqueIdentifier, id);

  const itensResult = await itensRequest.query<{
    id: string;
    slot_id: string;
    tipo_conteudo: string;
    midia_id: string | null;
    url_pagina_web: string | null;
    duracao_segundos: number;
    ordem: number;
    dias_semana: string;
    hora_inicio: string;
    hora_fim: string;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), i.[id]) AS [id],
      CONVERT(VARCHAR(36), i.[slot_id]) AS [slot_id],
      i.[tipo_conteudo],
      CONVERT(VARCHAR(36), i.[midia_id]) AS [midia_id],
      i.[url_pagina_web],
      i.[duracao_segundos],
      i.[ordem],
      i.[dias_semana],
      CONVERT(VARCHAR(8), i.[hora_inicio], 108) AS [hora_inicio],
      CONVERT(VARCHAR(8), i.[hora_fim], 108) AS [hora_fim]
    FROM dbo.portal_tv_slot_itens i
    INNER JOIN dbo.portal_tv_grade_slots s ON s.[id] = i.[slot_id]
    WHERE s.[grade_id] = @gradeId
    ORDER BY i.[ordem];
  `);

  const itensPorSlot = new Map<string, ItemSlotTv[]>();
  for (const item of itensResult.recordset) {
    const lista = itensPorSlot.get(item.slot_id) ?? [];
    lista.push({
      id: item.id,
      tipoConteudo: item.tipo_conteudo as ItemSlotTv["tipoConteudo"],
      midiaId: item.midia_id,
      urlPaginaWeb: item.url_pagina_web,
      duracaoSegundos: item.duracao_segundos,
      ordem: item.ordem,
      diasSemana: item.dias_semana,
      horaInicio: item.hora_inicio,
      horaFim: item.hora_fim,
    });
    itensPorSlot.set(item.slot_id, lista);
  }

  return {
    id: grade.id,
    nome: grade.nome,
    ativa: grade.ativa,
    criadoPor: grade.criado_por,
    criadoEm: grade.criado_em,
    slots: slotsResult.recordset.map((slot) => ({
      id: slot.id,
      nome: slot.nome,
      diasSemana: slot.dias_semana,
      horaInicio: slot.hora_inicio,
      horaFim: slot.hora_fim,
      ordem: slot.ordem,
      itens: itensPorSlot.get(slot.id) ?? [],
    })),
  };
}

/*
 * Substitui todos os slots (e seus itens) de uma grade de uma vez —
 * mesmo padrão de sincronizarSetoresDoModulo em src/lib/auth/admin.ts:
 * apaga tudo que já existia e recria do zero dentro de uma transação,
 * em vez de tentar diferenciar o que mudou. Mais simples de raciocinar
 * pra um formulário que edita a grade inteira de uma vez.
 */
export async function salvarSlotsDaGrade(
  gradeId: string,
  slots: {
    nome: string | null;
    diasSemana: string;
    horaInicio: string;
    horaFim: string;
    ordem: number;
    itens: {
      tipoConteudo: ItemSlotTv["tipoConteudo"];
      midiaId: string | null;
      urlPaginaWeb: string | null;
      duracaoSegundos: number;
      ordem: number;
      diasSemana: string;
      horaInicio: string;
      horaFim: string;
    }[];
  }[]
): Promise<void> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const deleteRequest = new sql.Request(transaction);
    deleteRequest.input("gradeId", sql.UniqueIdentifier, gradeId);
    await deleteRequest.query(`
      DELETE FROM dbo.portal_tv_grade_slots WHERE [grade_id] = @gradeId;
    `);

    for (const slot of slots) {
      const slotRequest = new sql.Request(transaction);
      slotRequest.input("gradeId", sql.UniqueIdentifier, gradeId);
      slotRequest.input("nome", sql.NVarChar(100), slot.nome);
      slotRequest.input("diasSemana", sql.VarChar(20), slot.diasSemana);
      slotRequest.input("horaInicio", sql.VarChar(8), slot.horaInicio);
      slotRequest.input("horaFim", sql.VarChar(8), slot.horaFim);
      slotRequest.input("ordem", sql.Int, slot.ordem);

      const slotResult = await slotRequest.query<{ id: string }>(`
        INSERT INTO dbo.portal_tv_grade_slots
          ([grade_id], [nome], [dias_semana], [hora_inicio], [hora_fim], [ordem])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        VALUES (@gradeId, @nome, @diasSemana, @horaInicio, @horaFim, @ordem);
      `);

      const slotId = slotResult.recordset[0].id;

      for (const item of slot.itens) {
        const itemRequest = new sql.Request(transaction);
        itemRequest.input("slotId", sql.UniqueIdentifier, slotId);
        itemRequest.input("tipoConteudo", sql.VarChar(20), item.tipoConteudo);
        itemRequest.input("midiaId", sql.UniqueIdentifier, item.midiaId);
        itemRequest.input("urlPaginaWeb", sql.NVarChar(500), item.urlPaginaWeb);
        itemRequest.input("duracaoSegundos", sql.Int, item.duracaoSegundos);
        itemRequest.input("ordem", sql.Int, item.ordem);
        itemRequest.input("diasSemana", sql.VarChar(20), item.diasSemana);
        itemRequest.input("horaInicio", sql.VarChar(8), item.horaInicio);
        itemRequest.input("horaFim", sql.VarChar(8), item.horaFim);

        await itemRequest.query(`
          INSERT INTO dbo.portal_tv_slot_itens
            ([slot_id], [tipo_conteudo], [midia_id], [url_pagina_web], [duracao_segundos], [ordem],
             [dias_semana], [hora_inicio], [hora_fim])
          VALUES (@slotId, @tipoConteudo, @midiaId, @urlPaginaWeb, @duracaoSegundos, @ordem,
                  @diasSemana, @horaInicio, @horaFim);
        `);
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

function diaDaSemanaAtual(): number {
  /* SQL Server-style não é usado aqui — calcula no Node mesmo (0=domingo...6=sábado). */
  return new Date().getDay();
}

/*
 * Mesma checagem de janela dia/horário usada tanto pra escolher o
 * slot vigente de uma grade quanto, dentro dele, filtrar os itens que
 * têm um agendamento próprio mais restrito (ver ItemSlotTv).
 */
function estaNaJanela(
  diasSemana: string,
  horaInicio: string,
  horaFim: string,
  diaAtual: number,
  horaAtual: string
): boolean {
  const diaBate =
    diasSemana === "todos" || diasSemana.split(",").map(Number).includes(diaAtual);

  if (!diaBate) return false;

  return horaAtual >= horaInicio && horaAtual < horaFim;
}

export interface SlotVigenteParaTerminal {
  slotId: string;
  itens: {
    id: string;
    tipoConteudo: ItemSlotTv["tipoConteudo"];
    duracaoSegundos: number;
    urlPaginaWeb: string | null;
    midia: { id: string; url: string; tipoMime: string } | null;
  }[];
}

/*
 * Calcula qual slot vale "agora" pra grade atribuída a um terminal —
 * chamado pela rota que o terminal consulta em polling. Desempate por
 * `ordem` quando mais de um slot bate no mesmo horário.
 */
export async function buscarSlotVigente(
  gradeId: string
): Promise<SlotVigenteParaTerminal | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("gradeId", sql.UniqueIdentifier, gradeId);

  const slotsResult = await request.query<{
    id: string;
    dias_semana: string;
    hora_inicio: string;
    hora_fim: string;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [dias_semana],
      CONVERT(VARCHAR(8), [hora_inicio], 108) AS [hora_inicio],
      CONVERT(VARCHAR(8), [hora_fim], 108) AS [hora_fim]
    FROM dbo.portal_tv_grade_slots
    WHERE [grade_id] = @gradeId
    ORDER BY [ordem];
  `);

  const agora = new Date();
  const diaAtual = diaDaSemanaAtual();
  const horaAtual = agora.toTimeString().slice(0, 8);

  const slotVigente = slotsResult.recordset.find((slot) =>
    estaNaJanela(slot.dias_semana, slot.hora_inicio, slot.hora_fim, diaAtual, horaAtual)
  );

  if (!slotVigente) return null;

  const itensRequest = pool.request();
  itensRequest.input("slotId", sql.UniqueIdentifier, slotVigente.id);

  const itensResult = await itensRequest.query<{
    id: string;
    tipo_conteudo: string;
    duracao_segundos: number;
    url_pagina_web: string | null;
    midia_id: string | null;
    midia_caminho: string | null;
    midia_tipo_mime: string | null;
    dias_semana: string;
    hora_inicio: string;
    hora_fim: string;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), i.[id]) AS [id],
      i.[tipo_conteudo],
      i.[duracao_segundos],
      i.[url_pagina_web],
      CONVERT(VARCHAR(36), i.[midia_id]) AS [midia_id],
      m.[caminho_arquivo] AS [midia_caminho],
      m.[tipo_mime] AS [midia_tipo_mime],
      i.[dias_semana],
      CONVERT(VARCHAR(8), i.[hora_inicio], 108) AS [hora_inicio],
      CONVERT(VARCHAR(8), i.[hora_fim], 108) AS [hora_fim]
    FROM dbo.portal_tv_slot_itens i
    LEFT JOIN dbo.portal_tv_midias m ON m.[id] = i.[midia_id]
    WHERE i.[slot_id] = @slotId
    ORDER BY i.[ordem];
  `);

  return {
    slotId: slotVigente.id,
    itens: itensResult.recordset
      .filter((item) =>
        estaNaJanela(item.dias_semana, item.hora_inicio, item.hora_fim, diaAtual, horaAtual)
      )
      .map((item) => ({
        id: item.id,
        tipoConteudo: item.tipo_conteudo as ItemSlotTv["tipoConteudo"],
        duracaoSegundos: item.duracao_segundos,
        urlPaginaWeb: item.url_pagina_web,
        midia: item.midia_id
          ? {
              id: item.midia_id,
              url: `/api/tv/midias/${item.midia_id}/arquivo`,
              tipoMime: item.midia_tipo_mime ?? "application/octet-stream",
            }
          : null,
      })),
  };
}
