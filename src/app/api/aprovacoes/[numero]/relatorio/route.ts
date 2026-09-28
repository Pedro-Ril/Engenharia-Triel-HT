import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { montarRelatorioSolicitacao } from "@/lib/aprovacoes/aprovacoes";
import {
  buscarConfigAprovacoes,
  origemPublicaEfetivaAprovacoes,
} from "@/lib/aprovacoes/config";
import { enviarRelatorioSolicitacao } from "@/lib/aprovacoes/notificacoes-email";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Quem envia é o solicitante, então o gate é o módulo de criar -- não o painel da direção. */
const MODULO_CHAVE = "aprovacoes-solicitar-aumento";

interface RouteContext {
  params: Promise<{ numero: string }>;
}

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { numero: numeroParam } = await context.params;
  const numero = Number(numeroParam);

  if (!Number.isInteger(numero) || numero <= 0) {
    return NextResponse.json({ ok: false, message: "Número de solicitação inválido." }, { status: 400 });
  }

  try {
    const config = await buscarConfigAprovacoes();

    if (!config.emailRelatorio) {
      throw new ValidationError(
        "Nenhum e-mail de destino configurado para o relatório — peça ao administrador em Administração → Diretoria → Relatório."
      );
    }

    const relatorio = await montarRelatorioSolicitacao(numero, usuario.id);
    await enviarRelatorioSolicitacao(relatorio, config.emailRelatorio, await origemPublicaEfetivaAprovacoes(request));

    await registrarLog({
      nivel: "info",
      origem: "aprovacoes",
      mensagem: `${usuario.nomeExibicao} enviou o relatório da solicitação #${numero} para ${config.emailRelatorio}.`,
      detalhes: JSON.stringify({ numero, aprovados: relatorio.aprovados.length }),
      metodo: "POST",
      caminho: `/api/aprovacoes/${numero}/relatorio`,
      ipOrigem: extrairIpOrigem(request),
    });

    return NextResponse.json({
      ok: true,
      message: `Relatório com ${relatorio.aprovados.length} colaborador(es) aprovado(s) enviado para ${config.emailRelatorio}.`,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao enviar relatório da solicitação:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível enviar o relatório por e-mail." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("aprovacoes/[numero]/relatorio", handlePOST);
