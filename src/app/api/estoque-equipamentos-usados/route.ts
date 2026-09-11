import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { optionalText, requiredText } from "@/lib/auth/validation";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import {
  criarEquipamento,
  listarEquipamentos,
  type StatusEquipamento,
} from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import { validarEquipamentoNoErp } from "@/lib/estoque-equipamentos-usados/erp-integracao";
import {
  CHAVE_SISTEMA_CODIGO_EMPRESA,
  CHAVE_SISTEMA_DESCRICAO,
  CHAVE_SISTEMA_ERP_CODIGO_ITEM,
  CHAVE_SISTEMA_MARCA,
  CHAVE_SISTEMA_MODELO,
  CHAVE_SISTEMA_NOME_CLIENTE,
  CHAVE_SISTEMA_NUMERO_NF_ENTRADA,
  CHAVE_SISTEMA_NUMERO_SERIE,
  CHAVE_SISTEMA_OBSERVACOES,
  CHAVE_SISTEMA_VALOR,
  listarBlocosDoTipo,
  listarCamposDoTipo,
  validarValoresCamposDinamicos,
} from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { parseEvidenciasFormData, salvarEvidencias } from "@/lib/estoque-equipamentos-usados/evidencias";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";
const STATUS_VALIDOS: StatusEquipamento[] = ["em_estoque", "emprestado", "consignado", "baixado"];
const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function requiredUuid(value: FormDataEntryValue | null, fieldName: string): string {
  if (typeof value !== "string" || !uniqueIdentifierPattern.test(value)) {
    throw new ValidationError(`Informe um valor válido para ${fieldName}.`);
  }
  return value;
}

function optionalDecimal(value: FormDataEntryValue | null, fieldName: string): number | null {
  if (value === null || value === "") return null;
  const numero = Number(value);
  if (!Number.isFinite(numero)) {
    throw new ValidationError(`O campo ${fieldName} deve ser um número válido.`);
  }
  return numero;
}

async function handleGET(request: Request) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  const { searchParams } = new URL(request.url);

  const statusParam = searchParams.get("status");
  const status =
    statusParam && (STATUS_VALIDOS as string[]).includes(statusParam)
      ? (statusParam as StatusEquipamento)
      : undefined;

  const busca = searchParams.get("busca") || undefined;
  const codigoEmpresa = searchParams.get("codigoEmpresa") || undefined;
  const pendenciaChave = searchParams.get("pendencia") || undefined;
  const pagina = Math.max(1, Number(searchParams.get("pagina")) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(searchParams.get("porPagina")) || 25));

  try {
    const resultado = await listarEquipamentos({
      status,
      busca,
      codigoEmpresa,
      pendenciaChave,
      pagina,
      porPagina,
    });
    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    console.error("Erro ao listar equipamentos usados:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os equipamentos." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados", handleGET);

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

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
    const tipoEquipamentoId = requiredUuid(formData.get("tipoEquipamentoId"), "tipo de equipamento");

    /*
     * Os 10 campos fixos do sistema (cliente, valor, descrição...) agora
     * têm rótulo/obrigatório configuráveis pelo admin (ver TiposEquipamentoPainel
     * e migrações 0076/0077) — só "Descrição" continua sempre obrigatória
     * (mapeia pra coluna NOT NULL), as outras 9 (incluindo NF de entrada,
     * desde a 0077) seguem a config de cada tipo. Um campo ausente do
     * mapa (desativado) tem o valor enviado ignorado.
     */
    const camposDoTipo = await listarCamposDoTipo(tipoEquipamentoId, true);
    const sistemaPorChave = new Map(
      camposDoTipo.filter((campo) => campo.ehSistema).map((campo) => [campo.chave, campo] as const)
    );

    function lerTextoSistema(
      chaveSistema: string,
      campoFormData: string,
      tamanho: number,
      rotuloPadrao: string
    ): string | null {
      const campo = sistemaPorChave.get(chaveSistema);
      if (!campo) return null;
      const rotulo = campo.rotulo || rotuloPadrao;
      return campo.obrigatorio
        ? requiredText(formData.get(campoFormData), rotulo, tamanho)
        : optionalText(formData.get(campoFormData), rotulo, tamanho);
    }

    function rotuloSistema(chaveSistema: string, rotuloPadrao: string): string {
      return sistemaPorChave.get(chaveSistema)?.rotulo || rotuloPadrao;
    }

    const nomeCliente = lerTextoSistema(CHAVE_SISTEMA_NOME_CLIENTE, "nomeCliente", 200, "cliente");
    const codigoCliente = optionalText(formData.get("codigoCliente"), "código do cliente", 30);

    const campoValor = sistemaPorChave.get(CHAVE_SISTEMA_VALOR);
    const valor = campoValor ? optionalDecimal(formData.get("valor"), campoValor.rotulo || "valor") : null;
    if (campoValor?.obrigatorio && valor === null) {
      throw new ValidationError(`O campo "${campoValor.rotulo}" é obrigatório.`);
    }

    const descricao = requiredText(formData.get("descricao"), rotuloSistema(CHAVE_SISTEMA_DESCRICAO, "descrição"), 300);
    const marca = lerTextoSistema(CHAVE_SISTEMA_MARCA, "marca", 100, "marca");
    const modelo = lerTextoSistema(CHAVE_SISTEMA_MODELO, "modelo", 100, "modelo");
    const numeroSerie = lerTextoSistema(CHAVE_SISTEMA_NUMERO_SERIE, "numeroSerie", 100, "número de série");

    const campoEmpresa = sistemaPorChave.get(CHAVE_SISTEMA_CODIGO_EMPRESA);
    const codigoEmpresaDigitado = campoEmpresa
      ? optionalText(formData.get("codigoEmpresa"), campoEmpresa.rotulo || "empresa", 20)
      : null;
    const codigoEmpresa = codigoEmpresaDigitado ?? usuario.codigoEmpresa;
    if (campoEmpresa?.obrigatorio && !codigoEmpresa) {
      throw new ValidationError(`O campo "${campoEmpresa.rotulo}" é obrigatório.`);
    }

    const numeroNfEntrada = lerTextoSistema(
      CHAVE_SISTEMA_NUMERO_NF_ENTRADA,
      "numeroNfEntrada",
      30,
      "número da NF de entrada"
    );
    const observacoes = lerTextoSistema(CHAVE_SISTEMA_OBSERVACOES, "observacoes", 1000, "observações");

    const campoErp = sistemaPorChave.get(CHAVE_SISTEMA_ERP_CODIGO_ITEM);
    const erpCodigoItemDigitado = campoErp
      ? optionalText(formData.get("erpCodigoItem"), campoErp.rotulo || "código do item no ERP", 50)
      : null;
    if (campoErp?.obrigatorio && !erpCodigoItemDigitado) {
      throw new ValidationError(`O campo "${campoErp.rotulo}" é obrigatório.`);
    }

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

    const blocosDoTipo = await listarBlocosDoTipo(tipoEquipamentoId, true);
    const evidenciasPorBloco = await Promise.all(
      blocosDoTipo.map((bloco) => parseEvidenciasFormData(formData, bloco.id))
    );

    let erpCodigoItem = erpCodigoItemDigitado;
    let erpIdItem = optionalText(formData.get("erpIdItem"), "ID do item no ERP", 50);
    let erpDataEntrada = optionalText(formData.get("erpDataEntrada"), "data de entrada no ERP", 10);
    let erpValidadoEm: string | null = null;
    let erpValidadoPor: string | null = null;

    if (erpCodigoItemDigitado) {
      try {
        const validado = await validarEquipamentoNoErp(erpCodigoItemDigitado, codigoEmpresa);
        if (validado) {
          erpCodigoItem = validado.codigoErp;
          erpIdItem = validado.idErp;
          erpDataEntrada = validado.dataEntrada;
          erpValidadoEm = new Date().toISOString();
          erpValidadoPor = usuario.nomeExibicao;
        }
      } catch {
        /* ERP indisponível/não configurado — segue com os dados digitados manualmente, sem bloquear a entrada. */
      }
    }

    const equipamento = await criarEquipamento({
      tipoEquipamentoId,
      nomeCliente,
      codigoCliente,
      valor,
      descricao,
      marca,
      modelo,
      numeroSerie,
      codigoEmpresa,
      erpCodigoItem,
      erpIdItem,
      erpDataEntrada,
      erpValidadoEm,
      erpValidadoPor,
      numeroNfEntrada,
      observacoes,
      camposValoresJson,
      dataAcao: hoje(),
      criadoPorUsuarioId: usuario.id,
      criadoPorNome: usuario.nomeExibicao,
    });

    await salvarEvidencias(
      equipamento.id,
      evidenciasPorBloco.flat(),
      usuario.id,
      usuario.nomeExibicao
    );

    return NextResponse.json(
      { ok: true, message: "Equipamento cadastrado.", data: equipamento },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao cadastrar equipamento usado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível cadastrar o equipamento." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados", handlePOST);
