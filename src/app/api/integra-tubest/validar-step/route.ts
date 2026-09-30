import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { obterPastaStep } from "@/lib/integra-tubest/integra-tubest-config";
import { indexarPastaStep, validarCodigoNoIndice } from "@/lib/integra-tubest/step-arquivos";
import { registrarLog } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGEM_LOG = "integra-tubest/validar-step";

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("integra-tubest");
  if (acesso.negado) return acesso.negado;

  try {
    const body = await request.json();
    const codigos = Array.isArray(body?.codigos) ? (body.codigos as unknown[]) : [];

    /* Um código só é validado uma vez, mesmo aparecendo em várias ordens. */
    const normalizados = [
      ...new Set(codigos.map((codigo) => String(codigo ?? "").trim()).filter(Boolean)),
    ];

    if (!normalizados.length) {
      return NextResponse.json(
        { ok: false, message: "Nenhum código foi informado para validação." },
        { status: 400 }
      );
    }

    let pastaStep: string;
    try {
      pastaStep = await obterPastaStep();
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      }
      throw error;
    }

    const indice = await indexarPastaStep(pastaStep);

    if (indice.size === 0) {
      await registrarLog({
        nivel: "aviso",
        origem: ORIGEM_LOG,
        mensagem: `Nenhum arquivo .step encontrado em ${pastaStep}.`,
        detalhes: "Pasta vazia, inacessível pelo servidor ou caminho configurado errado.",
      });

      return NextResponse.json(
        {
          ok: false,
          message:
            "Não foi possível ler a pasta de STEP configurada. Verifique o caminho e o acesso do servidor à rede.",
        },
        { status: 400 }
      );
    }

    const resultados = normalizados.map((codigo) => validarCodigoNoIndice(indice, codigo));

    const semStep = resultados.filter((item) => !item.existe).length;
    const duplicados = resultados.filter((item) => item.duplicado).length;

    await registrarLog({
      nivel: semStep > 0 ? "aviso" : "info",
      origem: ORIGEM_LOG,
      mensagem: `${resultados.length} código(s) conferido(s): ${semStep} sem STEP, ${duplicados} com mais de um arquivo.`,
      detalhes:
        semStep > 0
          ? `Sem STEP: ${resultados
              .filter((item) => !item.existe)
              .map((item) => item.codigo)
              .join(", ")
              .slice(0, 3000)}`
          : null,
    });

    return NextResponse.json({
      ok: true,
      data: {
        total: resultados.length,
        semStep,
        duplicados,
        resultados,
      },
    });
  } catch (error) {
    console.error("Erro ao validar STEP:", error);

    await registrarLog({
      nivel: "erro",
      origem: ORIGEM_LOG,
      mensagem: "Erro inesperado ao conferir os arquivos STEP.",
      detalhes: error instanceof Error ? error.stack ?? error.message : String(error),
    });

    return NextResponse.json(
      { ok: false, message: "Erro interno ao conferir os arquivos STEP." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("integra-tubest/validar-step", handlePOST);
