import "server-only";

import { enviarEmail } from "@/lib/smtp/enviar-email";
import { montarBotaoEmailHtml, montarEmailHtml, montarLinkEmailHtml } from "@/lib/smtp/template-email";
import { registrarLog } from "@/lib/monitoramento/logs";

import type { AprovacaoLote, ItemAumentoSalarial, RelatorioSolicitacao } from "./aprovacoes";
import { listarEmailsAtendentes } from "./atendentes";
import { gerarSenhaRelatorio, montarAnexosRelatorio } from "./relatorio-anexos";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * Bem mais enxuto que src/lib/chamados/notificacoes-email.ts de
 * propósito -- esse módulo não tem tela de retry/auditoria de envio
 * (não existe hoje um motivo real pra isso aqui), então falha de
 * e-mail só cai no log geral e nunca impede a ação principal (criar
 * solicitação, aprovar, reprovar) de completar -- mesmo espírito de
 * registrarVisualizacaoChamadoSemFalhar.
 */
async function enviarSemFalhar(params: {
  destinatario: string | string[];
  assunto: string;
  corpoHtml: string;
  corpoTexto: string;
}): Promise<void> {
  try {
    await enviarEmail(params);
  } catch (error) {
    console.error("Erro ao enviar e-mail de notificação de aprovações:", error);
    await registrarLog({
      nivel: "erro",
      origem: "aprovacoes/email",
      mensagem: `Falha ao enviar e-mail para ${Array.isArray(params.destinatario) ? params.destinatario.join(", ") : params.destinatario}.`,
      detalhes: error instanceof Error ? error.message : String(error),
    });
  }
}

/*
 * Nenhum e-mail deste módulo carrega nome de colaborador, salário,
 * valor ou percentual: reajuste é dado sensível e e-mail é o canal
 * menos controlado do portal (encaminhamento, cópia, caixa
 * compartilhada). O e-mail é só o aviso de que ALGO aconteceu na
 * SOLICITAÇÃO -- os detalhes só existem dentro do portal, para quem
 * tem permissão.
 */

/*
 * Disparado depois que um LOTE novo é criado -- um único e-mail por
 * solicitação (nunca um por colaborador) pra todo mundo com acesso ao
 * painel.
 */
export async function notificarDirecaoNovaSolicitacao(lote: AprovacaoLote, origem: string): Promise<void> {
  const destinatarios = await listarEmailsAtendentes(lote.tipo);
  const emails = destinatarios.map((d) => d.email).filter((email) => EMAIL_REGEX.test(email));
  if (emails.length === 0) return;

  const link = `${origem}/aprovacoes/painel`;
  const assunto = `Nova solicitação de reajuste salarial #${lote.numero} — Portal Triel-HT`;
  const quantidade = `${lote.itens.length} colaborador(es)`;

  const corpoHtml = montarEmailHtml(`
    <p style="margin: 0 0 18px; font-size: 16px;">Olá!</p>
    <p style="margin: 0 0 18px;">
      <strong>${lote.criadoPorNome}</strong> criou uma nova solicitação de reajuste salarial
      (<strong>#${lote.numero}</strong>) com ${quantidade} aguardando decisão da direção.
    </p>
    <p style="margin: 0 0 18px;">Os detalhes estão no painel de aprovações.</p>
    ${montarBotaoEmailHtml("Ver no painel de aprovações", link)}
    ${montarLinkEmailHtml(link)}
  `);
  const corpoTexto = `${lote.criadoPorNome} criou uma nova solicitação de reajuste salarial (#${lote.numero}) com ${quantidade} aguardando decisão da direção.\n\nOs detalhes estão no painel de aprovações:\n${link}`;

  await enviarSemFalhar({ destinatario: emails, assunto, corpoHtml, corpoTexto });
}

/*
 * Disparado quando a direção decide UM colaborador dentro do lote --
 * avisa quem criou a solicitação, em tempo real, mas sem dizer QUEM
 * foi decidido nem COMO: só que a solicitação teve uma atualização.
 * Decidir 3 de 5 colaboradores gera 3 avisos iguais falando da mesma
 * solicitação, o que é proposital (cada decisão acontece num momento
 * diferente e o solicitante precisa saber que houve movimento).
 */
export async function notificarSolicitanteDecisao(
  item: ItemAumentoSalarial,
  solicitanteEmail: string | null,
  origem: string
): Promise<void> {
  if (!solicitanteEmail || !EMAIL_REGEX.test(solicitanteEmail)) return;

  const link = `${origem}/aprovacoes/minhas-solicitacoes`;
  const assunto = `Atualização na sua solicitação #${item.aprovacaoNumero} — Portal Triel-HT`;

  const corpoHtml = montarEmailHtml(`
    <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${item.criadoPorNome}</strong>!</p>
    <p style="margin: 0 0 18px;">
      Houve uma atualização na sua solicitação de reajuste salarial <strong>#${item.aprovacaoNumero}</strong>.
    </p>
    <p style="margin: 0 0 18px;">Acesse "Minhas Solicitações" para ver a situação de cada colaborador.</p>
    ${montarBotaoEmailHtml("Ver minhas solicitações", link)}
    ${montarLinkEmailHtml(link)}
  `);
  const corpoTexto = `Houve uma atualização na sua solicitação de reajuste salarial #${item.aprovacaoNumero}.\n\nAcesse "Minhas Solicitações" para ver a situação de cada colaborador:\n${link}`;

  await enviarSemFalhar({ destinatario: solicitanteEmail, assunto, corpoHtml, corpoTexto });
}


/* Escapa o que vem de cadastro (nome, setor, observação) antes de entrar no HTML do e-mail. */
function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/*
 * Relatório que o solicitante dispara quando a solicitação termina.
 * Os dados (nome, salário, valores) vão só nos ANEXOS, protegidos por
 * senha -- o corpo leva resumo e a senha. Repetir a tabela no corpo em
 * texto puro anularia a proteção dos arquivos.
 *
 * Vai para um endereço único definido pelo administrador, diferente
 * dos avisos, que vão para vários aprovadores.
 */
export async function enviarRelatorioSolicitacao(
  relatorio: RelatorioSolicitacao,
  destinatario: string,
  origem: string
): Promise<void> {
  if (!EMAIL_REGEX.test(destinatario)) {
    throw new Error("O e-mail de destino do relatório está inválido.");
  }

  const senha = gerarSenhaRelatorio();
  const anexos = await montarAnexosRelatorio(relatorio, senha);

  const link = `${origem}/aprovacoes/minhas-solicitacoes`;
  const assunto = `Reajuste salarial aprovado — solicitação #${relatorio.numero} — Portal Triel-HT`;
  const resumo =
    `${relatorio.aprovados.length} de ${relatorio.totalItens} colaborador(es) aprovado(s)` +
    (relatorio.totalReprovados > 0 ? ` e ${relatorio.totalReprovados} reprovado(s)` : "");

  const corpoHtml = montarEmailHtml(`
    <p style="margin: 0 0 18px; font-size: 16px;">Olá!</p>
    <p style="margin: 0 0 18px;">
      A solicitação de reajuste salarial <strong>#${relatorio.numero}</strong>, criada por
      <strong>${escaparHtml(relatorio.criadoPorNome)}</strong>, foi concluída: ${resumo}.
    </p>
    <p style="margin: 0 0 18px;">
      O detalhamento dos aprovados está nos dois anexos (PDF e Excel). Os arquivos são
      <strong>protegidos por senha</strong>:
    </p>
    <p style="margin: 0 0 18px; font-size: 20px; letter-spacing: 3px; font-family: monospace;">
      <strong>${senha}</strong>
    </p>
    <p style="margin: 0 0 18px; color: #666; font-size: 13px;">
      A senha vale só para estes arquivos e muda a cada envio.
    </p>
    ${montarBotaoEmailHtml("Ver no portal", link)}
    ${montarLinkEmailHtml(link)}
  `);

  const corpoTexto = [
    `Solicitação de reajuste salarial #${relatorio.numero}, criada por ${relatorio.criadoPorNome}, foi concluída.`,
    resumo + ".",
    "",
    "O detalhamento dos aprovados está nos dois anexos (PDF e Excel), protegidos por senha.",
    `Senha dos arquivos: ${senha}`,
    "A senha vale só para estes arquivos e muda a cada envio.",
    "",
    link,
  ].join("\n");

  /* Diferente dos avisos: se o relatório falhar, quem clicou precisa saber -- por isso não passa por enviarSemFalhar. */
  await enviarEmail({ destinatario, assunto, corpoHtml, corpoTexto, anexos });
}
