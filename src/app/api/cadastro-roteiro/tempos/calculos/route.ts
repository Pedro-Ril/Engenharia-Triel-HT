import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { limparCodigoItem, registrarCalculo } from "@/lib/tempos-maquina/roteiro";
import { validarDadosPeca } from "@/lib/tempos-maquina/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inteiroOuNulo(valor: unknown): number | null {
  const n = Number(valor);
  return valor === null || valor === undefined || valor === "" || !Number.isInteger(n) ? null : n;
}

/*
 * A pessoa usou o tempo calculado: o servidor recalcula com o perfil
 * ativo da máquina, registra e devolve o tempo que vale.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("cadastro-roteiro");
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json().catch(() => null);
    if (!isObject(corpo)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    const codItem = limparCodigoItem(requiredText(corpo.codItem, "item", 40));
    if (!codItem) throw new ValidationError("Código do item inválido.");
    if (corpo.origemGeometria !== "dxf" && corpo.origemGeometria !== "manual") {
      throw new ValidationError("Origem da geometria inválida.");
    }

    const registro = await registrarCalculo({
      codItem,
      revisao: optionalText(corpo.revisao, "revisão", 20),
      alternativo: inteiroOuNulo(corpo.alternativo),
      seq: inteiroOuNulo(corpo.seq),
      codRecurso: requiredText(corpo.codRecurso, "máquina", 30),
      origemGeometria: corpo.origemGeometria,
      arquivoDxf: corpo.origemGeometria === "dxf" ? optionalText(corpo.arquivoDxf, "arquivo DXF", 400) : null,
      dados: validarDadosPeca(corpo.dados),
      contexto: {
        materiaPrima: optionalText(corpo.materiaPrima, "matéria-prima", 300),
        material: optionalText(corpo.material, "material", 100),
        peso3dx: optionalText(corpo.peso3dx, "peso", 30),
      },
      usuario: { id: acesso.usuario.id, nome: acesso.usuario.nomeExibicao },
    });

    return NextResponse.json({ ok: true, data: registro });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao registrar o cálculo de tempo:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível registrar o cálculo de tempo." }, { status: 500 });
  }
}

export const POST = comMetricasApi("cadastro-roteiro/tempos/calculos", handlePOST);
