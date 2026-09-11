import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { registrarChamadaExternaSemFalhar } from "@/lib/monitoramento/chamadas-externas";
import { CHAVE_MASCARA_NUMERO_SEQUENCIAL } from "@/modules/estoque-equipamentos-usados/constants";

export interface ConfigErpEstoqueUsados {
  urlValidarItem: string | null;
  urlValidarItemTeste: string | null;
  urlClientes: string | null;
  urlClientesTeste: string | null;
  usarAmbienteTeste: boolean;
  chaveApi: string | null;
  urlNfEntrada: string | null;
  urlNfEntradaTeste: string | null;
  urlNfSaida: string | null;
  urlNfSaidaTeste: string | null;
  intervaloVerificacaoNfMinutos: number | null;
  campoMascaraChave: string;
  ultimaExecucaoNfEm: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export async function buscarConfigErpEstoqueUsados(): Promise<ConfigErpEstoqueUsados> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    url_validar_item: string | null;
    url_validar_item_teste: string | null;
    url_clientes: string | null;
    url_clientes_teste: string | null;
    usar_ambiente_teste: boolean;
    chave_api: string | null;
    url_nf_entrada: string | null;
    url_nf_entrada_teste: string | null;
    url_nf_saida: string | null;
    url_nf_saida_teste: string | null;
    intervalo_verificacao_nf_minutos: number | null;
    campo_mascara_chave: string;
    ultima_execucao_nf_em: string | null;
    atualizado_em: string | null;
    atualizado_por: string | null;
  }>(`
    SELECT
      [url_validar_item],
      [url_validar_item_teste],
      [url_clientes],
      [url_clientes_teste],
      CAST([usar_ambiente_teste] AS BIT) AS [usar_ambiente_teste],
      [chave_api],
      [url_nf_entrada],
      [url_nf_entrada_teste],
      [url_nf_saida],
      [url_nf_saida_teste],
      [intervalo_verificacao_nf_minutos],
      [campo_mascara_chave],
      CONVERT(VARCHAR(33), [ultima_execucao_nf_em], 126) AS [ultima_execucao_nf_em],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.com_estoque_equipamentos_usados_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  return {
    urlValidarItem: row?.url_validar_item ?? null,
    urlValidarItemTeste: row?.url_validar_item_teste ?? null,
    urlClientes: row?.url_clientes ?? null,
    urlClientesTeste: row?.url_clientes_teste ?? null,
    usarAmbienteTeste: row?.usar_ambiente_teste ?? false,
    chaveApi: row?.chave_api ?? null,
    urlNfEntrada: row?.url_nf_entrada ?? null,
    urlNfEntradaTeste: row?.url_nf_entrada_teste ?? null,
    urlNfSaida: row?.url_nf_saida ?? null,
    urlNfSaidaTeste: row?.url_nf_saida_teste ?? null,
    intervaloVerificacaoNfMinutos: row?.intervalo_verificacao_nf_minutos ?? 5,
    campoMascaraChave: row?.campo_mascara_chave || CHAVE_MASCARA_NUMERO_SEQUENCIAL,
    ultimaExecucaoNfEm: row?.ultima_execucao_nf_em ?? null,
    atualizadoEm: row?.atualizado_em ?? null,
    atualizadoPor: row?.atualizado_por ?? null,
  };
}

export async function salvarConfigErpEstoqueUsados(params: {
  urlValidarItem: string | null;
  urlValidarItemTeste: string | null;
  urlClientes: string | null;
  urlClientesTeste: string | null;
  usarAmbienteTeste: boolean;
  chaveApi: string | null;
  urlNfEntrada: string | null;
  urlNfEntradaTeste: string | null;
  urlNfSaida: string | null;
  urlNfSaidaTeste: string | null;
  intervaloVerificacaoNfMinutos: number | null;
  campoMascaraChave: string;
  atualizadoPor: string;
}): Promise<ConfigErpEstoqueUsados> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("urlValidarItem", sql.NVarChar(300), params.urlValidarItem);
  request.input("urlValidarItemTeste", sql.NVarChar(300), params.urlValidarItemTeste);
  request.input("urlClientes", sql.NVarChar(300), params.urlClientes);
  request.input("urlClientesTeste", sql.NVarChar(300), params.urlClientesTeste);
  request.input("usarAmbienteTeste", sql.Bit, params.usarAmbienteTeste);
  request.input("chaveApi", sql.NVarChar(200), params.chaveApi);
  request.input("urlNfEntrada", sql.NVarChar(300), params.urlNfEntrada);
  request.input("urlNfEntradaTeste", sql.NVarChar(300), params.urlNfEntradaTeste);
  request.input("urlNfSaida", sql.NVarChar(300), params.urlNfSaida);
  request.input("urlNfSaidaTeste", sql.NVarChar(300), params.urlNfSaidaTeste);
  request.input("intervaloVerificacaoNfMinutos", sql.Int, params.intervaloVerificacaoNfMinutos ?? 5);
  request.input("campoMascaraChave", sql.NVarChar(50), params.campoMascaraChave);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  await request.query(`
    MERGE dbo.com_estoque_equipamentos_usados_config AS destino
    USING (SELECT 1 AS [id]) AS origem
    ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [url_validar_item] = @urlValidarItem,
        [url_validar_item_teste] = @urlValidarItemTeste,
        [url_clientes] = @urlClientes,
        [url_clientes_teste] = @urlClientesTeste,
        [usar_ambiente_teste] = @usarAmbienteTeste,
        [chave_api] = @chaveApi,
        [url_nf_entrada] = @urlNfEntrada,
        [url_nf_entrada_teste] = @urlNfEntradaTeste,
        [url_nf_saida] = @urlNfSaida,
        [url_nf_saida_teste] = @urlNfSaidaTeste,
        [intervalo_verificacao_nf_minutos] = @intervaloVerificacaoNfMinutos,
        [campo_mascara_chave] = @campoMascaraChave,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT ([id], [url_validar_item], [url_validar_item_teste], [url_clientes], [url_clientes_teste], [usar_ambiente_teste], [chave_api], [url_nf_entrada], [url_nf_entrada_teste], [url_nf_saida], [url_nf_saida_teste], [intervalo_verificacao_nf_minutos], [campo_mascara_chave], [atualizado_em], [atualizado_por])
      VALUES (1, @urlValidarItem, @urlValidarItemTeste, @urlClientes, @urlClientesTeste, @usarAmbienteTeste, @chaveApi, @urlNfEntrada, @urlNfEntradaTeste, @urlNfSaida, @urlNfSaidaTeste, @intervaloVerificacaoNfMinutos, @campoMascaraChave, SYSDATETIME(), @atualizadoPor);
  `);

  return buscarConfigErpEstoqueUsados();
}

/*
 * Só o agendador chama isso (nunca o admin) — marca "quando foi a última
 * varredura completa", usado pra decidir se já passou o intervalo
 * configurado desde então (ver nf-entrada-scheduler.ts). Não mexe em
 * mais nenhuma coluna, então não precisa de MERGE nem de atualizadoPor.
 */
export async function marcarUltimaExecucaoNf(): Promise<void> {
  const pool = await getSqlServerPool();

  await pool.request().query(`
    UPDATE dbo.com_estoque_equipamentos_usados_config
    SET [ultima_execucao_nf_em] = SYSDATETIME()
    WHERE [id] = 1;
  `);
}

async function exigirUrlValidarItem(): Promise<{ url: string; chaveApi: string | null }> {
  const config = await buscarConfigErpEstoqueUsados();
  const url = config.usarAmbienteTeste ? config.urlValidarItemTeste : config.urlValidarItem;

  if (!url) {
    const rotulo = config.usarAmbienteTeste ? "de teste" : "de produção";
    throw new ValidationError(
      `Configure o endpoint ${rotulo} de validação de item em Administração → Configurações antes de usar a integração com o ERP.`
    );
  }

  return { url, chaveApi: config.chaveApi };
}

export interface ItemValidadoErp {
  codigoErp: string;
  idErp: string;
  dataEntrada: string;
}

/*
 * Contrato do endpoint AINDA NÃO CONFIRMADO com o Focco — modelado por
 * enquanto no mesmo formato de `validarCodigosNoErp`
 * (src/lib/estrutura-substituicao/estrutura-substituicao.ts:279), que é
 * o único endpoint de "validar item no ERP" já existente no portal.
 * Ajustar aqui (parâmetros de busca, forma do JSON de resposta) assim
 * que o endpoint real de equipamentos usados/patrimônio for confirmado.
 * Até lá, o resto do módulo funciona normalmente com os campos de
 * código/ID do ERP preenchidos manualmente.
 */
export async function validarEquipamentoNoErp(
  codigoErp: string,
  codEmpresa: string | null
): Promise<ItemValidadoErp | null> {
  const { url, chaveApi } = await exigirUrlValidarItem();

  const inicio = performance.now();
  let sucesso = false;
  let mensagemErro: string | null = null;

  try {
    const urlComParametros = new URL(url);
    urlComParametros.searchParams.set("cod_item", codigoErp);
    if (codEmpresa) {
      urlComParametros.searchParams.set("cod_emp", codEmpresa);
    }

    let resposta: Response;
    try {
      resposta = await fetch(urlComParametros.toString(), {
        headers: {
          Accept: "application/json",
          ...(chaveApi ? { Authorization: `Bearer ${chaveApi}` } : {}),
        },
      });
    } catch {
      throw new ValidationError(
        "Não foi possível conectar ao serviço de validação de equipamentos do ERP. Confira o endpoint configurado."
      );
    }

    if (!resposta.ok) {
      throw new ValidationError(
        `O serviço de validação do ERP respondeu com erro (${resposta.status}).`
      );
    }

    const json = (await resposta.json()) as {
      success: boolean;
      item?: { codigo: string; id: string; dataEntrada: string } | null;
    };

    if (!json.success || !json.item) {
      sucesso = true;
      return null;
    }

    sucesso = true;
    return {
      codigoErp: json.item.codigo,
      idErp: json.item.id,
      dataEntrada: json.item.dataEntrada.slice(0, 10),
    };
  } catch (error) {
    mensagemErro = error instanceof Error ? error.message : "Erro desconhecido.";
    throw error;
  } finally {
    await registrarChamadaExternaSemFalhar({
      servico: "erp_estoque_usados",
      origem: "uso_real",
      sucesso,
      duracaoMs: performance.now() - inicio,
      mensagemErro,
    });
  }
}

export interface ClienteErpEstoqueUsados {
  cod_cli: string;
  descricao: string;
}

/*
 * Lista de clientes pro autocomplete do campo "Cliente" — mesmo serviço
 * externo já usado em Liberação de Projeto, só que agora com a URL
 * configurável em Administração → Equipamentos Usados → Integração ERP
 * (antes vinha hardcoded em estoque.service.ts) e chamado a partir do
 * servidor (rota /api/estoque-equipamentos-usados/clientes), não direto
 * do navegador.
 */
export async function listarClientesErp(): Promise<ClienteErpEstoqueUsados[]> {
  const config = await buscarConfigErpEstoqueUsados();
  const url = config.usarAmbienteTeste ? config.urlClientesTeste : config.urlClientes;

  if (!url) return [];

  const inicio = performance.now();
  let sucesso = false;
  let mensagemErro: string | null = null;

  try {
    const resposta = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(config.chaveApi ? { Authorization: `Bearer ${config.chaveApi}` } : {}),
      },
      cache: "no-store",
    });

    if (!resposta.ok) {
      throw new Error(`O serviço de clientes do ERP respondeu com erro (${resposta.status}).`);
    }

    const data: unknown = await resposta.json();
    sucesso = true;

    return Array.isArray(data) ? (data as ClienteErpEstoqueUsados[]) : [];
  } catch (error) {
    mensagemErro = error instanceof Error ? error.message : "Erro desconhecido.";
    return [];
  } finally {
    await registrarChamadaExternaSemFalhar({
      servico: "erp_estoque_usados_clientes",
      origem: "uso_real",
      sucesso,
      duracaoMs: performance.now() - inicio,
      mensagemErro,
    });
  }
}

export interface NfEntradaErp {
  numeroNf: string;
  dataEntradaIso: string;
  codigoItem: string;
  idConfigurado: string;
}

interface RespostaNfEntradaErp {
  success: boolean;
  message?: string;
  data?: Array<{
    numeroNf: number | string;
    dataEntrada: string;
    item?: { codItem: string } | null;
    mascaraItem?: { id: number | string } | null;
  }>;
}

/*
 * "28/08/2026" (formato do Focco) -> "2026-08-28" (o que o SQL Server
 * espera pra uma coluna DATE). Só valida o formato básico — se vier algo
 * fora do esperado, prefere devolver null (fica sem data) a gravar lixo.
 */
function converterDataBrParaIso(data: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.trim());
  if (!match) return null;
  const [, dia, mes, ano] = match;
  return `${ano}-${mes}-${dia}`;
}

/*
 * Preenchido por consultarNfEntradaNoErp conforme a chamada avança —
 * passado por referência pra sobreviver mesmo quando a função lança
 * (erro de rede, HTTP não-2xx, JSON inválido). É o que alimenta o botão
 * "ver requisição/resposta completa" no modal de tentativas
 * (com_estoque_integracao_nf_logs.request_url/response_status/response_body).
 */
export interface DetalhesChamadaNfErp {
  requestUrl?: string;
  responseStatus?: number;
  responseBody?: string;
  /* Mensagem do próprio JSON de resposta do ERP (campo "message"), quando
     a NF ainda não foi encontrada — mais útil que um texto genérico fixo. */
  mensagemNaoEncontrado?: string;
}

/*
 * Consulta o endpoint de NF de entrada do Focco pra um equipamento
 * específico — usado pelo job automático (nf-entrada-scheduler.ts) que
 * varre equipamentos sem NF a cada N minutos. Ao contrário de
 * validarEquipamentoNoErp, aqui a ausência de resultado (`data` vazio)
 * NÃO é erro: só significa que a NF ainda não foi lançada no ERP.
 */
export async function consultarNfEntradaNoErp(
  params: {
    codEmpresa: string;
    mascara: string;
    codFornecedor: string;
  },
  detalhes?: DetalhesChamadaNfErp
): Promise<NfEntradaErp | null> {
  const config = await buscarConfigErpEstoqueUsados();
  const url = config.usarAmbienteTeste ? config.urlNfEntradaTeste : config.urlNfEntrada;

  if (!url) {
    const rotulo = config.usarAmbienteTeste ? "de teste" : "de produção";
    throw new ValidationError(
      `Configure o endpoint ${rotulo} de consulta de NF de entrada em Administração → Equipamentos Usados → Integração ERP.`
    );
  }

  const inicio = performance.now();
  let sucesso = false;
  let mensagemErro: string | null = null;

  try {
    const urlComParametros = new URL(url);
    urlComParametros.searchParams.set("cod_emp", params.codEmpresa);
    urlComParametros.searchParams.set("mascara", params.mascara);
    urlComParametros.searchParams.set("cod_for", params.codFornecedor);

    if (detalhes) detalhes.requestUrl = urlComParametros.toString();

    const resposta = await fetch(urlComParametros.toString(), {
      headers: {
        Accept: "application/json",
        ...(config.chaveApi ? { Authorization: `Bearer ${config.chaveApi}` } : {}),
      },
      cache: "no-store",
    });

    if (detalhes) detalhes.responseStatus = resposta.status;

    /*
     * Lê como texto primeiro (nunca falha) pra sempre ter o corpo cru
     * disponível pro modal de detalhes, mesmo numa resposta de erro
     * (4xx/5xx) ou com um corpo que não é JSON válido.
     */
    const textoResposta = await resposta.text();
    if (detalhes) detalhes.responseBody = textoResposta;

    /*
     * Lê o JSON antes de decidir se a resposta é erro — o Focco sinaliza
     * "nenhuma NF encontrada ainda" com HTTP 404 (não é falha de verdade,
     * é o mesmo significado de "success: false"/"data" vazio num 200), e
     * a mensagem de diagnóstico (campo "message") vem no corpo mesmo
     * quando o status não é 2xx.
     */
    let json: RespostaNfEntradaErp | null = null;
    try {
      json = JSON.parse(textoResposta) as RespostaNfEntradaErp;
    } catch {
      json = null;
    }

    if (resposta.status === 404) {
      sucesso = true;
      if (detalhes) detalhes.mensagemNaoEncontrado = json?.message;
      return null;
    }

    if (!resposta.ok) {
      throw new Error(
        json?.message || `O serviço de NF de entrada do ERP respondeu com erro (${resposta.status}).`
      );
    }

    if (!json) {
      throw new Error("O serviço de NF de entrada do ERP devolveu um corpo que não é JSON válido.");
    }

    sucesso = true;

    const primeiro = json.success ? json.data?.[0] : undefined;
    if (!primeiro) {
      if (detalhes) detalhes.mensagemNaoEncontrado = json.message;
      return null;
    }

    const dataEntradaIso = converterDataBrParaIso(String(primeiro.dataEntrada ?? ""));

    return {
      numeroNf: String(primeiro.numeroNf),
      dataEntradaIso: dataEntradaIso ?? "",
      codigoItem: primeiro.item?.codItem ?? "",
      idConfigurado: primeiro.mascaraItem?.id !== undefined ? String(primeiro.mascaraItem.id) : "",
    };
  } catch (error) {
    mensagemErro = error instanceof Error ? error.message : "Erro desconhecido.";
    throw error;
  } finally {
    await registrarChamadaExternaSemFalhar({
      servico: "erp_estoque_usados_nf_entrada",
      origem: "uso_real",
      sucesso,
      duracaoMs: performance.now() - inicio,
      mensagemErro,
    });
  }
}

export interface NfSaidaErp {
  codigoFornecedor: string;
  valorTotal: number;
  dataEmissaoIso: string | null;
}

interface RespostaNfSaidaErp {
  success: boolean;
  message?: string;
  data?: Array<{
    emprId: number;
    numeroNf: number | string;
    fornecedor?: { codigo: number | string } | null;
    valorTotal: number;
    dataEmissao?: string;
  }>;
}

/*
 * Consulta o endpoint de NF de SAÍDA do Focco (empréstimo, consignação
 * ou venda) — diferente do de entrada: aqui não tem job automático, é
 * chamado sob demanda quando o usuário digita/sai do campo "Número da
 * NF" num dos modais de movimentação (ver EquipamentoDetalhePage).
 */
export async function consultarNfSaidaNoErp(
  params: { codEmpresa: string; numeroNf: string; idItem: string | null },
  detalhes?: DetalhesChamadaNfErp
): Promise<NfSaidaErp | null> {
  const config = await buscarConfigErpEstoqueUsados();
  const url = config.usarAmbienteTeste ? config.urlNfSaidaTeste : config.urlNfSaida;

  if (!url) {
    const rotulo = config.usarAmbienteTeste ? "de teste" : "de produção";
    throw new ValidationError(
      `Configure o endpoint ${rotulo} de consulta de NF de saída em Administração → Equipamentos Usados → Integração ERP.`
    );
  }

  const inicio = performance.now();
  let sucesso = false;
  let mensagemErro: string | null = null;

  try {
    const urlComParametros = new URL(url);
    urlComParametros.searchParams.set("empr_id", params.codEmpresa);
    urlComParametros.searchParams.set("num_nf", params.numeroNf);
    if (params.idItem) urlComParametros.searchParams.set("id", params.idItem);

    if (detalhes) detalhes.requestUrl = urlComParametros.toString();

    const resposta = await fetch(urlComParametros.toString(), {
      headers: {
        Accept: "application/json",
        ...(config.chaveApi ? { Authorization: `Bearer ${config.chaveApi}` } : {}),
      },
      cache: "no-store",
    });

    if (detalhes) detalhes.responseStatus = resposta.status;

    const textoResposta = await resposta.text();
    if (detalhes) detalhes.responseBody = textoResposta;

    let json: RespostaNfSaidaErp | null = null;
    try {
      json = JSON.parse(textoResposta) as RespostaNfSaidaErp;
    } catch {
      json = null;
    }

    if (resposta.status === 404) {
      sucesso = true;
      if (detalhes) detalhes.mensagemNaoEncontrado = json?.message;
      return null;
    }

    if (!resposta.ok) {
      throw new Error(
        json?.message || `O serviço de NF de saída do ERP respondeu com erro (${resposta.status}).`
      );
    }

    if (!json) {
      throw new Error("O serviço de NF de saída do ERP devolveu um corpo que não é JSON válido.");
    }

    sucesso = true;

    const primeiro = json.success ? json.data?.[0] : undefined;
    if (!primeiro) {
      if (detalhes) detalhes.mensagemNaoEncontrado = json.message;
      return null;
    }

    return {
      codigoFornecedor: primeiro.fornecedor?.codigo !== undefined ? String(primeiro.fornecedor.codigo) : "",
      valorTotal: Number(primeiro.valorTotal) || 0,
      dataEmissaoIso: primeiro.dataEmissao ? converterDataBrParaIso(String(primeiro.dataEmissao)) : null,
    };
  } catch (error) {
    mensagemErro = error instanceof Error ? error.message : "Erro desconhecido.";
    throw error;
  } finally {
    await registrarChamadaExternaSemFalhar({
      servico: "erp_estoque_usados_nf_saida",
      origem: "uso_real",
      sucesso,
      duracaoMs: performance.now() - inicio,
      mensagemErro,
    });
  }
}
