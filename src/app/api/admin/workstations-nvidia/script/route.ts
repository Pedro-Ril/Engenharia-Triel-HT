import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Serve o script da workstation direto do repositório
 * (workstations-nvidia/Verificar-PerfilNvidia.ps1), com os bytes
 * intactos: o arquivo é UTF-8 com BOM, que o PowerShell 5.1 precisa
 * para ler os acentos certo.
 */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const caminho = path.join(process.cwd(), "workstations-nvidia", "Verificar-PerfilNvidia.ps1");
    const conteudo = await readFile(caminho);

    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="Verificar-PerfilNvidia.ps1"',
      },
    });
  } catch (error) {
    console.error("Erro ao servir o script de Workstations NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível baixar o script." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/workstations-nvidia/script", handleGET);
