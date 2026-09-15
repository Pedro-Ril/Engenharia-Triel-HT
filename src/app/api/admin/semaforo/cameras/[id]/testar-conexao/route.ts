import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import {
  buscarCameraPorId,
  buscarSenhaDecifrada,
  registrarResultadoVerificacao,
} from "@/lib/semaforo/cameras";
import { mensagemAvisoCodec, resolverStreamUriOnvif } from "@/lib/semaforo/onvif-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/*
 * Reteste de uma câmera já salva -- descriptografa a senha gravada no
 * servidor (nunca trafega pro cliente) e grava o resultado na própria
 * linha, igual ao que criarCamera/atualizarCamera já fazem ao salvar.
 */
async function handlePOST(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const camera = await buscarCameraPorId(id);
    if (!camera) {
      throw new ValidationError("Câmera não encontrada.");
    }

    const senha = await buscarSenhaDecifrada(id);
    if (!senha) {
      throw new ValidationError("Não foi possível recuperar a senha gravada desta câmera.");
    }

    try {
      const resolucao = await resolverStreamUriOnvif({
        host: camera.host,
        portaOnvif: camera.portaOnvif,
        usuario: camera.usuario,
        senha,
      });

      await registrarResultadoVerificacao(id, {
        sucesso: true,
        streamUriRtsp: resolucao.streamUriRtsp,
        perfilOnvif: resolucao.perfilOnvif,
      });

      const avisoCodec = mensagemAvisoCodec(resolucao.codec);
      const mensagem = "Conexão realizada com sucesso.";

      return NextResponse.json({
        ok: true,
        message: mensagem,
        data: { sucesso: true, mensagem, perfilOnvif: resolucao.perfilOnvif, avisoCodec },
      });
    } catch (error) {
      const mensagemErro = error instanceof Error ? error.message : "Erro desconhecido ao verificar a câmera.";
      await registrarResultadoVerificacao(id, { sucesso: false, mensagemErro });

      return NextResponse.json({
        ok: true,
        data: { sucesso: false, mensagem: mensagemErro },
      });
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao reverificar câmera do Semáforo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível reverificar a câmera." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/semaforo/cameras/[id]/testar-conexao", handlePOST);
