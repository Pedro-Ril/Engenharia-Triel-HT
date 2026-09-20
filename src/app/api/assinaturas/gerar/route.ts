import { NextResponse } from "next/server";

import { buscarModeloPorId } from "@/lib/assinaturas/modelos";
import { criarAssinaturaGerada } from "@/lib/assinaturas/geradas";
import { sanitizarNomeArquivo, validarCorpoFormularioAssinatura } from "@/lib/assinaturas/validacao";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("assinaturas");
  if (acesso.negado) return acesso.negado;

  try {
    const parsedBody: unknown = await request.json();
    const { modeloId, nome, sobrenome, setor, email, celular, imagemConteudo } =
      validarCorpoFormularioAssinatura(parsedBody);

    const modelo = await buscarModeloPorId(modeloId);
    if (!modelo || !modelo.ativo) {
      throw new ValidationError("Modelo de assinatura não encontrado ou inativo.");
    }

    const nomeArquivo = `${sanitizarNomeArquivo(nome)}_${sanitizarNomeArquivo(sobrenome)}.png`;

    const assinatura = await criarAssinaturaGerada({
      modeloId,
      modeloNome: modelo.nome,
      usuarioId: acesso.usuario.id,
      usuarioNome: acesso.usuario.nomeExibicao,
      nome,
      sobrenome,
      setor,
      email,
      celular,
      imagem: { conteudo: imagemConteudo, tipoMime: "image/png" },
      nomeArquivo,
    });

    return NextResponse.json({ ok: true, message: "Assinatura gerada.", data: assinatura });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao gerar assinatura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível gerar a assinatura." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("assinaturas/gerar", handlePOST);
