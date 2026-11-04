import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { optionalText, requiredText } from "@/lib/auth/validation";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import {
  criarEquipamento,
  listarEquipamentos,
  verificarIdErpDisponivel,
  verificarNumeroDisponivel,
  type DirecaoOrdenacao,
  type OrdenacaoEquipamentos,
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
  blocoValeParaCondicao,
  buscarTipoEquipamentoPorId,
  listarBlocosDoTipo,
  listarCamposDoTipo,
  validarValoresCamposDinamicos,
} from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { parseEvidenciasFormData, salvarEvidencias } from "@/lib/estoque-equipamentos-usados/evidencias";
import { camposParaCondicao } from "@/modules/estoque-equipamentos-usados/utils/campos-condicao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";
const STATUS_VALIDOS: StatusEquipamento[] = ["em_estoque", "emprestado", "consignado", "em_reforma", "baixado"];
const ORDENACOES_VALIDAS: OrdenacaoEquipamentos[] = ["numero", "descricao", "cliente", "marcaModelo", "status", "criadoEm"];
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

  const condicaoParam = searchParams.get("condicao");
  const condicao = condicaoParam === "novo" || condicaoParam === "usado" ? condicaoParam : undefined;
  const busca = searchParams.get("busca") || undefined;
  const codigoEmpresa = searchParams.get("codigoEmpresa") || undefined;
  const pendenciaChave = searchParams.get("pendencia") || undefined;
  const pagina = Math.max(1, Number(searchParams.get("pagina")) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(searchParams.get("porPagina")) || 25));
  const ordenarParam = searchParams.get("ordenarPor");
  const ordenarPor = ordenarParam && (ORDENACOES_VALIDAS as string[]).includes(ordenarParam)
    ? (ordenarParam as OrdenacaoEquipamentos)
    : undefined;
  const direcao: DirecaoOrdenacao = searchParams.get("direcao") === "asc" ? "asc" : "desc";

  try {
    const resultado = await listarEquipamentos({
      condicao,
      status,
      busca,
      codigoEmpresa,
      pendenciaChave,
      pagina,
      porPagina,
      ordenarPor,
      direcao,
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
     * Novo (fabricação interna): número, código do item e ID configurado
     * são digitados; não tem NF de entrada nem busca no ERP pela NF. O
     * usado segue como sempre (número automático, NF de entrada).
     */
    const condicao = formData.get("condicao") === "novo" ? "novo" : "usado";
    const ehNovo = condicao === "novo";
    const tipoEscolhido = await buscarTipoEquipamentoPorId(tipoEquipamentoId);
    if (!tipoEscolhido || !tipoEscolhido.ativo) throw new ValidationError("Tipo de equipamento inválido.");
    if (tipoEscolhido.condicao !== "ambos" && tipoEscolhido.condicao !== condicao) {
      throw new ValidationError(
        `O tipo "${tipoEscolhido.nome}" é só para equipamentos ${tipoEscolhido.condicao === "novo" ? "novos" : "usados"}.`
      );
    }
    let numeroNovo: number | null = null;
    if (ehNovo) {
      numeroNovo = Number(formData.get("numero"));
      if (!Number.isInteger(numeroNovo) || numeroNovo <= 0) {
        throw new ValidationError("Informe o número do equipamento novo (inteiro maior que zero).");
      }
      await verificarNumeroDisponivel({ numero: numeroNovo, condicao, tipoEquipamentoId });
    }

    /*
     * Os 10 campos fixos do sistema (cliente, valor, descrição...) agora
     * têm rótulo/obrigatório configuráveis pelo admin (ver TiposEquipamentoPainel
     * e migrações 0076/0077) — só "Descrição" continua sempre obrigatória
     * (mapeia pra coluna NOT NULL), as outras 9 (incluindo NF de entrada,
     * desde a 0077) seguem a config de cada tipo. Um campo ausente do
     * mapa (desativado) tem o valor enviado ignorado.
     */
    /* Campos como valem para a condição: no novo, sem o Cliente e com o obrigatório do novo (ver campos-condicao.ts). */
    const camposDoTipo = camposParaCondicao(await listarCamposDoTipo(tipoEquipamentoId, true), condicao);
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

    const numeroNfEntrada = ehNovo
      ? null
      : lerTextoSistema(CHAVE_SISTEMA_NUMERO_NF_ENTRADA, "numeroNfEntrada", 30, "número da NF de entrada");
    const observacoes = lerTextoSistema(CHAVE_SISTEMA_OBSERVACOES, "observacoes", 1000, "observações");

    const campoErp = sistemaPorChave.get(CHAVE_SISTEMA_ERP_CODIGO_ITEM);
    /* No novo, código e ID são opcionais: o extrato do ERP só é consultado com os dois preenchidos. */
    const erpCodigoItemDigitado = ehNovo
      ? optionalText(formData.get("erpCodigoItem"), "código do item no ERP", 50)
      : campoErp
        ? optionalText(formData.get("erpCodigoItem"), campoErp.rotulo || "código do item no ERP", 50)
        : null;
    if (!ehNovo && campoErp?.obrigatorio && !erpCodigoItemDigitado) {
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

    /* Só os blocos que valem para a condição (ex.: "Estado de conservação" não vale para o novo). */
    const blocosDoTipo = (await listarBlocosDoTipo(tipoEquipamentoId, true)).filter((bloco) =>
      blocoValeParaCondicao(bloco, condicao)
    );
    const blocosValidos = new Set(blocosDoTipo.map((bloco) => bloco.id));

    const camposDinamicos = camposDoTipo.filter((campo) => !campo.ehSistema && blocosValidos.has(campo.blocoId));
    const camposValoresJson = validarValoresCamposDinamicos(camposDinamicos, valoresBrutos);

    const evidenciasPorBloco = await Promise.all(
      blocosDoTipo.map((bloco) => parseEvidenciasFormData(formData, bloco.id))
    );

    let erpCodigoItem = erpCodigoItemDigitado;
    /* No novo o ID é opcional: sem ele, o extrato do ERP não é consultado (a sincronização exige código e ID). */
    let erpIdItem = optionalText(formData.get("erpIdItem"), ehNovo ? "ID configurado do ERP" : "ID do item no ERP", 50);
    let erpDataEntrada = ehNovo ? null : optionalText(formData.get("erpDataEntrada"), "data de entrada no ERP", 10);
    let erpValidadoEm: string | null = null;
    let erpValidadoPor: string | null = null;

    if (ehNovo && erpIdItem) await verificarIdErpDisponivel(erpIdItem);

    if (erpCodigoItemDigitado && !ehNovo) {
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
      condicao,
      numero: numeroNovo,
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
