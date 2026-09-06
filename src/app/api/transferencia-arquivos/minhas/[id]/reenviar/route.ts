import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import {
  montarBotaoEmailHtml,
  montarCartaoArquivosEmailHtml,
  montarCitacaoEmailHtml,
  montarEmailHtml,
  montarLinkEmailHtml,
} from "@/lib/smtp/template-email";
import { buscarTransferenciaPorId, marcarEmailEnviado } from "@/lib/transferencia/transferencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatarTempoRestante(expiraEmIso: string): string {
  const horas = Math.max(1, Math.round((new Date(expiraEmIso).getTime() - Date.now()) / 3_600_000));
  if (horas % 24 === 0 && horas >= 24) {
    const dias = horas / 24;
    return `${dias} dia${dias === 1 ? "" : "s"}`;
  }
  return `${horas} hora${horas === 1 ? "" : "s"}`;
}

/*
 * Reenvia o mesmo e-mail de compartilhamento pro destinatário já
 * registrado — não muda nada na transferência (prazo, arquivos), só
 * manda o link de novo, pra quem perdeu o e-mail original ou não
 * recebeu por algum problema de entrega.
 */
async function handlePOST(request: Request, { params }: RouteParams) {
  const acesso = await verificarAcessoModuloApi("transferencia-arquivos");
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { id } = await params;

  const transferencia = await buscarTransferenciaPorId(id);
  if (!transferencia) {
    return NextResponse.json({ ok: false, message: "Transferência não encontrada." }, { status: 404 });
  }

  if (transferencia.enviadoPorUsuarioId !== usuario.id && !usuario.ehAdministrador) {
    return NextResponse.json(
      { ok: false, message: "Você não tem permissão para reenviar esta transferência." },
      { status: 403 }
    );
  }

  if (!transferencia.destinatarioEmail) {
    return NextResponse.json(
      { ok: false, message: "Esta transferência não tem um e-mail de destinatário registrado." },
      { status: 400 }
    );
  }

  if (new Date(transferencia.expiraEm).getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, message: "Este link já expirou." }, { status: 400 });
  }

  const destinatarios = transferencia.destinatarioEmail.split(";").map((email) => email.trim());
  const linkDownload = `${new URL(request.url).origin}/baixar/${transferencia.token}`;
  const descricaoArquivos =
    transferencia.arquivos.length === 1
      ? "um arquivo"
      : `${transferencia.arquivos.length} arquivos`;

  try {
    await enviarEmail({
      destinatario: destinatarios,
      assunto: `${usuario.nomeExibicao} reenviou o link de um arquivo compartilhado — Portal Triel-HT`,
      corpoHtml: montarEmailHtml(`
        <p style="margin: 0 0 18px; font-size: 16px;">
          <strong>${usuario.nomeExibicao}</strong> reenviou o link para baixar ${descricaoArquivos}.
        </p>

        ${montarCartaoArquivosEmailHtml(
          transferencia.arquivos.map((arquivo) => ({
            nome: arquivo.nomeOriginal,
            tamanho: formatarTamanho(arquivo.tamanhoBytes),
          }))
        )}

        ${transferencia.mensagem ? montarCitacaoEmailHtml(transferencia.mensagem) : ""}

        ${montarBotaoEmailHtml("Baixar" + (transferencia.arquivos.length > 1 ? " arquivos" : " arquivo"), linkDownload)}

        ${montarLinkEmailHtml(linkDownload)}

        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          Este link expira em ${formatarTempoRestante(transferencia.expiraEm)}.
        </p>
      `),
      corpoTexto: `${usuario.nomeExibicao} reenviou o link para baixar ${descricaoArquivos}.\n${linkDownload}\nEste link expira em ${formatarTempoRestante(transferencia.expiraEm)}.`,
    });

    await marcarEmailEnviado(transferencia.id);

    return NextResponse.json({
      ok: true,
      message: "Link reenviado.",
      data: { ...transferencia, emailEnviado: true },
    });
  } catch (error) {
    console.error("Erro ao reenviar link de transferência:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível reenviar o e-mail. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("transferencia-arquivos/minhas/[id]/reenviar", handlePOST);
