import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { mensagemAvisoCodec, resolverStreamUriOnvif } from "@/lib/semaforo/onvif-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestarConexaoBody {
  host?: unknown;
  portaOnvif?: unknown;
  usuario?: unknown;
  senha?: unknown;
}

/*
 * Teste com os dados ainda no formulário, antes de salvar -- não toca
 * o banco nem o MediaMTX. Usado tanto no modal de "Adicionar câmera"
 * quanto no de edição (quando o usuário troca host/usuário/senha e
 * quer confirmar antes de gravar).
 */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    const body: TestarConexaoBody = parsedBody;

    const host = requiredText(body.host, "host/IP", 255);
    const portaOnvif = optionalInteger(body.portaOnvif, "porta ONVIF", 80);
    const usuario = requiredText(body.usuario, "usuário", 150);
    const senha = requiredText(body.senha, "senha", 300);

    const resolucao = await resolverStreamUriOnvif({ host, portaOnvif, usuario, senha });
    const avisoCodec = mensagemAvisoCodec(resolucao.codec);
    const mensagem = "Conexão realizada com sucesso.";

    return NextResponse.json({
      ok: true,
      message: mensagem,
      data: { sucesso: true, mensagem, perfilOnvif: resolucao.perfilOnvif, avisoCodec },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao testar conexão com câmera do Semáforo:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível testar a conexão com a câmera." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/semaforo/cameras/testar-conexao", handlePOST);
