import "server-only";

import type { PortalUsuario } from "@/lib/auth/usuarios";
import { buscarConfigChamados } from "@/lib/chamados/chamados-config";
import { registrarLog } from "@/lib/monitoramento/logs";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import {
  montarBotaoEmailHtml,
  montarCartaoArquivosEmailHtml,
  montarEmailHtml,
  montarLinkEmailHtml,
} from "@/lib/smtp/template-email";

import { ehClienteCiber, encontrarDivergencias, type DivergenciaDesenho, type LinhaEstruturaErp } from "./analise-regras";

/*
 * Liberação de Projeto → depois que o e-mail de liberação sai, o Portal
 * confere em segundo plano a estrutura do "Código CJ Geral" no ERP: item
 * fabricado com código do desenho diferente do código do item. Achou
 * alguma, avisa por e-mail quem fez a liberação (o usuário logado). Nada
 * disso aparece na tela nem atrasa o envio; falha vira log, sem e-mail.
 * Cliente Ciber fica de fora (ver ehClienteCiber).
 */

const API_ESTRUTURA_ERP = "http://proserver.trielht.com.br:1000/api/estrutura";
const TEMPO_MAX_ERP_MS = 90_000;
const MAX_ITENS_NO_EMAIL = 40;
const ORIGEM_LOG = "liberacao-projeto/analise";

export interface DadosLiberacao {
  codigo: string;
  cliente: string;
  ordem: string;
  /* "Nome" escolhido no formulário (responsável), só para o texto do e-mail. */
  responsavel: string;
}

async function buscarEstruturaErp(codigo: string): Promise<LinhaEstruturaErp[]> {
  const resposta = await fetch(`${API_ESTRUTURA_ERP}/${encodeURIComponent(codigo)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TEMPO_MAX_ERP_MS),
  });
  const json: unknown = await resposta.json().catch(() => null);
  const corpo = json as { success?: boolean; message?: string; data?: unknown } | null;

  if (!resposta.ok || !corpo?.success || !Array.isArray(corpo.data)) {
    throw new Error(corpo?.message || `O ERP respondeu HTTP ${resposta.status} para a estrutura de ${codigo}.`);
  }

  return corpo.data as LinhaEstruturaErp[];
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function descreverDesenho(d: DivergenciaDesenho): string {
  return d.codigoDesenho ? `desenho ${d.codigoDesenho}` : "sem código de desenho";
}

function descreverOnde(d: DivergenciaDesenho): string {
  if (d.pais.length === 0) return "item do projeto";
  return `em ${d.pais.slice(0, 3).join(", ")}${d.pais.length > 3 ? ` e mais ${d.pais.length - 3}` : ""}`;
}

export async function avisarDivergencias(
  dados: DadosLiberacao,
  usuario: Pick<PortalUsuario, "nomeExibicao" | "email">,
  divergencias: DivergenciaDesenho[]
) {
  if (!usuario.email) return;

  const { codigo } = dados;
  const total = divergencias.length;
  const lista = divergencias.slice(0, MAX_ITENS_NO_EMAIL);
  const resto = total - lista.length;
  const origem = (await buscarConfigChamados().catch(() => null))?.urlPublica ?? "";
  const link = `${origem}/consulta-estrutura?itemPai=${encodeURIComponent(codigo)}`;

  const contexto = [dados.ordem && `ordem ${dados.ordem}`, dados.cliente && `cliente ${dados.cliente}`].filter(Boolean).join(", ");
  const resumo = `Na liberação do projeto ${codigo}${contexto ? ` (${contexto})` : ""}, a estrutura no ERP tem ${
    total === 1 ? "1 item fabricado" : `${total} itens fabricados`
  } com o código do desenho diferente do código do item. Confira o cadastro ${total === 1 ? "dele" : "deles"}:`;

  const linhasTexto = lista.map(
    (d) => `- ${d.codigoItem}: ${descreverDesenho(d)} (${d.descricao || "sem descrição"}; ${descreverOnde(d)})`
  );

  await enviarEmail({
    destinatario: usuario.email,
    assunto: `Liberação de ${codigo}: ${total === 1 ? "1 item" : `${total} itens`} com desenho diferente do código — Portal Triel-HT`,
    corpoHtml: montarEmailHtml(`
      <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${escaparHtml(usuario.nomeExibicao)}</strong>!</p>
      <p style="margin: 0 0 18px;">${escaparHtml(resumo)}</p>
      ${montarCartaoArquivosEmailHtml(
        lista.map((d) => ({
          nome: escaparHtml(`${d.codigoItem} · ${descreverDesenho(d)}`),
          tamanho: escaparHtml(`${d.descricao || "sem descrição"} · ${descreverOnde(d)}`),
        }))
      )}
      ${resto > 0 ? `<p style="margin: 0 0 18px; font-size: 13px; color: #6b7280;">E mais ${resto} item(ns).</p>` : ""}
      <p style="margin: 0 0 18px; font-size: 13px; color: #6b7280;">Liberação feita por ${escaparHtml(
        dados.responsavel || usuario.nomeExibicao
      )}. O e-mail de liberação foi enviado normalmente; este é só um aviso.</p>
      ${montarBotaoEmailHtml("Ver a estrutura no Portal", link)}
      ${montarLinkEmailHtml(link)}
    `),
    corpoTexto: `Olá, ${usuario.nomeExibicao}!\n\n${resumo}\n\n${linhasTexto.join("\n")}${
      resto > 0 ? `\n(e mais ${resto})` : ""
    }\n\nO e-mail de liberação foi enviado normalmente; este é só um aviso.\n\n${link}`,
  });
}

/*
 * A análise inteira: nunca lança (roda depois da resposta da rota, sem
 * ninguém esperando). Devolve quantas divergências achou, ou null se não
 * deu para analisar -- só para os testes e o log.
 */
export async function analisarEstruturaDaLiberacao(
  dados: DadosLiberacao,
  usuario: Pick<PortalUsuario, "nomeExibicao" | "email">
): Promise<number | null> {
  if (ehClienteCiber(dados.cliente)) return 0;

  try {
    const divergencias = encontrarDivergencias(await buscarEstruturaErp(dados.codigo));
    if (divergencias.length === 0) return 0;

    if (!usuario.email) {
      await registrarLog({
        nivel: "aviso",
        origem: ORIGEM_LOG,
        mensagem: `Liberação de ${dados.codigo}: ${divergencias.length} item(ns) com desenho diferente do código, mas ${usuario.nomeExibicao} não tem e-mail cadastrado; aviso não enviado.`,
      }).catch(() => {});
      return divergencias.length;
    }

    await avisarDivergencias(dados, usuario, divergencias);
    await registrarLog({
      nivel: "info",
      origem: ORIGEM_LOG,
      mensagem: `Liberação de ${dados.codigo}: ${divergencias.length} item(ns) com desenho diferente do código; aviso enviado para ${usuario.email}.`,
    }).catch(() => {});
    return divergencias.length;
  } catch (erro) {
    console.error(`Liberação de projeto ${dados.codigo}: falha na análise da estrutura:`, erro);
    await registrarLog({
      nivel: "aviso",
      origem: ORIGEM_LOG,
      mensagem: `Liberação de ${dados.codigo}: não foi possível conferir item x desenho na estrutura do ERP.`,
      detalhes: erro instanceof Error ? erro.message : String(erro),
    }).catch(() => {});
    return null;
  }
}
