import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { optionalText, requiredText } from "@/lib/auth/validation";
import {
  atualizarDadosEquipamento,
  buscarEquipamentoPorId,
} from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import {
  listarBlocosDoTipo,
  listarCamposDoTipo,
  validarValoresCamposDinamicos,
} from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { parseEvidenciasFormData, salvarEvidencias } from "@/lib/estoque-equipamentos-usados/evidencias";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";
import type { CampoTipoEquipamento } from "@/modules/estoque-equipamentos-usados/types/estoque.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function optionalDecimal(value: FormDataEntryValue | null, fieldName: string): number | null {
  if (value === null || value === "") return null;
  const numero = Number(value);
  if (!Number.isFinite(numero)) {
    throw new ValidationError(`O campo ${fieldName} deve ser um número válido.`);
  }
  return numero;
}

interface AlteracaoDadosTecnicos {
  campo: string;
  rotulo: string;
  de: unknown;
  para: unknown;
}

function valoresDiferentes(a: unknown, b: unknown): boolean {
  const normalizar = (valor: unknown) => (valor === undefined || valor === "" ? null : valor);
  const normalizadoA = normalizar(a);
  const normalizadoB = normalizar(b);

  if (Array.isArray(normalizadoA) || Array.isArray(normalizadoB)) {
    return JSON.stringify(normalizadoA) !== JSON.stringify(normalizadoB);
  }

  return normalizadoA !== normalizadoB;
}

/*
 * Compara o equipamento antes/depois pra montar o histórico exibido aos
 * usuários e o log de auditoria — só grava o que de fato mudou, campo a
 * campo (inclusive dinâmicos), com o rótulo já resolvido pro nome amigável.
 */
function calcularAlteracoesDadosTecnicos(
  camposDinamicos: CampoTipoEquipamento[],
  antes: { nomeCliente: string | null; valor: number | null; camposValores: Record<string, unknown> | null },
  depois: { nomeCliente: string | null; valor: number | null; camposValores: Record<string, unknown> | null }
): AlteracaoDadosTecnicos[] {
  const alteracoes: AlteracaoDadosTecnicos[] = [];

  if (valoresDiferentes(antes.nomeCliente, depois.nomeCliente)) {
    alteracoes.push({ campo: "nomeCliente", rotulo: "Cliente", de: antes.nomeCliente, para: depois.nomeCliente });
  }

  if (valoresDiferentes(antes.valor, depois.valor)) {
    alteracoes.push({ campo: "valor", rotulo: "Valor", de: antes.valor, para: depois.valor });
  }

  for (const campo of camposDinamicos) {
    const valorAntes = antes.camposValores?.[campo.chave] ?? null;
    const valorDepois = depois.camposValores?.[campo.chave] ?? null;

    if (valoresDiferentes(valorAntes, valorDepois)) {
      alteracoes.push({ campo: campo.chave, rotulo: campo.rotulo, de: valorAntes, para: valorDepois });
    }
  }

  return alteracoes;
}

async function handlePATCH(request: Request, context: RouteContext) {
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
    const equipamento = await buscarEquipamentoPorId(id);
    if (!equipamento) {
      return NextResponse.json({ ok: false, message: "Equipamento não encontrado." }, { status: 404 });
    }

    if (!equipamento.tipoEquipamentoId) {
      throw new ValidationError("Este equipamento não tem um tipo definido.");
    }

    const nomeCliente = optionalText(formData.get("nomeCliente"), "cliente", 200);
    const codigoCliente = optionalText(formData.get("codigoCliente"), "código do cliente", 30);
    const valor = optionalDecimal(formData.get("valor"), "valor");
    /* Obrigatório em toda edição de dados técnicos — fica registrado junto com o histórico de alterações. */
    const motivo = requiredText(formData.get("motivo"), "motivo da alteração", 500);

    const camposDoTipo = await listarCamposDoTipo(equipamento.tipoEquipamentoId, true);

    const valoresBrutosTexto = formData.get("camposValores");
    let valoresBrutos: unknown = {};
    if (typeof valoresBrutosTexto === "string" && valoresBrutosTexto.trim()) {
      try {
        valoresBrutos = JSON.parse(valoresBrutosTexto);
      } catch {
        throw new ValidationError("Os valores dos campos dinâmicos vieram num formato inválido.");
      }
    }

    const camposDinamicos = camposDoTipo.filter((campo) => !campo.ehSistema);
    const camposValoresJson = validarValoresCamposDinamicos(camposDinamicos, valoresBrutos);

    const blocosDoTipo = await listarBlocosDoTipo(equipamento.tipoEquipamentoId, true);
    const evidenciasPorBloco = await Promise.all(
      blocosDoTipo.map((bloco) => parseEvidenciasFormData(formData, bloco.id))
    );

    await atualizarDadosEquipamento(id, { nomeCliente, codigoCliente, valor, camposValoresJson });
    await salvarEvidencias(id, evidenciasPorBloco.flat(), usuario.id, usuario.nomeExibicao);

    const atualizado = await buscarEquipamentoPorId(id);

    if (atualizado) {
      const camposValoresDepois: Record<string, unknown> = camposValoresJson
        ? JSON.parse(camposValoresJson)
        : {};

      const alteracoes = calcularAlteracoesDadosTecnicos(
        camposDinamicos,
        { nomeCliente: equipamento.nomeCliente, valor: equipamento.valor, camposValores: equipamento.camposValores },
        { nomeCliente, valor, camposValores: camposValoresDepois }
      );

      if (alteracoes.length > 0) {
        await registrarLog({
          nivel: "info",
          origem: "estoque-equipamentos-usados/dados",
          mensagem: `${usuario.nomeExibicao} atualizou os dados técnicos do equipamento #${equipamento.numero} (${equipamento.descricao}).`,
          detalhes: JSON.stringify({
            equipamentoId: equipamento.id,
            numero: equipamento.numero,
            descricao: equipamento.descricao,
            alteracoes,
            motivo,
          }),
          metodo: "PATCH",
          caminho: new URL(request.url).pathname,
          ipOrigem: extrairIpOrigem(request),
        });
      }
    }

    return NextResponse.json({ ok: true, message: "Dados atualizados.", data: atualizado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar dados do equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar os dados." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("estoque-equipamentos-usados/[id]/dados", handlePATCH);
