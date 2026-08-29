import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import {
  buscarUltimaSincronizacao,
  listarItensMateriaPrimaCache,
} from "@/lib/materias-primas/materias-primas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("depara-materia-prima");
  if (acesso.negado) return acesso.negado;

  const codEmpresa = acesso.usuario.codigoEmpresa;

  if (!codEmpresa) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Seu usuário não tem um código de empresa configurado. Peça para um administrador preencher esse campo em Administração > Usuários.",
      },
      { status: 400 }
    );
  }

  try {
    const [itens, ultimaSincronizacao] = await Promise.all([
      listarItensMateriaPrimaCache(codEmpresa),
      buscarUltimaSincronizacao(codEmpresa),
    ]);

    return NextResponse.json({ ok: true, data: { itens, ultimaSincronizacao } });
  } catch (error) {
    console.error("Erro ao listar itens de matéria-prima:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os itens de matéria-prima." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("materias-primas/itens", handleGET);
