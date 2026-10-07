import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { carregarContextoAcao } from "@/lib/chamados/api-helpers";
import { buscarUsuarioPorId } from "@/lib/auth/usuarios";
import { adicionarUsuarioCopia, listarCopiaDoChamado } from "@/lib/chamados/chamados";
import { escopoDeCopia, mesmoDepartamento } from "@/lib/chamados/copia-escopo";
import { origemPublicaEfetivaChamados } from "@/lib/chamados/chamados-config";
import { notificarPessoaAdicionadaEmCopia } from "@/lib/chamados/notificacoes-email";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ numero: string }>;
}

/* Adiciona um usuário em cópia -- atendente do setor, admin (ambos via ehAtendente) ou o próprio dono do chamado. */
async function handlePOST(request: Request, context: RouteContext) {
  const { numero } = await context.params;
  const { contexto, erro } = await carregarContextoAcao(numero, null);
  if (erro) return erro;

  const { chamado, usuario, ehAtendente, ehDono } = contexto;

  if (!usuario || (!ehAtendente && !ehDono)) {
    return NextResponse.json(
      { ok: false, message: "Você não pode adicionar pessoas em cópia neste chamado." },
      { status: 403 }
    );
  }

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const usuarioId = requiredText((parsedBody as { usuarioId?: unknown }).usuarioId, "usuário", 36);

    /*
     * Solicitante comum só põe em cópia gente do próprio setor
     * (ver src/lib/chamados/copia-escopo.ts). Administrador, atendente
     * e gerência passam direto. A tela já filtra a lista, mas a recusa
     * tem que estar aqui: a lista é só uma sugestão do cliente.
     */
    const escopo = await escopoDeCopia(usuario);

    if (!escopo.irrestrito) {
      if (!escopo.departamento) {
        throw new ValidationError(
          "Seu usuário está sem setor cadastrado, então não é possível adicionar pessoas em cópia."
        );
      }

      const convidado = await buscarUsuarioPorId(usuarioId);

      if (!convidado || !convidado.ativo) {
        throw new ValidationError("Usuário informado não existe ou está inativo.");
      }

      if (!mesmoDepartamento(convidado.departamento, escopo.departamento)) {
        return NextResponse.json(
          {
            ok: false,
            message: "Você só pode adicionar em cópia pessoas do seu setor.",
          },
          { status: 403 }
        );
      }
    }

    await adicionarUsuarioCopia(chamado.id, usuarioId, usuario.id);
    const copia = await listarCopiaDoChamado(chamado.id);

    const pessoaAdicionada = copia.find((pessoa) => pessoa.usuarioId === usuarioId);
    if (pessoaAdicionada?.email) {
      await notificarPessoaAdicionadaEmCopia({
        chamado,
        destinatarioEmail: pessoaAdicionada.email,
        destinatarioNome: pessoaAdicionada.nome,
        autorNome: usuario.nomeExibicao,
        origem: await origemPublicaEfetivaChamados(request),
      });
    }

    return NextResponse.json({ ok: true, message: "Usuário adicionado em cópia.", data: copia });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao adicionar usuário em cópia:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível adicionar o usuário em cópia." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("chamados/[numero]/copia", handlePOST);
