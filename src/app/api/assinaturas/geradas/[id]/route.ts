import { NextResponse } from "next/server";

import { atualizarAssinaturaGerada, buscarAssinaturaGerada, excluirAssinaturaGerada } from "@/lib/assinaturas/geradas";
import { buscarModeloPorId } from "@/lib/assinaturas/modelos";
import { sanitizarNomeArquivo, uniqueIdentifierPattern, validarCorpoFormularioAssinatura } from "@/lib/assinaturas/validacao";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Lista/edição/exclusão de assinaturas são compartilhadas -- qualquer usuário com acesso ao módulo pode editar/excluir qualquer assinatura, não só quem gerou (decisão do usuário: mesmo espírito do formulário livre). */
async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("assinaturas");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
  }

  try {
    const existente = await buscarAssinaturaGerada(id);
    if (!existente) {
      return NextResponse.json({ ok: false, message: "Assinatura não encontrada." }, { status: 404 });
    }

    const parsedBody: unknown = await request.json();
    const { modeloId, nome, sobrenome, setor, email, celular, imagemConteudo } =
      validarCorpoFormularioAssinatura(parsedBody);

    const modelo = await buscarModeloPorId(modeloId);
    if (!modelo || !modelo.ativo) {
      throw new ValidationError("Modelo de assinatura não encontrado ou inativo.");
    }

    const nomeArquivo = `${sanitizarNomeArquivo(nome)}_${sanitizarNomeArquivo(sobrenome)}.png`;

    const assinatura = await atualizarAssinaturaGerada(id, {
      modeloId,
      modeloNome: modelo.nome,
      nome,
      sobrenome,
      setor,
      email,
      celular,
      imagem: { conteudo: imagemConteudo, tipoMime: "image/png" },
      nomeArquivo,
      editadoPor: acesso.usuario,
    });

    return NextResponse.json({ ok: true, message: "Assinatura atualizada.", data: assinatura });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar assinatura gerada:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar a assinatura." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("assinaturas/geradas/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("assinaturas");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
  }

  try {
    const excluida = await excluirAssinaturaGerada(id, acesso.usuario);

    if (!excluida) {
      return NextResponse.json({ ok: false, message: "Assinatura não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Assinatura excluída." });
  } catch (error) {
    console.error("Erro ao excluir assinatura gerada:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir a assinatura." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("assinaturas/geradas/[id]", handleDELETE);
