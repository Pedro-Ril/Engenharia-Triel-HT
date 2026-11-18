import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { lerPerfilOficial, publicarPerfilOficial } from "@/lib/workstations-nvidia/perfil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await lerPerfilOficial() });
  } catch (error) {
    console.error("Erro ao ler o perfil oficial NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível ler o perfil oficial." },
      { status: 500 }
    );
  }
}

/* Upload (multipart, campo "arquivo") de um .nip para virar o perfil oficial. */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const formData = await request.formData().catch(() => null);
    const arquivo = formData?.get("arquivo");

    if (!(arquivo instanceof File)) {
      throw new ValidationError("Selecione um arquivo .nip exportado pelo NVIDIA Profile Inspector.");
    }
    if (!arquivo.name.toLowerCase().endsWith(".nip")) {
      throw new ValidationError("O arquivo precisa ter a extensão .nip.");
    }

    const { perfil, removidas } = await publicarPerfilOficial({
      bytes: Buffer.from(await arquivo.arrayBuffer()),
      nomeArquivoOriginal: arquivo.name,
      publicadoPor: acesso.usuario.nomeExibicao,
    });

    const message =
      `Perfil oficial publicado com ${perfil.configuracoes.length} configuração(ões).` +
      (removidas.length > 0
        ? ` ${removidas.length} configuração(ões) gerenciada(s) pelo driver foram removidas (ex: ${removidas[0].configuracao || removidas[0].configuracaoId}).`
        : "");

    return NextResponse.json({ ok: true, message, data: perfil });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao publicar o perfil oficial NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível publicar o perfil." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/workstations-nvidia/perfil", handleGET);
export const POST = comMetricasApi("admin/workstations-nvidia/perfil", handlePOST);
