import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { obterPastasStep } from "@/lib/integra-tubest/integra-tubest-config";
import {
  indexarPastaStep,
  resolverArquivoDaPeca,
  type FonteIndice,
} from "@/lib/integra-tubest/step-arquivos";
import { registrarLog } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGEM_LOG = "integra-tubest/validar-step";

interface ItemValidacao {
  codigo?: unknown;
  codDesenho?: unknown;
}

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("integra-tubest");
  if (acesso.negado) return acesso.negado;

  try {
    const body = await request.json();
    const itens = Array.isArray(body?.itens) ? (body.itens as ItemValidacao[]) : [];

    /* Um código só é conferido uma vez, mesmo aparecendo em várias ordens. */
    const porCodigo = new Map<string, { codigo: string; codDesenho: string }>();

    for (const item of itens) {
      const codigo = String(item?.codigo ?? "").trim();
      const codDesenho = String(item?.codDesenho ?? "").trim();
      if (!codigo && !codDesenho) continue;

      const chave = `${codigo}__${codDesenho}`;
      if (!porCodigo.has(chave)) porCodigo.set(chave, { codigo, codDesenho });
    }

    if (porCodigo.size === 0) {
      return NextResponse.json(
        { ok: false, message: "Nenhum código foi informado para validação." },
        { status: 400 }
      );
    }

    let pastas;
    try {
      pastas = await obterPastasStep();
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      }
      throw error;
    }

    const fontes: FonteIndice[] = [
      { pasta: "principal", indice: await indexarPastaStep(pastas.principal) },
    ];

    /* A pasta da Ciber é opcional: sem ela, o módulo segue funcionando
       para todo o resto. */
    if (pastas.ciber) {
      fontes.push({ pasta: "ciber", indice: await indexarPastaStep(pastas.ciber) });
    }

    if (fontes[0].indice.size === 0) {
      await registrarLog({
        nivel: "aviso",
        origem: ORIGEM_LOG,
        mensagem: `Nenhum arquivo .step encontrado em ${pastas.principal}.`,
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

    const resultados = [...porCodigo.values()].map((item) =>
      resolverArquivoDaPeca(fontes, item.codigo, item.codDesenho)
    );

    const semStep = resultados.filter((item) => !item.existe).length;
    const duplicados = resultados.filter((item) => item.duplicado).length;
    const pelaCiber = resultados.filter((item) => item.pasta === "ciber").length;

    await registrarLog({
      nivel: semStep > 0 ? "aviso" : "info",
      origem: ORIGEM_LOG,
      mensagem:
        `${resultados.length} código(s) conferido(s): ${semStep} sem arquivo, ` +
        `${duplicados} com mais de um arquivo, ${pelaCiber} pela pasta da Ciber.`,
      detalhes:
        semStep > 0
          ? `Sem arquivo: ${resultados
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
        pelaCiber,
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
