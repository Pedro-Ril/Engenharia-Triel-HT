import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { ehAmbiente, listarExecucoes } from "@/lib/plugins-3dx/plugins-3dx";
import type {
  FiltroStatusExecucao3dx,
  GatilhoExecucao3dx,
} from "@/modules/plugins-3dx/types/plugins3dx.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: FiltroStatusExecucao3dx[] = [
  "pendente",
  "processando",
  "concluida",
  "parcial",
  "falha",
  "ignorada",
  "barrada",
  "cancelada",
];
const GATILHOS: GatilhoExecucao3dx[] = ["liberacao", "duplicacao", "noturna", "manual", "consulta"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const ambiente = url.searchParams.get("ambiente");
  const status = url.searchParams.get("status");
  const gatilho = url.searchParams.get("gatilho");
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  const pagina = Number(url.searchParams.get("pagina") ?? "1");

  try {
    const resultado = await listarExecucoes({
      ambiente: ehAmbiente(ambiente) ? ambiente : null,
      plugin: url.searchParams.get("plugin")?.slice(0, 40) || null,
      status: STATUS.includes(status as FiltroStatusExecucao3dx) ? (status as FiltroStatusExecucao3dx) : null,
      gatilho: GATILHOS.includes(gatilho as GatilhoExecucao3dx) ? (gatilho as GatilhoExecucao3dx) : null,
      busca: url.searchParams.get("busca")?.trim().slice(0, 200) || null,
      de: de && DATA.test(de) ? de : null,
      ate: ate && DATA.test(ate) ? ate : null,
      pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
    });
    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    console.error("Erro ao listar execuções dos Plugins 3DX:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível carregar as execuções." }, { status: 500 });
  }
}

export const GET = comMetricasApi("admin/plugins-3dx/execucoes", handleGET);
