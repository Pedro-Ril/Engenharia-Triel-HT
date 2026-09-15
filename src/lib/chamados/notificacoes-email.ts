import "server-only";

import type { Request as SqlRequest } from "mssql";

import { buscarUsuarioPorId } from "@/lib/auth/usuarios";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import { montarBotaoEmailHtml, montarEmailHtml, montarLinkEmailHtml } from "@/lib/smtp/template-email";

import { listarCopiaDoChamado } from "./chamados";

export type EventoNotificacaoChamado =
  | "aberto"
  | "aceito"
  | "nova_resposta"
  | "resolvido_pendente"
  | "reaberto"
  | "fechado"
  /* Endereçado ao ATENDENTE (não ao solicitante) -- disparado quando quem escreve não é atendente (solicitante ou usuário em cópia). Ver notificarAtendenteChamado. */
  | "nova_mensagem_solicitante";

export interface NotificacaoEmailChamado {
  id: string;
  chamadoNumero: number;
  chamadoTitulo: string;
  evento: EventoNotificacaoChamado;
  destinatarioEmail: string;
  destinatarioNome: string | null;
  assunto: string;
  sucesso: boolean;
  erroMensagem: string | null;
  enviadoEm: string;
}

export interface FiltrosNotificacoesEmailChamados {
  chamadoNumero?: number;
  evento?: EventoNotificacaoChamado;
  sucesso?: boolean;
  pagina: number;
  porPagina: number;
}

interface ChamadoParaNotificar {
  id: string;
  numero: number;
  titulo: string;
  solicitanteNome: string;
  solicitanteContato: string | null;
  solicitanteUsuarioId: string | null;
}

interface NotificarSolicitanteParams {
  chamado: ChamadoParaNotificar;
  evento: EventoNotificacaoChamado;
  origem: string;
  autorNome?: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function construirLink(chamado: ChamadoParaNotificar, origem: string): string {
  const base = `${origem}/chamados/${chamado.numero}`;
  return chamado.solicitanteUsuarioId
    ? base
    : `${base}?nome=${encodeURIComponent(chamado.solicitanteNome)}`;
}

interface ConteudoEmail {
  assunto: string;
  corpoHtml: string;
  corpoTexto: string;
}

/* Só os 6 eventos endereçados ao solicitante -- "nova_mensagem_solicitante" (endereçado ao atendente) tem sua própria montagem de conteúdo, em notificarAtendenteChamado. */
type EventoParaSolicitante = Exclude<EventoNotificacaoChamado, "nova_mensagem_solicitante">;

function montarConteudo(
  evento: EventoParaSolicitante,
  chamado: ChamadoParaNotificar,
  autorNome: string | null | undefined,
  link: string
): ConteudoEmail {
  const referencia = `#${chamado.numero} — ${chamado.titulo}`;
  const botaoTexto = "Ver chamado";

  switch (evento) {
    case "aberto":
      return {
        assunto: `Chamado #${chamado.numero} aberto — Portal Triel-HT`,
        corpoHtml: montarEmailHtml(`
          <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${chamado.solicitanteNome}</strong>!</p>
          <p style="margin: 0 0 18px;">
            Recebemos seu chamado <strong>${referencia}</strong> e nossa equipe vai analisar em breve.
          </p>
          ${montarBotaoEmailHtml(botaoTexto, link)}
          ${montarLinkEmailHtml(link)}
          <p style="margin: 0; font-size: 13px; color: #6b7280;">
            Você será notificado por e-mail a cada atualização deste chamado.
          </p>
        `),
        corpoTexto: `Olá, ${chamado.solicitanteNome}!\n\nRecebemos seu chamado ${referencia} e nossa equipe vai analisar em breve.\n\n${link}\n\nVocê será notificado por e-mail a cada atualização deste chamado.`,
      };

    case "aceito":
      return {
        assunto: `Chamado #${chamado.numero} em atendimento — Portal Triel-HT`,
        corpoHtml: montarEmailHtml(`
          <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${chamado.solicitanteNome}</strong>!</p>
          <p style="margin: 0 0 18px;">
            <strong>${autorNome}</strong> assumiu o atendimento do seu chamado <strong>${referencia}</strong>.
          </p>
          ${montarBotaoEmailHtml(botaoTexto, link)}
          ${montarLinkEmailHtml(link)}
        `),
        corpoTexto: `Olá, ${chamado.solicitanteNome}!\n\n${autorNome} assumiu o atendimento do seu chamado ${referencia}.\n\n${link}`,
      };

    case "nova_resposta":
      return {
        assunto: `Nova resposta no chamado #${chamado.numero} — Portal Triel-HT`,
        corpoHtml: montarEmailHtml(`
          <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${chamado.solicitanteNome}</strong>!</p>
          <p style="margin: 0 0 18px;">
            <strong>${autorNome}</strong> respondeu ao seu chamado <strong>${referencia}</strong>.
          </p>
          ${montarBotaoEmailHtml("Ver resposta", link)}
          ${montarLinkEmailHtml(link)}
        `),
        corpoTexto: `Olá, ${chamado.solicitanteNome}!\n\n${autorNome} respondeu ao seu chamado ${referencia}.\n\n${link}`,
      };

    case "resolvido_pendente":
      return {
        assunto: `Chamado #${chamado.numero} marcado como resolvido — confirme — Portal Triel-HT`,
        corpoHtml: montarEmailHtml(`
          <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${chamado.solicitanteNome}</strong>!</p>
          <p style="margin: 0 0 18px;">
            <strong>${autorNome}</strong> marcou seu chamado <strong>${referencia}</strong> como resolvido.
          </p>
          <p style="margin: 0 0 18px;">
            Se o problema realmente foi resolvido, confirme no link abaixo. Caso contrário, você pode reabrir o chamado.
          </p>
          ${montarBotaoEmailHtml("Confirmar ou reabrir", link)}
          ${montarLinkEmailHtml(link)}
        `),
        corpoTexto: `Olá, ${chamado.solicitanteNome}!\n\n${autorNome} marcou seu chamado ${referencia} como resolvido.\n\nSe o problema realmente foi resolvido, confirme no link abaixo. Caso contrário, você pode reabrir o chamado.\n\n${link}`,
      };

    case "reaberto":
      return {
        assunto: `Chamado #${chamado.numero} reaberto — Portal Triel-HT`,
        corpoHtml: montarEmailHtml(`
          <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${chamado.solicitanteNome}</strong>!</p>
          <p style="margin: 0 0 18px;">
            <strong>${autorNome}</strong> reabriu seu chamado <strong>${referencia}</strong>. O atendimento continua.
          </p>
          ${montarBotaoEmailHtml(botaoTexto, link)}
          ${montarLinkEmailHtml(link)}
        `),
        corpoTexto: `Olá, ${chamado.solicitanteNome}!\n\n${autorNome} reabriu seu chamado ${referencia}. O atendimento continua.\n\n${link}`,
      };

    case "fechado":
      return {
        assunto: `Chamado #${chamado.numero} encerrado — Portal Triel-HT`,
        corpoHtml: montarEmailHtml(`
          <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${chamado.solicitanteNome}</strong>!</p>
          <p style="margin: 0 0 18px;">
            Seu chamado <strong>${referencia}</strong> foi encerrado por <strong>${autorNome}</strong>.
          </p>
          <p style="margin: 0 0 18px; font-size: 13px; color: #6b7280;">
            Se precisar, você pode reabri-lo a partir do link abaixo.
          </p>
          ${montarBotaoEmailHtml(botaoTexto, link)}
          ${montarLinkEmailHtml(link)}
        `),
        corpoTexto: `Olá, ${chamado.solicitanteNome}!\n\nSeu chamado ${referencia} foi encerrado por ${autorNome}.\n\nSe precisar, você pode reabri-lo a partir do link abaixo.\n\n${link}`,
      };
  }
}

/* Mesma mensagem de "nova_resposta", mas endereçada a quem acompanha em cópia (não é "seu chamado", é o chamado que essa pessoa acompanha). */
function montarConteudoParaCopia(
  destinatarioNome: string,
  chamado: ChamadoParaNotificar,
  autorNome: string | null | undefined,
  link: string
): ConteudoEmail {
  const referencia = `#${chamado.numero} — ${chamado.titulo}`;

  return {
    assunto: `Nova resposta no chamado ${referencia} — Portal Triel-HT`,
    corpoHtml: montarEmailHtml(`
      <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${destinatarioNome}</strong>!</p>
      <p style="margin: 0 0 18px;">
        <strong>${autorNome}</strong> respondeu ao chamado <strong>${referencia}</strong>, que você acompanha em cópia.
      </p>
      ${montarBotaoEmailHtml("Ver resposta", link)}
      ${montarLinkEmailHtml(link)}
    `),
    corpoTexto: `Olá, ${destinatarioNome}!\n\n${autorNome} respondeu ao chamado ${referencia}, que você acompanha em cópia.\n\n${link}`,
  };
}

async function registrarNotificacaoEmail(params: {
  chamadoNumero: number;
  chamadoTitulo: string;
  evento: EventoNotificacaoChamado;
  destinatarioEmail: string;
  destinatarioNome: string | null;
  assunto: string;
  sucesso: boolean;
  erroMensagem: string | null;
}): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("chamadoNumero", sql.Int, params.chamadoNumero);
    request.input("chamadoTitulo", sql.NVarChar(200), params.chamadoTitulo);
    request.input("evento", sql.VarChar(30), params.evento);
    request.input("destinatarioEmail", sql.NVarChar(320), params.destinatarioEmail);
    request.input("destinatarioNome", sql.NVarChar(200), params.destinatarioNome);
    request.input("assunto", sql.NVarChar(300), params.assunto);
    request.input("sucesso", sql.Bit, params.sucesso);
    request.input("erroMensagem", sql.NVarChar(500), params.erroMensagem);

    await request.query(`
      INSERT INTO dbo.portal_chamados_notificacoes_email
        ([chamado_numero], [chamado_titulo], [evento], [destinatario_email], [destinatario_nome], [assunto], [sucesso], [erro_mensagem])
      VALUES
        (@chamadoNumero, @chamadoTitulo, @evento, @destinatarioEmail, @destinatarioNome, @assunto, @sucesso, @erroMensagem);
    `);
  } catch (error) {
    console.error("Erro ao registrar log de notificação por e-mail de chamado:", error);
  }
}

/*
 * Núcleo genérico de envio -- nunca lança (mutação no chamado já foi
 * commitada antes desta função ser chamada, uma falha de e-mail não
 * pode derrubar a resposta da rota) e sempre registra a tentativa,
 * sucesso ou falha, em portal_chamados_notificacoes_email.
 */
async function enviarNotificacaoUnica(params: {
  chamadoNumero: number;
  chamadoTitulo: string;
  evento: EventoNotificacaoChamado;
  destinatarioEmail: string;
  destinatarioNome: string | null;
  assunto: string;
  corpoHtml: string;
  corpoTexto: string;
}): Promise<void> {
  try {
    await enviarEmail({
      destinatario: params.destinatarioEmail,
      assunto: params.assunto,
      corpoHtml: params.corpoHtml,
      corpoTexto: params.corpoTexto,
    });
    await registrarNotificacaoEmail({
      chamadoNumero: params.chamadoNumero,
      chamadoTitulo: params.chamadoTitulo,
      evento: params.evento,
      destinatarioEmail: params.destinatarioEmail,
      destinatarioNome: params.destinatarioNome,
      assunto: params.assunto,
      sucesso: true,
      erroMensagem: null,
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido.";
    await registrarNotificacaoEmail({
      chamadoNumero: params.chamadoNumero,
      chamadoTitulo: params.chamadoTitulo,
      evento: params.evento,
      destinatarioEmail: params.destinatarioEmail,
      destinatarioNome: params.destinatarioNome,
      assunto: params.assunto,
      sucesso: false,
      erroMensagem: mensagem.slice(0, 500),
    });
  }
}

/*
 * Endereço de contato que não parece um e-mail (solicitante_contato é
 * texto livre, pode ser telefone) é pulado silenciosamente, sem gerar
 * linha de log — a tabela representa tentativas reais de envio, não
 * todo evento do ciclo de vida.
 *
 * CC (ver adicionarUsuarioCopia) só recebe nas iterações
 * ("nova_resposta") -- não no restante do ciclo de vida do chamado.
 */
export async function notificarSolicitanteChamado(params: NotificarSolicitanteParams): Promise<void> {
  const { chamado, evento, origem, autorNome } = params;
  const destinatario = chamado.solicitanteContato?.trim() ?? "";
  const link = construirLink(chamado, origem);

  if (EMAIL_REGEX.test(destinatario)) {
    const conteudo = montarConteudo(evento as EventoParaSolicitante, chamado, autorNome, link);

    await enviarNotificacaoUnica({
      chamadoNumero: chamado.numero,
      chamadoTitulo: chamado.titulo,
      evento,
      destinatarioEmail: destinatario,
      destinatarioNome: chamado.solicitanteNome,
      ...conteudo,
    });
  }

  if (evento === "nova_resposta") {
    const copia = await listarCopiaDoChamado(chamado.id);

    for (const pessoa of copia) {
      if (!pessoa.email || !EMAIL_REGEX.test(pessoa.email)) continue;

      const conteudo = montarConteudoParaCopia(pessoa.nome, chamado, autorNome, link);

      await enviarNotificacaoUnica({
        chamadoNumero: chamado.numero,
        chamadoTitulo: chamado.titulo,
        evento,
        destinatarioEmail: pessoa.email,
        destinatarioNome: pessoa.nome,
        ...conteudo,
      });
    }
  }
}

export interface NotificarAtendenteParams {
  chamado: { id: string; numero: number; titulo: string; atendenteUsuarioId: string | null };
  origem: string;
  autorNome: string;
}

/*
 * Espelho de notificarSolicitanteChamado, na direção contrária --
 * disparado quando quem escreve NÃO é atendente (solicitante ou
 * usuário em cópia), avisando o atendente responsável. Sem atendente
 * atribuído ainda, não há para quem notificar (a fila de atendimento
 * já mostra o chamado normalmente).
 */
export async function notificarAtendenteChamado(params: NotificarAtendenteParams): Promise<void> {
  const { chamado, origem, autorNome } = params;

  if (!chamado.atendenteUsuarioId) return;

  const atendente = await buscarUsuarioPorId(chamado.atendenteUsuarioId);
  if (!atendente?.email || !EMAIL_REGEX.test(atendente.email)) return;

  const link = `${origem}/chamados/${chamado.numero}`;
  const referencia = `#${chamado.numero} — ${chamado.titulo}`;
  const assunto = `Nova mensagem no chamado ${referencia} — Portal Triel-HT`;

  const corpoHtml = montarEmailHtml(`
    <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${atendente.nomeExibicao}</strong>!</p>
    <p style="margin: 0 0 18px;">
      <strong>${autorNome}</strong> respondeu ao chamado <strong>${referencia}</strong>, que você atende.
    </p>
    ${montarBotaoEmailHtml("Ver chamado", link)}
    ${montarLinkEmailHtml(link)}
  `);
  const corpoTexto = `Olá, ${atendente.nomeExibicao}!\n\n${autorNome} respondeu ao chamado ${referencia}, que você atende.\n\n${link}`;

  await enviarNotificacaoUnica({
    chamadoNumero: chamado.numero,
    chamadoTitulo: chamado.titulo,
    evento: "nova_mensagem_solicitante",
    destinatarioEmail: atendente.email,
    destinatarioNome: atendente.nomeExibicao,
    assunto,
    corpoHtml,
    corpoTexto,
  });
}

interface NotificacaoEmailRow {
  id: string;
  chamado_numero: number;
  chamado_titulo: string;
  evento: EventoNotificacaoChamado;
  destinatario_email: string;
  destinatario_nome: string | null;
  assunto: string;
  sucesso: boolean;
  erro_mensagem: string | null;
  enviado_em: Date;
}

function mapearNotificacao(row: NotificacaoEmailRow): NotificacaoEmailChamado {
  return {
    id: row.id,
    chamadoNumero: row.chamado_numero,
    chamadoTitulo: row.chamado_titulo,
    evento: row.evento,
    destinatarioEmail: row.destinatario_email,
    destinatarioNome: row.destinatario_nome,
    assunto: row.assunto,
    sucesso: row.sucesso,
    erroMensagem: row.erro_mensagem,
    enviadoEm: row.enviado_em.toISOString(),
  };
}

/*
 * Duas requisições separadas (uma pra página de itens, outra pra
 * COUNT(*)) porque um único `Request` do `mssql` não roda duas queries
 * concorrentes via Promise.all — mas os MESMOS filtros precisam ser
 * ligados nas DUAS, senão a query de COUNT(*) referencia parâmetros
 * (@chamadoNumero/@evento/@sucesso) que nunca foram declarados nela.
 */
function aplicarFiltros(request: SqlRequest, filtros: FiltrosNotificacoesEmailChamados): string {
  const condicoes: string[] = [];

  if (filtros.chamadoNumero !== undefined) {
    request.input("chamadoNumero", sql.Int, filtros.chamadoNumero);
    condicoes.push("[chamado_numero] = @chamadoNumero");
  }

  if (filtros.evento) {
    request.input("evento", sql.VarChar(30), filtros.evento);
    condicoes.push("[evento] = @evento");
  }

  if (filtros.sucesso !== undefined) {
    request.input("sucesso", sql.Bit, filtros.sucesso);
    condicoes.push("[sucesso] = @sucesso");
  }

  return condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
}

export async function listarNotificacoesEmailChamados(
  filtros: FiltrosNotificacoesEmailChamados
): Promise<{ itens: NotificacaoEmailChamado[]; total: number }> {
  const pool = await getSqlServerPool();

  const requestItens = pool.request();
  const whereClause = aplicarFiltros(requestItens, filtros);

  const offset = (filtros.pagina - 1) * filtros.porPagina;
  requestItens.input("offset", sql.Int, offset);
  requestItens.input("porPagina", sql.Int, filtros.porPagina);

  const requestTotal = pool.request();
  aplicarFiltros(requestTotal, filtros);

  const [itensResult, totalResult] = await Promise.all([
    requestItens.query<NotificacaoEmailRow>(`
      SELECT [id], [chamado_numero], [chamado_titulo], [evento], [destinatario_email],
             [destinatario_nome], [assunto], [sucesso], [erro_mensagem], [enviado_em]
      FROM dbo.portal_chamados_notificacoes_email
      ${whereClause}
      ORDER BY [enviado_em] DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `),
    requestTotal.query<{ total: number }>(
      `SELECT COUNT(*) AS [total] FROM dbo.portal_chamados_notificacoes_email ${whereClause};`
    ),
  ]);

  return {
    itens: itensResult.recordset.map(mapearNotificacao),
    total: totalResult.recordset[0]?.total ?? 0,
  };
}
