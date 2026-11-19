import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { registrarLog } from "@/lib/monitoramento/logs";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import { montarBotaoEmailHtml, montarEmailHtml, montarLinkEmailHtml } from "@/lib/smtp/template-email";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Título e nomes vêm digitados por gente: nunca entram crus no HTML do e-mail. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * Aviso por e-mail a quem acabou de RECEBER uma página do Bloco de Notas.
 * Só na entrada da pessoa (não na troca de permissão nem na remoção) --
 * para não virar spam. Sem e-mail cadastrado, não avisa.
 *
 * Nunca falha: o compartilhamento já está gravado; erro de SMTP vai só para
 * o log geral (Monitoramento), como nos avisos de Aprovações.
 *
 * O e-mail leva só o título da página, nunca o conteúdo: o conteúdo só
 * existe dentro do portal, para quem tem acesso.
 */
export async function avisarCompartilhamentoSemFalhar(params: {
  paginaId: string;
  usuarioAlvoId: string;
  donoNome: string;
  permissao: "ver" | "editar";
  origem: string;
}): Promise<void> {
  let destinatario: string | null = null;

  try {
    const pool = await getSqlServerPool();
    const result = await pool
      .request()
      .input("paginaId", sql.UniqueIdentifier, params.paginaId)
      .input("alvo", sql.UniqueIdentifier, params.usuarioAlvoId)
      .query<{ nome: string; email: string | null; titulo: string }>(`
        SELECT u.[nome_exibicao] AS [nome], u.[email], p.[titulo]
        FROM dbo.portal_usuarios AS u
        CROSS JOIN dbo.portal_notas_paginas AS p
        WHERE u.[id] = @alvo AND p.[id] = @paginaId;
      `);

    const linha = result.recordset[0];
    const email = linha?.email?.trim();
    if (!linha || !email || !EMAIL_REGEX.test(email)) return;
    destinatario = email;

    const titulo = linha.titulo.trim() || "Sem título";
    const permissaoTexto = params.permissao === "editar" ? "pode ver e editar" : "pode ver (só leitura)";
    const link = `${params.origem.replace(/\/+$/, "")}/bloco-notas?pagina=${params.paginaId}`;

    await enviarEmail({
      destinatario: email,
      assunto: `${params.donoNome} compartilhou "${titulo}" com você — Portal Triel-HT`,
      corpoHtml: montarEmailHtml(`
        <p style="margin: 0 0 18px; font-size: 16px;">Olá, <strong>${escapar(linha.nome)}</strong>!</p>
        <p style="margin: 0 0 18px;">
          <strong>${escapar(params.donoNome)}</strong> compartilhou a página
          <strong>${escapar(titulo)}</strong> do Bloco de Notas com você. Você ${permissaoTexto}.
        </p>
        ${montarBotaoEmailHtml("Abrir a página", link)}
        ${montarLinkEmailHtml(link)}
        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          Ela também aparece em "Compartilhadas comigo", no Bloco de Notas do portal.
        </p>
      `),
      corpoTexto: `Olá, ${linha.nome}!\n\n${params.donoNome} compartilhou a página "${titulo}" do Bloco de Notas com você. Você ${permissaoTexto}.\n\nAbrir a página: ${link}\n\nEla também aparece em "Compartilhadas comigo", no Bloco de Notas do portal.`,
    });
  } catch (error) {
    console.error("Erro ao avisar compartilhamento do Bloco de Notas:", error);
    await registrarLog({
      nivel: "erro",
      origem: "bloco-notas/email",
      mensagem: `Falha ao avisar ${destinatario ?? "o destinatário"} do compartilhamento de uma página.`,
      detalhes: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
  }
}
