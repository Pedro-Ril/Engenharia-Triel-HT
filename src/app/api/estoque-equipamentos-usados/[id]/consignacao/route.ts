import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { optionalText, requiredText } from "@/lib/auth/validation";
import {
  buscarEquipamentoPorId,
  registrarConsignacao,
} from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import {
  parseAnexosMovimentacaoFormData,
  salvarAnexosMovimentacao,
} from "@/lib/estoque-equipamentos-usados/movimentacoes-anexos";
import { tentarBuscarNfSaida } from "@/lib/estoque-equipamentos-usados/nf-saida-integracao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function optionalDecimal(value: FormDataEntryValue | null, fieldName: string): number | null {
  if (value === null || value === "") return null;
  const numero = Number(value);
  if (!Number.isFinite(numero)) {
    throw new ValidationError(`O campo ${fieldName} deve ser um número válido.`);
  }
  return numero;
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
    const destinatarioNome = requiredText(formData.get("destinatarioNome"), "destinatário", 200);
    const valor = optionalDecimal(formData.get("valor"), "valor");
    const dataEmissaoNf = optionalText(formData.get("dataEmissaoNf"), "data de emissão da NF", 10);
    const observacoes = optionalText(formData.get("observacoes"), "observações", 1000);
    const anexos = await parseAnexosMovimentacaoFormData(formData);

    /*
     * Só registra a "Tentativa de integração" aqui, na confirmação —
     * não na digitação/blur (ver rota .../nf-saida). Não bloqueia a
     * consignação se essa consulta falhar: tentarBuscarNfSaida nunca
     * lança, e o destinatário/valor já vieram do formulário.
     */
    const equipamentoAntes = await buscarEquipamentoPorId(id);
    if (equipamentoAntes?.codigoEmpresa) {
      await tentarBuscarNfSaida({
        equipamentoId: id,
        codigoEmpresa: equipamentoAntes.codigoEmpresa,
        numeroNf,
        idItem: equipamentoAntes.erpIdItem,
        tipoNf: "saida_consignacao",
        disparadoPor: usuario.nomeExibicao,
      });
    }

    const equipamento = await registrarConsignacao({
      equipamentoId: id,
      numeroNf,
      destinatarioNome,
      valor,
      dataEmissaoNf,
      observacoes,
      dataAcao: hoje(),
      criadoPorUsuarioId: usuario.id,
      criadoPorNome: usuario.nomeExibicao,
    });

    const movimentacao = equipamento.movimentacoes[equipamento.movimentacoes.length - 1];
    if (movimentacao) {
      await salvarAnexosMovimentacao(movimentacao.id, anexos, usuario.id, usuario.nomeExibicao);
    }

    return NextResponse.json({ ok: true, message: "Consignação registrada.", data: equipamento });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao registrar consignação de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar a consignação." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/consignacao", handlePOST);
