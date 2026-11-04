import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText, requiredUuidArray } from "@/lib/auth/validation";
import { corrigirDadosErpNovo } from "@/lib/estoque-equipamentos-usados/ajustes-admin";
import { sincronizarExtrato } from "@/lib/estoque-equipamentos-usados/extrato-integracao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/*
 * Corrige o código do item e o ID configurado de um equipamento novo (só
 * administrador) -- ver ajustes-admin.ts -- e busca o extrato do ERP de
 * novo com os valores certos. Se o ERP falhar, a correção vale do mesmo
 * jeito: o agendador busca o extrato na próxima rodada.
 */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  if (!usuario.ehAdministrador) {
    return NextResponse.json({ ok: false, message: "Apenas administradores podem corrigir os dados do ERP." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const equipamentoId = requiredUuidArray([id], "equipamento")[0];
    const corpo: unknown = await request.json().catch(() => null);
    if (!isObject(corpo)) throw new ValidationError("Requisição inválida.");

    const resultado = await corrigirDadosErpNovo({
      id: equipamentoId,
      erpCodigoItem: optionalText(corpo.erpCodigoItem, "código do item no ERP", 50) ?? "",
      erpIdItem: optionalText(corpo.erpIdItem, "ID configurado", 50) ?? "",
      motivo: requiredText(corpo.motivo, "motivo", 500),
      usuarioNome: usuario.nomeExibicao,
    });

    let extratoAtualizado = false;
    /* Sem código e ID não há extrato para buscar. */
    if (resultado.erpCodigoItem && resultado.erpIdItem) {
      try {
        const [sincronizado] = await sincronizarExtrato({ equipamentoIds: [equipamentoId], disparadoPor: usuario.nomeExibicao });
        extratoAtualizado = Boolean(sincronizado && !sincronizado.erro);
      } catch (erro) {
        console.error("Dados do ERP corrigidos, mas o extrato não foi buscado agora:", erro);
      }
    }

    return NextResponse.json({
      ok: true,
      message:
        !resultado.erpCodigoItem || !resultado.erpIdItem
          ? "Código e ID corrigidos. Sem os dois preenchidos, o extrato do ERP não é consultado."
          : extratoAtualizado
            ? "Código e ID corrigidos. O extrato do ERP foi buscado de novo."
            : "Código e ID corrigidos. O extrato do ERP será buscado na próxima atualização automática.",
      data: { ...resultado, extratoAtualizado },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao corrigir os dados do ERP do equipamento:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível corrigir os dados do ERP." }, { status: 500 });
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/dados-erp", handlePOST);
