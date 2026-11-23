import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import { montarEmailHtml } from "@/lib/smtp/template-email";

/*
 * Avisos dos Plugins 3DX e limpeza dos registros antigos -- agendador em processo, no padrão dos outros do portal.
 *
 * A cada 2 minutos olha as execuções que terminaram e ainda não foram "tratadas" (notificado_em nulo):
 *  - revisao_trocada: plugin replace-revision em ATIVO que trocou instância ou obsoletou revisão -> e-mail-resumo
 *    para a lista do evento;
 *  - falha: qualquer plugin que terminou em falha/parcial -> e-mail para a lista do evento "falha".
 * Toda execução terminada recebe notificado_em (com ou sem e-mail): é o que impede aviso repetido.
 * Uma vez por dia apaga o que passou do prazo (eventos e execuções ignoradas: 90 dias; o resto: 1 ano).
 */

const INTERVALO_MS = 2 * 60 * 1000;
const LOTE = 50;

declare global {
  var plugins3dxAgendadorIniciado: boolean | undefined;
  var plugins3dxUltimaLimpezaMs: number | undefined;
}

interface ExecucaoParaAviso {
  id: string;
  plugin_chave: string;
  ambiente: string;
  plugin_nome: string;
  modo: string;
  status: string;
  objeto_nome: string | null;
  objeto_revisao: string | null;
  objeto_titulo: string | null;
  ator_login: string | null;
  ator_nome: string | null;
  resumo: string | null;
  erro: string | null;
  finalizado_em: string | null;
}

interface ItemAviso {
  acao: string;
  sucesso: boolean;
  alvo_nome: string | null;
  alvo_revisao: string | null;
  alvo_titulo: string | null;
  alvo_owner: string | null;
  valor_antes: string | null;
  valor_depois: string | null;
  mensagem: string | null;
}

function escaparHtml(texto: string | null | undefined): string {
  return (texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CELULA = "padding: 6px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top;";
const CABECALHO = "text-align: left; padding: 6px 10px; border-bottom: 2px solid #d1d5db;";

function tabela(cabecalhos: string[], linhas: string[][]): string {
  if (linhas.length === 0) return "";
  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 0 0 14px;">
      <thead><tr>${cabecalhos.map((c) => `<th style="${CABECALHO}">${escaparHtml(c)}</th>`).join("")}</tr></thead>
      <tbody>${linhas
        .map((l) => `<tr>${l.map((c) => `<td style="${CELULA}">${c}</td>`).join("")}</tr>`)
        .join("")}</tbody>
    </table>`;
}

function peca(execucao: ExecucaoParaAviso): string {
  return [execucao.objeto_nome, execucao.objeto_revisao ? `rev ${execucao.objeto_revisao}` : null]
    .filter(Boolean)
    .join(" ");
}

async function destinatarios(plugin: string, evento: string, ambiente: string): Promise<string[]> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("plugin", sql.VarChar(40), plugin)
    .input("evento", sql.VarChar(40), evento)
    .input("ambiente", sql.VarChar(10), ambiente)
    .query<{ email: string | null }>(`
      SELECT COALESCE(u.[email], d.[email]) AS [email]
      FROM dbo.portal_3dx_plugins_destinatarios d
      LEFT JOIN dbo.portal_usuarios u ON u.[id] = d.[usuario_id]
      WHERE d.[plugin_chave] = @plugin AND d.[evento] = @evento AND d.[ativo] = 1
        AND (d.[ambiente] IS NULL OR d.[ambiente] = @ambiente)
        AND (d.[usuario_id] IS NULL OR u.[ativo] = 1);
    `);
  const emails = resultado.recordset
    .map((r) => r.email?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e));
  return [...new Set(emails)];
}

async function registrarEnvio(
  execucaoId: string,
  evento: string,
  emails: string[],
  assunto: string,
  erro: string | null
): Promise<void> {
  const pool = await getSqlServerPool();
  for (const email of emails) {
    await pool
      .request()
      .input("execucao", sql.UniqueIdentifier, execucaoId)
      .input("evento", sql.VarChar(40), evento)
      .input("email", sql.NVarChar(320), email)
      .input("assunto", sql.NVarChar(300), assunto.slice(0, 300))
      .input("sucesso", sql.Bit, erro === null)
      .input("erro", sql.NVarChar(500), erro ? erro.slice(0, 500) : null)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_notificacoes
                       WHERE [execucao_id] = @execucao AND [evento] = @evento AND [destinatario_email] = @email)
          INSERT INTO dbo.portal_3dx_plugins_notificacoes ([execucao_id], [evento], [destinatario_email], [assunto], [sucesso], [erro])
          VALUES (@execucao, @evento, @email, @assunto, @sucesso, @erro);
      `);
  }
}

async function enviar(
  execucao: ExecucaoParaAviso,
  evento: string,
  assuntoBase: string,
  conteudoHtml: string
): Promise<void> {
  const emails = await destinatarios(execucao.plugin_chave, evento, execucao.ambiente);
  if (emails.length === 0) return;
  /* Aviso do dev-plm não pode ser confundido com produção. */
  const assunto = execucao.ambiente === "TESTE" ? `[TESTE] ${assuntoBase}` : assuntoBase;
  let erro: string | null = null;
  try {
    await enviarEmail({ destinatario: emails, assunto, corpoHtml: montarEmailHtml(conteudoHtml) });
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro desconhecido";
    console.error(`Erro ao enviar aviso de Plugins 3DX (${evento}):`, e);
  }
  await registrarEnvio(execucao.id, evento, emails, assunto, erro);
}

async function avisoRevisaoTrocada(execucao: ExecucaoParaAviso, itens: ItemAviso[]): Promise<void> {
  const trocas = itens.filter((i) => i.acao === "instancia_substituida");
  const obsoletas = itens.filter((i) => i.acao === "revisao_obsoleta");
  const naoLiberados = itens.filter((i) => i.acao === "pai_nao_liberado");
  if (trocas.length === 0 && obsoletas.length === 0) return;

  const assunto = `3DEXPERIENCE: ${peca(execucao)} liberada — ${trocas.length} conjunto(s) atualizado(s)`;
  const quem = execucao.ator_nome ?? execucao.ator_login ?? "—";
  const html = `
    <p style="margin: 0 0 12px;">A liberação de <strong>${escaparHtml(peca(execucao))}</strong>
      ${execucao.objeto_titulo ? `(${escaparHtml(execucao.objeto_titulo)})` : ""}
      por <strong>${escaparHtml(quem)}</strong> atualizou automaticamente a revisão nos conjuntos liberados.</p>
    ${trocas.length ? `<p style="margin: 0 0 6px;"><strong>Conjuntos atualizados</strong></p>` : ""}
    ${tabela(
      ["Conjunto", "Título", "Responsável", "De", "Para", "Situação"],
      trocas.map((i) => [
        `${escaparHtml(i.alvo_nome)} ${escaparHtml(i.alvo_revisao)}`,
        escaparHtml(i.alvo_titulo),
        escaparHtml(i.alvo_owner),
        escaparHtml(i.valor_antes),
        escaparHtml(i.valor_depois),
        i.sucesso ? "OK" : `<span style="color: #b91c1c;">${escaparHtml(i.mensagem ?? "falha")}</span>`,
      ])
    )}
    ${obsoletas.length ? `<p style="margin: 0 0 6px;"><strong>Revisões que viraram obsoletas</strong></p>` : ""}
    ${tabela(
      ["Peça", "Revisão", "Situação"],
      obsoletas.map((i) => [
        escaparHtml(i.alvo_nome),
        escaparHtml(i.alvo_revisao),
        i.sucesso ? "OBSOLETA" : `<span style="color: #b91c1c;">${escaparHtml(i.mensagem ?? "falha")}</span>`,
      ])
    )}
    ${
      naoLiberados.length
        ? `<p style="margin: 0 0 12px;">${naoLiberados.length} uso(s) da revisão anterior em conjuntos <strong>não liberados</strong>
             ficaram como estavam (o plugin só altera conjuntos liberados).</p>`
        : ""
    }
    <p style="margin: 0; color: #6b7280; font-size: 12px;">Detalhes em Administração → Plugins 3DX → Execuções.</p>`;
  await enviar(execucao, "revisao_trocada", assunto, html);
}

async function avisoFalha(execucao: ExecucaoParaAviso, itens: ItemAviso[]): Promise<void> {
  const falhas = itens.filter((i) => !i.sucesso);
  const assunto = `3DEXPERIENCE: ${execucao.plugin_nome} — ${execucao.status === "falha" ? "falha" : "execução parcial"} em ${
    peca(execucao) || "trabalho"
  }`;
  const html = `
    <p style="margin: 0 0 12px;">O plugin <strong>${escaparHtml(execucao.plugin_nome)}</strong> terminou
      ${execucao.status === "falha" ? "com <strong>falha</strong>" : "<strong>parcialmente</strong>"}
      ${peca(execucao) ? `em <strong>${escaparHtml(peca(execucao))}</strong>` : ""}.</p>
    ${execucao.erro ? `<p style="margin: 0 0 12px;">Erro: ${escaparHtml(execucao.erro)}</p>` : ""}
    ${execucao.resumo ? `<p style="margin: 0 0 12px;">${escaparHtml(execucao.resumo)}</p>` : ""}
    ${tabela(
      ["Objeto", "Ação", "Mensagem"],
      falhas
        .slice(0, 50)
        .map((i) => [
          `${escaparHtml(i.alvo_nome)} ${escaparHtml(i.alvo_revisao)}`,
          escaparHtml(i.acao),
          escaparHtml(i.mensagem),
        ])
    )}
    <p style="margin: 0; color: #6b7280; font-size: 12px;">Detalhes em Administração → Plugins 3DX → Execuções.</p>`;
  await enviar(execucao, "falha", assunto, html);
}

export async function processarAvisos(): Promise<number> {
  const pool = await getSqlServerPool();
  const pendentes = await pool.request().input("lote", sql.Int, LOTE).query<ExecucaoParaAviso>(`
    SELECT TOP (@lote) CONVERT(VARCHAR(36), e.[id]) AS [id], e.[plugin_chave], e.[ambiente], p.[nome] AS [plugin_nome], e.[modo], e.[status],
      e.[objeto_nome], e.[objeto_revisao], e.[objeto_titulo], e.[ator_login], u.[nome_exibicao] AS [ator_nome],
      e.[resumo], e.[erro], CONVERT(VARCHAR(33), e.[finalizado_em], 126) AS [finalizado_em]
    FROM dbo.portal_3dx_plugins_execucoes e
    JOIN dbo.portal_3dx_plugins p ON p.[chave] = e.[plugin_chave]
    LEFT JOIN dbo.portal_usuarios u ON u.[id] = e.[ator_usuario_id]
    WHERE e.[notificado_em] IS NULL AND e.[status] NOT IN ('pendente', 'processando')
    ORDER BY e.[finalizado_em];
  `);

  for (const execucao of pendentes.recordset) {
    try {
      const precisaItens =
        execucao.status === "falha" ||
        execucao.status === "parcial" ||
        (execucao.plugin_chave === "replace-revision" && execucao.modo === "ATIVO");
      const itens = precisaItens
        ? (
            await pool
              .request()
              .input("id", sql.UniqueIdentifier, execucao.id)
              .query<ItemAviso>(`
                SELECT [acao], [sucesso], [alvo_nome], [alvo_revisao], [alvo_titulo], [alvo_owner], [valor_antes],
                  [valor_depois], [mensagem]
                FROM dbo.portal_3dx_plugins_itens WHERE [execucao_id] = @id ORDER BY [ordem];
              `)
          ).recordset
        : [];

      if (
        execucao.plugin_chave === "replace-revision" &&
        execucao.modo === "ATIVO" &&
        (execucao.status === "concluida" || execucao.status === "parcial")
      ) {
        await avisoRevisaoTrocada(execucao, itens);
      }
      if (execucao.status === "falha" || execucao.status === "parcial") {
        await avisoFalha(execucao, itens);
      }
    } catch (erro) {
      console.error("Erro ao preparar aviso de Plugins 3DX:", erro);
    }
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, execucao.id)
      .query("UPDATE dbo.portal_3dx_plugins_execucoes SET [notificado_em] = SYSDATETIME() WHERE [id] = @id;");
  }
  return pendentes.recordset.length;
}

/* Prazo: eventos e execuções ignoradas 90 dias; demais execuções 1 ano. Em lotes, para não travar a tabela. */
export async function limparRegistrosAntigos(): Promise<void> {
  const pool = await getSqlServerPool();
  const comandos = [
    "DELETE TOP (5000) FROM dbo.portal_3dx_plugins_eventos WHERE [criado_em] < DATEADD(DAY, -90, SYSDATETIME());",
    `DELETE TOP (1000) FROM dbo.portal_3dx_plugins_execucoes
       WHERE [status] = 'ignorada' AND [enfileirado_em] < DATEADD(DAY, -90, SYSDATETIME());`,
    `DELETE TOP (1000) FROM dbo.portal_3dx_plugins_execucoes
       WHERE [status] NOT IN ('pendente', 'processando') AND [enfileirado_em] < DATEADD(DAY, -365, SYSDATETIME());`,
  ];
  for (const comando of comandos) {
    for (let rodada = 0; rodada < 50; rodada++) {
      const resultado = await pool.request().query(comando);
      if ((resultado.rowsAffected[0] ?? 0) === 0) break;
    }
  }
}

export function iniciarAgendadorPlugins3dx() {
  if (global.plugins3dxAgendadorIniciado) return;
  global.plugins3dxAgendadorIniciado = true;

  setInterval(() => {
    (async () => {
      await processarAvisos();
      const ultima = global.plugins3dxUltimaLimpezaMs ?? 0;
      if (Date.now() - ultima > 24 * 60 * 60 * 1000) {
        global.plugins3dxUltimaLimpezaMs = Date.now();
        await limparRegistrosAntigos();
      }
    })().catch((erro) => {
      /* Sem a migração 0172 aplicada as tabelas não existem: só registra, não derruba o servidor. */
      console.error("Erro no agendador de Plugins 3DX:", erro);
    });
  }, INTERVALO_MS);
}
