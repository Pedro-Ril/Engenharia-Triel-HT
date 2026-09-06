import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import {
  montarBotaoEmailHtml,
  montarCartaoArquivosEmailHtml,
  montarEmailHtml,
  montarLinkEmailHtml,
} from "@/lib/smtp/template-email";
import {
  duracaoMaximaHorasEfetiva,
  origemPublicaEfetiva,
} from "@/lib/transferencia/transferencia-config";
import {
  atualizarExpiracao,
  excluirTransferencia,
  type Transferencia,
} from "@/lib/transferencia/transferencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface EditarExpiracaoBody {
  expirarAgora?: unknown;
  duracaoQuantidade?: unknown;
  duracaoUnidade?: unknown;
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatarDuracao(horas: number): string {
  if (horas % 24 === 0 && horas >= 24) {
    const dias = horas / 24;
    return `${dias} dia${dias === 1 ? "" : "s"}`;
  }
  return `${horas} hora${horas === 1 ? "" : "s"}`;
}

/*
 * Pedido explícito: quem recebeu o link deve ser avisado quando quem
 * enviou muda o prazo ou encerra o compartilhamento antes da hora —
 * sem isso, o destinatário só descobre quando o link já não funciona
 * mais. Falha no envio desse aviso não desfaz a alteração (o prazo já
 * mudou de verdade) — só fica sem o aviso, igual ao comportamento já
 * usado no upload quando o e-mail inicial falha.
 */
async function avisarDestinatarios(
  transferencia: Transferencia,
  remetenteNome: string,
  request: Request,
  expirouAgora: boolean
): Promise<void> {
  if (!transferencia.destinatarioEmail) return;

  const destinatarios = transferencia.destinatarioEmail.split(";").map((email) => email.trim());
  const linkDownload = `${await origemPublicaEfetiva(request)}/baixar/${transferencia.token}`;
  const cartaoArquivos = montarCartaoArquivosEmailHtml(
    transferencia.arquivos.map((arquivo) => ({
      nome: arquivo.nomeOriginal,
      tamanho: formatarTamanho(arquivo.tamanhoBytes),
    }))
  );
  const descricaoArquivos =
    transferencia.arquivos.length === 1
      ? transferencia.arquivos[0].nomeOriginal
      : `${transferencia.arquivos.length} arquivos`;

  if (expirouAgora) {
    await enviarEmail({
      destinatario: destinatarios,
      assunto: `Um arquivo compartilhado com você não está mais disponível — Portal Triel-HT`,
      corpoHtml: montarEmailHtml(`
        <p style="margin: 0 0 18px; font-size: 16px;">
          <strong>${remetenteNome}</strong> encerrou o compartilhamento abaixo antes do prazo original.
        </p>

        ${cartaoArquivos}

        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          O link não funciona mais.
        </p>
      `),
      corpoTexto: `${remetenteNome} encerrou o compartilhamento de ${descricaoArquivos} antes do prazo original. O link não funciona mais.`,
    });
    return;
  }

  const duracaoTexto = formatarDuracao(
    Math.round(
      (new Date(transferencia.expiraEm).getTime() - Date.now()) / 3_600_000
    )
  );

  await enviarEmail({
    destinatario: destinatarios,
    assunto: `O prazo para baixar um arquivo foi alterado — Portal Triel-HT`,
    corpoHtml: montarEmailHtml(`
      <p style="margin: 0 0 18px; font-size: 16px;">
        <strong>${remetenteNome}</strong> atualizou o prazo do que foi compartilhado com você.
      </p>

      ${cartaoArquivos}

      ${montarBotaoEmailHtml("Baixar arquivos", linkDownload)}

      ${montarLinkEmailHtml(linkDownload)}

      <p style="margin: 0; font-size: 13px; color: #6b7280;">
        Novo prazo: expira em ${duracaoTexto}.
      </p>
    `),
    corpoTexto: `${remetenteNome} atualizou o prazo de ${descricaoArquivos}.\n${linkDownload}\nNovo prazo: expira em ${duracaoTexto}.`,
  });
}

/*
 * Também usada pelo painel de admin — mesmo bypass de
 * verificarAcessoModuloApi pra administrador que a exclusão já usa.
 */
async function handlePATCH(request: Request, { params }: RouteParams) {
  const acesso = await verificarAcessoModuloApi("transferencia-arquivos");
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { id } = await params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body = parsedBody as EditarExpiracaoBody;

    const expirarAgora = body.expirarAgora === true;
    let duracaoHoras: number;

    if (expirarAgora) {
      duracaoHoras = 0;
    } else {
      const quantidade = Number(body.duracaoQuantidade);
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        throw new ValidationError("Informe uma duração válida para o link.");
      }

      const unidade = body.duracaoUnidade;
      if (unidade !== "horas" && unidade !== "dias") {
        throw new ValidationError("A unidade de duração deve ser 'horas' ou 'dias'.");
      }

      duracaoHoras = unidade === "dias" ? quantidade * 24 : quantidade;

      const duracaoMaximaHoras = await duracaoMaximaHorasEfetiva();
      if (duracaoHoras > duracaoMaximaHoras) {
        throw new ValidationError(
          `A duração máxima permitida para o link é de ${duracaoMaximaHoras} horas.`
        );
      }
    }

    const transferencia = await atualizarExpiracao(id, usuario, duracaoHoras);

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, message: "Transferência não encontrada." },
        { status: 404 }
      );
    }

    try {
      await avisarDestinatarios(transferencia, usuario.nomeExibicao, request, expirarAgora);
    } catch (error) {
      console.error("Erro ao avisar destinatário sobre alteração de expiração:", error);
    }

    return NextResponse.json({
      ok: true,
      message: expirarAgora ? "Link expirado." : "Expiração atualizada.",
      data: transferencia,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao editar expiração da transferência:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a transferência." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("transferencia-arquivos/minhas/[id]", handlePATCH);

/*
 * Também usada pelo painel de admin (excluirTransferenciaAdmin) pra
 * apagar transferência de qualquer usuário — verificarAcessoModuloApi
 * já libera administradores independente de permissão explícita ao
 * módulo, então o bypass de admin continua funcionando aqui.
 */
async function handleDELETE(_request: Request, { params }: RouteParams) {
  const acesso = await verificarAcessoModuloApi("transferencia-arquivos");
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { id } = await params;

  try {
    const excluido = await excluirTransferencia(id, usuario);

    if (!excluido) {
      return NextResponse.json(
        { ok: false, message: "Transferência não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Transferência excluída." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 403 });
    }

    console.error("Erro ao excluir transferência:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a transferência." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("transferencia-arquivos/minhas/[id]", handleDELETE);
