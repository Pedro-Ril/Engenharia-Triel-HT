import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { optionalText, requiredText } from "@/lib/auth/validation";
import {
  registrarBaixa,
  type MotivoBaixa,
} from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import {
  parseAnexosMovimentacaoFormData,
  salvarAnexosMovimentacao,
} from "@/lib/estoque-equipamentos-usados/movimentacoes-anexos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";
const MOTIVOS_VALIDOS: MotivoBaixa[] = ["venda", "descarte", "perda", "outro"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function requiredMotivoBaixa(value: FormDataEntryValue | null): MotivoBaixa {
  if (typeof value !== "string" || !(MOTIVOS_VALIDOS as string[]).includes(value)) {
    throw new ValidationError("Informe um motivo de baixa válido (venda, descarte, perda ou outro).");
  }
  return value as MotivoBaixa;
}

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { id } = await context.params;

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição deve ser multipart/form-data." },
      { status: 400 }
    );
  }

  try {
    const numeroNf = requiredText(formData.get("numeroNf"), "número da NF", 30);
    const motivoBaixa = requiredMotivoBaixa(formData.get("motivoBaixa"));
    const destinatarioNome = optionalText(formData.get("destinatarioNome"), "destinatário", 200);
    const observacoes = optionalText(formData.get("observacoes"), "observações", 1000);
    const anexos = await parseAnexosMovimentacaoFormData(formData);

    const equipamento = await registrarBaixa({
      equipamentoId: id,
      numeroNf,
      motivoBaixa,
      destinatarioNome,
      observacoes,
      dataAcao: hoje(),
      criadoPorUsuarioId: usuario.id,
      criadoPorNome: usuario.nomeExibicao,
    });

    const movimentacao = equipamento.movimentacoes[equipamento.movimentacoes.length - 1];
    if (movimentacao) {
      await salvarAnexosMovimentacao(movimentacao.id, anexos, usuario.id, usuario.nomeExibicao);
    }

    return NextResponse.json({ ok: true, message: "Baixa registrada.", data: equipamento });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao registrar baixa de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar a baixa." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/baixa", handlePOST);
