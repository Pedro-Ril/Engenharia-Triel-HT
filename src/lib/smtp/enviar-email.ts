import "server-only";

import nodemailer from "nodemailer";

import { ValidationError } from "@/lib/auth/errors";
import type { PortalUsuario } from "@/lib/auth/usuarios";

import { getConfiguracaoSmtp, type ConfiguracaoSmtp } from "./smtp-config";
import { montarEmailHtml } from "./template-email";

export interface EnviarEmailParams {
  /* Aceita um ou vários endereços — vários destinatários viram um único e-mail com todos em "para". */
  destinatario: string | string[];
  assunto: string;
  corpoHtml: string;
  corpoTexto?: string;
}

/*
 * Só os campos realmente usados para conectar/enviar — permite montar
 * um envio de teste a partir de valores ainda não salvos no banco
 * (ex: formulário de admin), sem precisar inventar atualizadoEm/Por.
 */
export type ConfiguracaoSmtpEnvio = Pick<
  ConfiguracaoSmtp,
  "host" | "porta" | "criptografia" | "autenticacaoAtiva" | "usuario" | "senha" | "remetenteNome" | "remetenteEmail"
>;

/*
 * "ssl" = TLS implícito desde a conexão (nodemailer "secure: true",
 * porta típica 465). "tls" = STARTTLS, conexão começa sem cifra e
 * sobe pra TLS depois (nodemailer "requireTLS: true", porta típica
 * 587). "nenhuma" = sem cifra nenhuma — só faz sentido em rede
 * interna/confiável.
 */
function criarTransportador(config: ConfiguracaoSmtpEnvio) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.porta,
    secure: config.criptografia === "ssl",
    requireTLS: config.criptografia === "tls",
    auth:
      config.autenticacaoAtiva && config.usuario && config.senha
        ? { user: config.usuario, pass: config.senha }
        : undefined,
  });
}

export async function enviarEmailComConfig(
  config: ConfiguracaoSmtpEnvio,
  params: EnviarEmailParams
): Promise<void> {
  const transportador = criarTransportador(config);

  const remetente = config.remetenteNome
    ? `"${config.remetenteNome}" <${config.remetenteEmail}>`
    : config.remetenteEmail;

  try {
    await transportador.sendMail({
      from: remetente,
      to: params.destinatario,
      subject: params.assunto,
      html: params.corpoHtml,
      text: params.corpoTexto,
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido.";
    throw new ValidationError(`Não foi possível enviar o e-mail: ${mensagem}`);
  }
}

/*
 * Usada por qualquer funcionalidade futura que precise mandar e-mail
 * de verdade (ex: notificação de chamado) — carrega a configuração já
 * salva, em vez de exigir que cada chamador monte o objeto de config.
 */
export async function enviarEmail(params: EnviarEmailParams): Promise<void> {
  const config = await getConfiguracaoSmtp();

  if (!config) {
    throw new ValidationError(
      "Configure o servidor SMTP em Administração → Configurações antes de enviar e-mails."
    );
  }

  await enviarEmailComConfig(config, params);
}

/*
 * O destino do teste é sempre o e-mail já cadastrado do PRÓPRIO
 * usuário que está testando — nunca um endereço arbitrário digitado
 * na tela (pedido explícito: evita usar esta tela como disparador de
 * e-mail para qualquer destinatário). Se o usuário logado não tiver
 * e-mail cadastrado no AD, nem tenta enviar.
 */
export async function enviarEmailTeste(
  config: ConfiguracaoSmtpEnvio,
  usuario: Pick<PortalUsuario, "nomeExibicao" | "email">
): Promise<void> {
  if (!usuario.email) {
    throw new ValidationError(
      "Seu usuário não tem e-mail cadastrado no Active Directory — não há para onde mandar o teste."
    );
  }

  await enviarEmailComConfig(config, {
    destinatario: usuario.email,
    assunto: "Teste de configuração SMTP — Portal Triel-HT",
    corpoHtml: montarEmailHtml(`
      <p style="margin: 0 0 12px;">Este é um e-mail de teste enviado pelo Portal Triel-HT.</p>
      <p style="margin: 0 0 12px;">Se você recebeu esta mensagem, a configuração SMTP está funcionando corretamente.</p>
      <p style="margin: 0;">Enviado para: <strong>${usuario.nomeExibicao}</strong> (${usuario.email})</p>
    `),
    corpoTexto: `Este é um e-mail de teste enviado pelo Portal Triel-HT.\n\nSe você recebeu esta mensagem, a configuração SMTP está funcionando corretamente.\n\nEnviado para: ${usuario.nomeExibicao} (${usuario.email})`,
  });
}
