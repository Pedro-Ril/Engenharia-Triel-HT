import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { buscarUsuarioPorId } from "@/lib/auth/usuarios";
import { buscarConfigChamados } from "@/lib/chamados/chamados-config";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { registrarLog } from "@/lib/monitoramento/logs";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import {
  montarBotaoEmailHtml,
  montarCartaoArquivosEmailHtml,
  montarEmailHtml,
  montarLinkEmailHtml,
} from "@/lib/smtp/template-email";

import { buscarRodada, executarSimulacao, iniciarLiberacao, rodadaEmAndamento, type DesenhoDaRodada, type Rodada } from "./liberacao-desenhos";
import { escolherDesenhosAutomaticos, tituloDiferenteDoItem } from "./liberacao-regras";

/*
 * 3DExperience → Liberação de desenhos AGENDADA.
 *
 * O 3DX leva uns minutos para indexar as relações depois que a pessoa
 * mexe na estrutura; simular na hora pode pegar a estrutura velha. Então
 * a pessoa pede, o Portal espera MINUTOS_ESPERA_INDEXACAO, simula, libera
 * em nome dela tudo o que estiver em trabalho (ver
 * escolherDesenhosAutomaticos) e manda um e-mail no fim.
 *
 * A SENHA fica só na memória do servidor, do pedido até o 3DX aceitar o
 * job (uns 4 minutos): nunca vai para banco nem log. Se o servidor
 * reiniciar no meio, ela some -- a simulação continua e a pessoa recebe o
 * e-mail dizendo que nada foi liberado e que dá para liberar pela tela.
 * Administrador do Portal não manda senha (vai com o admin da plataforma).
 *
 * Tudo o mais fica no banco (status/agendada_para/notificado_em em
 * portal_3dx_liberacoes): o agendador retoma de onde parou depois de um
 * reinício e o e-mail final sai uma vez só.
 */

export const MINUTOS_ESPERA_INDEXACAO = 4;
const INTERVALO_VERIFICACAO_MS = 15_000;
/* Passou disso da hora marcada sem conseguir começar (3DX ocupado): desiste e avisa. */
const MINUTOS_MAX_NA_FILA = 30;
/* Etapa sem andar há mais que isso (servidor reiniciado na explosão, job que não termina): desiste e avisa. */
const MINUTOS_MAX_ETAPA = 120;
/* Senha que sobrou na memória por algum caminho imprevisto não passa disso (o fluxo mais longo possível). */
const MINUTOS_MAX_SENHA = MINUTOS_ESPERA_INDEXACAO + MINUTOS_MAX_NA_FILA + MINUTOS_MAX_ETAPA + 5;
/* Quantos desenhos o e-mail lista (o resto fica no Portal). */
const MAX_DESENHOS_NO_EMAIL = 40;

/* ------------------------------------------------------------------ senha em memória */

/*
 * No globalThis (e não numa variável do módulo): a rota que agenda e o
 * agendador iniciado em instrumentation.ts podem carregar cópias
 * diferentes deste módulo, mas rodam no mesmo processo.
 */
declare global {
  var portal3dxSenhasAgendadas: Map<string, { senha: string; guardadaEm: number }> | undefined;
  var portal3dxAgendadorIniciado: boolean | undefined;
  var portal3dxAgendadorRodando: boolean | undefined;
}

function senhas() {
  globalThis.portal3dxSenhasAgendadas ??= new Map();
  return globalThis.portal3dxSenhasAgendadas;
}

export function guardarSenhaAgendada(rodadaId: string, senha: string) {
  senhas().set(rodadaId, { senha, guardadaEm: Date.now() });
}

export function descartarSenhaAgendada(rodadaId: string) {
  senhas().delete(rodadaId);
}

/* Lê e já apaga: a senha serve para uma tentativa só. */
function retirarSenha(rodadaId: string): string | null {
  const guardada = senhas().get(rodadaId);
  senhas().delete(rodadaId);
  return guardada?.senha ?? null;
}

function limparSenhasVencidas() {
  const limite = Date.now() - MINUTOS_MAX_SENHA * 60_000;
  for (const [id, { guardadaEm }] of senhas()) {
    if (guardadaEm < limite) senhas().delete(id);
  }
}

/* ------------------------------------------------------------------ banco */

interface LinhaFluxo {
  id: string;
  codigo_pai: string;
  status: Rodada["status"];
  usuario_id: string | null;
  liberacao_id: string | null;
  na_hora: number;
  minutos_desde_inicio: number;
}

/* As raízes (simulações agendadas) cujo fluxo ainda não terminou -- o e-mail final é o que encerra. */
async function listarFluxosAbertos(): Promise<LinhaFluxo[]> {
  const pool = await getSqlServerPool();
  const result = await pool.request().query<LinhaFluxo>(`
    SELECT CONVERT(VARCHAR(36), r.[id]) AS [id], r.[codigo_pai], r.[status], CONVERT(VARCHAR(36), r.[usuario_id]) AS [usuario_id],
           (SELECT TOP 1 CONVERT(VARCHAR(36), l.[id]) FROM dbo.portal_3dx_liberacoes AS l WHERE l.[simulacao_id] = r.[id]) AS [liberacao_id],
           CASE WHEN r.[agendada_para] <= SYSDATETIME() THEN 1 ELSE 0 END AS [na_hora],
           DATEDIFF(MINUTE, COALESCE(r.[agendada_para], r.[criado_em]), SYSDATETIME()) AS [minutos_desde_inicio]
    FROM dbo.portal_3dx_liberacoes AS r
    WHERE r.[automatica] = 1 AND r.[dry_run] = 1 AND r.[notificado_em] IS NULL AND r.[status] <> 'cancelada'
    ORDER BY COALESCE(r.[agendada_para], r.[criado_em]);
  `);
  return result.recordset;
}

/* Agendada → explodindo, só se ainda estiver agendada (não cancelada nem pega por outro tick). */
async function reivindicarInicio(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const result = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
    UPDATE dbo.portal_3dx_liberacoes SET [status] = 'explodindo' WHERE [id] = @id AND [status] = 'agendada';
  `);
  return (result.rowsAffected[0] ?? 0) > 0;
}

/* Marca o fluxo como avisado; devolve false se outro tick já marcou (o e-mail sai uma vez só). */
async function reivindicarAviso(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const result = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
    UPDATE dbo.portal_3dx_liberacoes SET [notificado_em] = SYSDATETIME() WHERE [id] = @id AND [notificado_em] IS NULL;
  `);
  return (result.rowsAffected[0] ?? 0) > 0;
}

/* Grava na rodada o porquê de ter parado (aparece na tela), sem perder o que já estava lá. */
async function anotarMotivo(id: string, motivo: string, falhar: boolean) {
  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("motivo", sql.NVarChar(2000), motivo.slice(0, 2000))
    .input("falhar", sql.Bit, falhar)
    .query(`
      UPDATE dbo.portal_3dx_liberacoes
      SET [mensagem] = LEFT(@motivo + CASE WHEN [mensagem] IS NULL THEN N'' ELSE N' ' + [mensagem] END, 2000),
          [status] = CASE WHEN @falhar = 1 THEN 'erro' ELSE [status] END,
          [finalizado_em] = CASE WHEN @falhar = 1 THEN SYSDATETIME() ELSE [finalizado_em] END
      WHERE [id] = @id;
    `);
}

/* ------------------------------------------------------------------ e-mail */

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function nomeDoDesenho(d: DesenhoDaRodada): string {
  const item = `${d.itemCodigo ?? "-"}${d.itemRevisao ? ` | ${d.itemRevisao}` : ""}`;
  const desenho = `${d.desenhoTitulo ?? d.desenhoPhysicalId}${d.desenhoRevisao ? ` | ${d.desenhoRevisao}` : ""}`;
  return `${item} · desenho ${desenho}`;
}

function cartaoDesenhos(desenhos: DesenhoDaRodada[], situacao: (d: DesenhoDaRodada) => string): { html: string; texto: string } {
  const lista = desenhos.slice(0, MAX_DESENHOS_NO_EMAIL);
  const resto = desenhos.length - lista.length;
  const html =
    montarCartaoArquivosEmailHtml(lista.map((d) => ({ nome: escaparHtml(nomeDoDesenho(d)), tamanho: escaparHtml(situacao(d)) }))) +
    (resto > 0 ? `<p style="margin: 0 0 18px; font-size: 13px; color: #6b7280;">E mais ${resto} desenho(s) — veja no Portal.</p>` : "");
  const texto = lista.map((d) => `- ${nomeDoDesenho(d)}: ${situacao(d)}`).join("\n") + (resto > 0 ? `\n(e mais ${resto})` : "");
  return { html, texto };
}

type Desfecho =
  | { tipo: "liberada"; liberacao: { rodada: Rodada; desenhos: DesenhoDaRodada[] }; deFora: DesenhoDaRodada[] }
  | { tipo: "nao_liberada"; motivo: string; deFora: DesenhoDaRodada[] }
  /* A liberação foi enviada, mas o 3DX não devolveu o resultado a tempo: parte pode ter sido liberada. */
  | { tipo: "sem_resposta"; liberacaoId: string; deFora: DesenhoDaRodada[] };

async function avisarPorEmail(simulacao: { rodada: Rodada; desenhos: DesenhoDaRodada[] }, usuarioId: string | null, desfecho: Desfecho) {
  if (!(await reivindicarAviso(simulacao.rodada.id))) return;

  const usuario = usuarioId ? await buscarUsuarioPorId(usuarioId) : null;
  if (!usuario?.email) {
    console.error(`Liberação agendada ${simulacao.rodada.id}: quem pediu não tem e-mail cadastrado; aviso não enviado.`);
    return;
  }

  const codigo = simulacao.rodada.codigoPai;
  const idNaTela =
    desfecho.tipo === "liberada"
      ? desfecho.liberacao.rodada.id
      : desfecho.tipo === "sem_resposta"
        ? desfecho.liberacaoId
        : simulacao.rodada.id;
  const origem = (await buscarConfigChamados().catch(() => null))?.urlPublica ?? "";
  const link = `${origem}/3dexperience?aba=liberar-desenhos&rodada=${idNaTela}`;
  const nome = escaparHtml(usuario.nomeExibicao);

  let assunto: string;
  let resumoHtml: string;
  let resumoTexto: string;
  let listaHtml = "";
  let listaTexto = "";

  if (desfecho.tipo === "liberada") {
    const { rodada, desenhos } = desfecho.liberacao;
    const liberados = desenhos.filter((d) => d.acao === "liberado" || d.acao === "seria_liberado").length;
    const erros = desenhos.filter((d) => d.acao === "erro").length;
    const falhou = rodada.status === "erro";
    assunto = falhou
      ? `Liberação de ${codigo} falhou no 3DX — Portal Triel-HT`
      : `Liberação de ${codigo}: ${liberados} desenho(s) liberado(s)${erros ? `, ${erros} com erro` : ""} — Portal Triel-HT`;
    resumoTexto = falhou
      ? `A liberação agendada da estrutura de ${codigo} falhou no 3DEXPERIENCE: ${rodada.mensagem ?? "erro sem detalhe"}.`
      : `A liberação agendada da estrutura de ${codigo} terminou: ${liberados} desenho(s) liberado(s) em seu nome no 3DEXPERIENCE${
          erros ? ` e ${erros} com erro` : ""
        }.`;
    resumoHtml = escaparHtml(resumoTexto);
    const lista = cartaoDesenhos(desenhos, (d) =>
      d.acao === "liberado" || d.acao === "seria_liberado" ? "Liberado" : d.acao === "erro" ? `Erro: ${d.mensagem ?? "sem detalhe"}` : d.acao
    );
    listaHtml = lista.html;
    listaTexto = `\n\n${lista.texto}`;
  } else if (desfecho.tipo === "sem_resposta") {
    assunto = `Liberação de ${codigo}: o 3DX não confirmou o resultado — Portal Triel-HT`;
    resumoTexto = `A liberação agendada da estrutura de ${codigo} foi enviada ao 3DEXPERIENCE, mas ele não devolveu o resultado a tempo. Parte dos desenhos pode ter sido liberada: confira no 3DEXPERIENCE antes de liberar de novo.`;
    resumoHtml = escaparHtml(resumoTexto);
  } else {
    assunto = `Liberação de ${codigo}: nada foi liberado — Portal Triel-HT`;
    resumoTexto = `A liberação agendada da estrutura de ${codigo} parou sem liberar nenhum desenho. ${desfecho.motivo}`;
    resumoHtml = escaparHtml(resumoTexto);
  }

  if (desfecho.deFora.length > 0) {
    const fora = cartaoDesenhos(desfecho.deFora, () => "Título diferente do item — não liberado");
    listaHtml += `<p style="margin: 0 0 12px;"><strong>Ficaram de fora</strong> (título do desenho diferente do código do item; confira e libere pela tela se estiver certo):</p>${fora.html}`;
    listaTexto += `\n\nFicaram de fora (título diferente do item):\n${fora.texto}`;
  }

  await enviarEmail({
    destinatario: usuario.email,
    assunto,
    corpoHtml: montarEmailHtml(`
      <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${nome}</strong>!</p>
      <p style="margin: 0 0 18px;">${resumoHtml}</p>
      ${listaHtml}
      ${montarBotaoEmailHtml("Ver no Portal", link)}
      ${montarLinkEmailHtml(link)}
    `),
    corpoTexto: `Olá, ${usuario.nomeExibicao}!\n\n${resumoTexto}${listaTexto}\n\n${link}`,
  }).catch((erro) => {
    console.error(`Liberação agendada ${simulacao.rodada.id}: falha ao enviar o e-mail:`, erro);
  });
}

/* ------------------------------------------------------------------ fluxo */

/*
 * Para o fluxo sem liberar nada: anota o porquê na simulação e avisa.
 * A lista "ficaram de fora" só vai quando ELA é o motivo (todos os em
 * trabalho têm título diferente); nos outros casos tudo ficou de fora.
 */
async function pararSemLiberar(fluxo: LinhaFluxo, motivo: string, falhar: boolean, listarDeFora = false) {
  descartarSenhaAgendada(fluxo.id);
  await anotarMotivo(fluxo.id, motivo, falhar);
  const simulacao = await buscarRodada(fluxo.id);
  if (!simulacao) return;
  const deFora = listarDeFora
    ? simulacao.desenhos.filter((d) => d.acao === "seria_liberado" && tituloDiferenteDoItem(d))
    : [];
  await avisarPorEmail(simulacao, fluxo.usuario_id, { tipo: "nao_liberada", motivo, deFora });
}

/* Simulação concluída e ainda sem liberação: escolhe os desenhos e libera em nome de quem pediu. */
async function liberarAPartirDaSimulacao(
  fluxo: LinhaFluxo,
  simulacao: { rodada: Rodada; desenhos: DesenhoDaRodada[] },
  podeComecarNova: { valor: boolean }
) {
  const escolha = escolherDesenhosAutomaticos(simulacao.desenhos, simulacao.rodada.mensagem);
  if (escolha.bloqueio) {
    await pararSemLiberar(fluxo, `${escolha.bloqueio} Por segurança, a liberação parou: revise a simulação no Portal.`, false);
    return;
  }
  if (escolha.liberar.length === 0) {
    const soTituloDiferente = escolha.deFora.length > 0;
    await pararSemLiberar(
      fluxo,
      soTituloDiferente
        ? "Os únicos desenhos em trabalho têm título diferente do item; confira e libere pela tela."
        : "Nenhum desenho da estrutura está em trabalho.",
      false,
      soTituloDiferente
    );
    return;
  }

  const usuario = fluxo.usuario_id ? await buscarUsuarioPorId(fluxo.usuario_id) : null;
  if (!usuario || !usuario.ativo) {
    await pararSemLiberar(fluxo, "Não foi possível identificar quem pediu a liberação.", false);
    return;
  }

  /* Alguém começou outra rodada no meio: espera a vez (a senha continua na memória até lá). */
  if (!podeComecarNova.valor || (await rodadaEmAndamento())) {
    podeComecarNova.valor = false;
    if (fluxo.minutos_desde_inicio > MINUTOS_MAX_ETAPA) {
      await pararSemLiberar(fluxo, "O 3DX ficou ocupado com outras rodadas e a liberação não conseguiu começar.", false);
    }
    return;
  }
  podeComecarNova.valor = false;

  const senha = usuario.ehAdministrador ? null : retirarSenha(fluxo.id);
  if (!usuario.ehAdministrador && !senha) {
    await pararSemLiberar(
      fluxo,
      "A sua senha não estava mais na memória do Portal (ele pode ter sido reiniciado durante a espera; a senha nunca é gravada). A simulação está pronta: libere pela tela.",
      false
    );
    return;
  }

  try {
    const liberacaoId = await iniciarLiberacao(fluxo.id, escolha.liberar, usuario, senha, { automatica: true });
    await registrarLog({
      nivel: "info",
      origem: "3dexperience/liberacao",
      mensagem: `Liberação agendada de ${fluxo.codigo_pai}: ${escolha.liberar.length} desenho(s) enviados ao 3DX em nome de ${usuario.nomeExibicao} (liberação ${liberacaoId}).`,
    }).catch(() => {});
  } catch (erro) {
    const motivo =
      erro instanceof ValidationError
        ? erro.message
        : `O 3DX não aceitou a liberação (${erro instanceof Error ? erro.message : String(erro)}).`;
    await pararSemLiberar(fluxo, `${motivo} Nada foi liberado.`, false);
  } finally {
    descartarSenhaAgendada(fluxo.id);
  }
}

/* Uma passada do agendador por todos os fluxos abertos. */
async function avancarFluxo(fluxo: LinhaFluxo, podeComecarNova: { valor: boolean }) {
  switch (fluxo.status) {
    case "agendada": {
      if (!fluxo.na_hora) return;
      if (fluxo.minutos_desde_inicio > MINUTOS_MAX_NA_FILA) {
        await pararSemLiberar(fluxo, "O 3DX ficou ocupado com outras rodadas e a liberação não conseguiu começar. Peça de novo.", true);
        return;
      }
      /* Uma rodada por vez no 3DX: espera a vez (a primeira da fila sai primeiro). */
      if (!podeComecarNova.valor || (await rodadaEmAndamento())) {
        podeComecarNova.valor = false;
        return;
      }
      if (!(await reivindicarInicio(fluxo.id))) return;
      podeComecarNova.valor = false;
      /* Sem await: a explosão leva minutos; as próximas passadas acompanham pelo status. */
      void executarSimulacao(fluxo.id, fluxo.codigo_pai);
      return;
    }

    case "explodindo":
    case "buscando_desenhos":
      if (fluxo.minutos_desde_inicio > MINUTOS_MAX_ETAPA) {
        await pararSemLiberar(fluxo, "A simulação parou no meio (o Portal pode ter sido reiniciado).", true);
      }
      return;

    case "processando": {
      /* buscarRodada pergunta ao 3DX pelo job e grava o resultado quando ele termina. */
      const simulacao = await buscarRodada(fluxo.id);
      if (simulacao?.rodada.status === "concluida") {
        await liberarAPartirDaSimulacao(fluxo, simulacao, podeComecarNova);
      } else if (simulacao?.rodada.status === "erro") {
        await pararSemLiberar(fluxo, "A simulação falhou no 3DX.", false);
      } else if (fluxo.minutos_desde_inicio > MINUTOS_MAX_ETAPA) {
        await pararSemLiberar(fluxo, "A simulação não terminou no 3DX a tempo.", true);
      }
      return;
    }

    case "erro":
      await pararSemLiberar(fluxo, "A simulação falhou.", false);
      return;

    case "concluida": {
      if (!fluxo.liberacao_id) {
        const simulacao = await buscarRodada(fluxo.id);
        if (simulacao) await liberarAPartirDaSimulacao(fluxo, simulacao, podeComecarNova);
        return;
      }
      /* Liberação já enviada ao 3DX: acompanha até terminar e manda o resultado. */
      const liberacao = await buscarRodada(fluxo.liberacao_id);
      if (!liberacao) return;
      const simulacao = await buscarRodada(fluxo.id);
      if (!simulacao) return;
      const deFora = simulacao.desenhos.filter((d) => d.acao === "seria_liberado" && tituloDiferenteDoItem(d));
      if (liberacao.rodada.status === "processando") {
        if (fluxo.minutos_desde_inicio > MINUTOS_MAX_ETAPA) {
          await avisarPorEmail(simulacao, fluxo.usuario_id, { tipo: "sem_resposta", liberacaoId: liberacao.rodada.id, deFora });
        }
        return;
      }
      await avisarPorEmail(simulacao, fluxo.usuario_id, { tipo: "liberada", liberacao, deFora });
      return;
    }

    default:
      return;
  }
}

/* Exportada para os testes (liberacao-agendada.test.ts); quem chama de verdade é o setInterval abaixo. */
export async function processarLiberacoesAgendadas() {
  if (globalThis.portal3dxAgendadorRodando) return;
  globalThis.portal3dxAgendadorRodando = true;
  try {
    limparSenhasVencidas();
    const fluxos = await listarFluxosAbertos();
    const podeComecarNova = { valor: true };
    for (const fluxo of fluxos) {
      try {
        await avancarFluxo(fluxo, podeComecarNova);
      } catch (erro) {
        console.error(`Erro na liberação agendada ${fluxo.id} (${fluxo.codigo_pai}):`, erro);
      }
    }
  } catch (erro) {
    console.error("Erro no agendador de liberação de desenhos:", erro);
  } finally {
    globalThis.portal3dxAgendadorRodando = false;
  }
}

export function iniciarAgendadorLiberacaoDesenhos() {
  if (globalThis.portal3dxAgendadorIniciado) return;
  globalThis.portal3dxAgendadorIniciado = true;

  setInterval(() => {
    processarLiberacoesAgendadas().catch((erro) => {
      console.error("Erro inesperado no agendador de liberação de desenhos:", erro);
    });
  }, INTERVALO_VERIFICACAO_MS);
}
