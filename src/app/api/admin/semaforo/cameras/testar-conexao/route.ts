import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, optionalText, requiredChave, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarSenhaDecifrada } from "@/lib/semaforo/cameras";
import { montarWhepUrl, registrarCameraNoMediaMtx, removerCameraDoMediaMtx } from "@/lib/semaforo/mediamtx";
import { mensagemAvisoCodec, resolverStreamUriOnvif } from "@/lib/semaforo/onvif-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestarConexaoBody {
  id?: unknown;
  host?: unknown;
  portaOnvif?: unknown;
  usuario?: unknown;
  senha?: unknown;
  mediamtxPathPreview?: unknown;
}

/*
 * Teste + preview ao vivo com os dados ainda no formulário, antes de
 * salvar -- registra um path TEMPORÁRIO no MediaMTX (gerado no
 * cliente, reaproveitado a cada novo teste da mesma sessão do modal
 * via PATCH; removido com DELETE quando o modal fecha, ver handleDELETE
 * abaixo) pra devolver uma URL WHEP de verdade, permitindo mostrar
 * vídeo ao vivo mesmo antes da câmera existir no banco.
 *
 * "id" é opcional -- quando presente e "senha" vem em branco, cai pra
 * senha já cifrada dessa câmera (edição sem precisar redigitar senha
 * só pra poder testar host/usuário alterados).
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

    const id = optionalText(body.id, "id", 36);
    const host = requiredText(body.host, "host/IP", 255);
    const portaOnvif = optionalInteger(body.portaOnvif, "porta ONVIF", 80);
    const usuario = requiredText(body.usuario, "usuário", 150);
    const mediamtxPathPreview = requiredChave(body.mediamtxPathPreview, "path de preview");

    const senhaDigitada = optionalText(body.senha, "senha", 300);
    const senha = senhaDigitada ?? (id ? await buscarSenhaDecifrada(id) : null);

    if (!senha) {
      throw new ValidationError("Informe a senha para testar a conexão.");
    }

    const resolucao = await resolverStreamUriOnvif({ host, portaOnvif, usuario, senha });
    const avisoCodec = mensagemAvisoCodec(resolucao.codec);

    await registrarCameraNoMediaMtx({
      mediamtxPath: mediamtxPathPreview,
      streamUriRtsp: resolucao.streamUriRtsp,
      usuario,
      senha,
    });

    const whepUrl = await montarWhepUrl(mediamtxPathPreview);
    const mensagem = "Conexão realizada com sucesso.";

    return NextResponse.json({
      ok: true,
      message: mensagem,
      data: { sucesso: true, mensagem, perfilOnvif: resolucao.perfilOnvif, avisoCodec, whepUrl },
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

/* Remove o path temporário de preview do MediaMTX -- chamado quando o modal de cadastro/edição fecha (salvando ou não). */
async function handleDELETE(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const path = new URL(request.url).searchParams.get("path");

  if (!path) {
    return NextResponse.json({ ok: false, message: "Informe o path a remover." }, { status: 400 });
  }

  try {
    requiredChave(path, "path");
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    throw error;
  }

  await removerCameraDoMediaMtx(path);

  return NextResponse.json({ ok: true });
}

export const DELETE = comMetricasApi("admin/semaforo/cameras/testar-conexao", handleDELETE);
