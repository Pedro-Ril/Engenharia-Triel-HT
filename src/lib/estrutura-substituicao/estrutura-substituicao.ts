import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";
import { registrarChamadaExternaSemFalhar } from "@/lib/monitoramento/chamadas-externas";
import type {
  EstruturaApiItem,
  EstruturaApiResponse,
} from "@/modules/consulta-estrutura/types/estruturaProduto.types";

export interface ConfigEstruturaSubstituicao {
  urlConsultaEstrutura: string | null;
  urlValidarItens: string | null;
  urlAtualizarEstrutura: string | null;
  urlConsultaEstruturaTeste: string | null;
  urlValidarItensTeste: string | null;
  urlAtualizarEstruturaTeste: string | null;
  usarAmbienteTeste: boolean;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export async function buscarConfigEstruturaSubstituicao(): Promise<ConfigEstruturaSubstituicao> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    url_consulta_estrutura: string | null;
    url_validar_itens: string | null;
    url_atualizar_estrutura: string | null;
    url_consulta_estrutura_teste: string | null;
    url_validar_itens_teste: string | null;
    url_atualizar_estrutura_teste: string | null;
    usar_ambiente_teste: boolean;
    atualizado_em: string | null;
    atualizado_por: string | null;
  }>(`
    SELECT
      [url_consulta_estrutura],
      [url_validar_itens],
      [url_atualizar_estrutura],
      [url_consulta_estrutura_teste],
      [url_validar_itens_teste],
      [url_atualizar_estrutura_teste],
      CAST([usar_ambiente_teste] AS BIT) AS [usar_ambiente_teste],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.eng_estrutura_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  return {
    urlConsultaEstrutura: row?.url_consulta_estrutura ?? null,
    urlValidarItens: row?.url_validar_itens ?? null,
    urlAtualizarEstrutura: row?.url_atualizar_estrutura ?? null,
    urlConsultaEstruturaTeste: row?.url_consulta_estrutura_teste ?? null,
    urlValidarItensTeste: row?.url_validar_itens_teste ?? null,
    urlAtualizarEstruturaTeste: row?.url_atualizar_estrutura_teste ?? null,
    usarAmbienteTeste: row?.usar_ambiente_teste ?? false,
    atualizadoEm: row?.atualizado_em ?? null,
    atualizadoPor: row?.atualizado_por ?? null,
  };
}

export async function salvarConfigEstruturaSubstituicao(params: {
  urlConsultaEstrutura: string | null;
  urlValidarItens: string | null;
  urlAtualizarEstrutura: string | null;
  urlConsultaEstruturaTeste: string | null;
  urlValidarItensTeste: string | null;
  urlAtualizarEstruturaTeste: string | null;
  usarAmbienteTeste: boolean;
  atualizadoPor: string;
}): Promise<ConfigEstruturaSubstituicao> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("urlConsultaEstrutura", sql.NVarChar(300), params.urlConsultaEstrutura);
  request.input("urlValidarItens", sql.NVarChar(300), params.urlValidarItens);
  request.input("urlAtualizarEstrutura", sql.NVarChar(300), params.urlAtualizarEstrutura);
  request.input("urlConsultaEstruturaTeste", sql.NVarChar(300), params.urlConsultaEstruturaTeste);
  request.input("urlValidarItensTeste", sql.NVarChar(300), params.urlValidarItensTeste);
  request.input("urlAtualizarEstruturaTeste", sql.NVarChar(300), params.urlAtualizarEstruturaTeste);
  request.input("usarAmbienteTeste", sql.Bit, params.usarAmbienteTeste);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  await request.query(`
    MERGE dbo.eng_estrutura_config AS destino
    USING (SELECT 1 AS [id]) AS origem
    ON destino.[id] = origem.[id]
    WHEN MATCHED THEN
      UPDATE SET
        [url_consulta_estrutura] = @urlConsultaEstrutura,
        [url_validar_itens] = @urlValidarItens,
        [url_atualizar_estrutura] = @urlAtualizarEstrutura,
        [url_consulta_estrutura_teste] = @urlConsultaEstruturaTeste,
        [url_validar_itens_teste] = @urlValidarItensTeste,
        [url_atualizar_estrutura_teste] = @urlAtualizarEstruturaTeste,
        [usar_ambiente_teste] = @usarAmbienteTeste,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN
      INSERT (
        [id], [url_consulta_estrutura], [url_validar_itens], [url_atualizar_estrutura],
        [url_consulta_estrutura_teste], [url_validar_itens_teste], [url_atualizar_estrutura_teste],
        [usar_ambiente_teste], [atualizado_em], [atualizado_por]
      )
      VALUES (
        1, @urlConsultaEstrutura, @urlValidarItens, @urlAtualizarEstrutura,
        @urlConsultaEstruturaTeste, @urlValidarItensTeste, @urlAtualizarEstruturaTeste,
        @usarAmbienteTeste, SYSDATETIME(), @atualizadoPor
      );
  `);

  return buscarConfigEstruturaSubstituicao();
}

/*
 * A URL configurada pode já ter query string própria (ex: admin
 * aponta pro ambiente de teste do ERP com "...?ambiente=teste") — não
 * dá pra só concatenar texto (colocaria o código pai DEPOIS do "?", ou
 * juntaria dois "?" ao adicionar cod_emp). Usar a API URL manipula
 * pathname/searchParams separadamente e serializa de volta correto,
 * preservando qualquer query string que já exista.
 */
function anexarCaminho(baseUrl: string, segmento: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${encodeURIComponent(segmento)}`;
  return url.toString();
}

function comParametro(baseUrl: string, chave: string, valor: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(chave, valor);
  return url.toString();
}

export type AmbienteEstruturaSubstituicao = "producao" | "teste";

/*
 * Escolhe URL de produção ou teste conforme o toggle salvo na
 * configuração — mesmo toggle que a tela de Substituição de item na
 * estrutura consulta (ver /api/estrutura-substituicao/ambiente) pra
 * mostrar um indicador visual de qual ambiente está ativo, evitando
 * qualquer dúvida na hora de aplicar uma troca de verdade.
 */
async function exigirConfig(): Promise<{
  ambiente: AmbienteEstruturaSubstituicao;
  urlConsultaEstrutura: string;
  urlValidarItens: string;
  urlAtualizarEstrutura: string;
}> {
  const config = await buscarConfigEstruturaSubstituicao();
  const ambiente: AmbienteEstruturaSubstituicao = config.usarAmbienteTeste ? "teste" : "producao";

  const urlConsultaEstrutura = ambiente === "teste"
    ? config.urlConsultaEstruturaTeste
    : config.urlConsultaEstrutura;
  const urlValidarItens = ambiente === "teste" ? config.urlValidarItensTeste : config.urlValidarItens;
  const urlAtualizarEstrutura = ambiente === "teste"
    ? config.urlAtualizarEstruturaTeste
    : config.urlAtualizarEstrutura;

  if (!urlConsultaEstrutura || !urlValidarItens || !urlAtualizarEstrutura) {
    const rotulo = ambiente === "teste" ? "de teste" : "de produção";
    throw new ValidationError(
      `Configure os endpoints ${rotulo} em Administração → Configurações antes de usar esta ferramenta.`
    );
  }

  return { ambiente, urlConsultaEstrutura, urlValidarItens, urlAtualizarEstrutura };
}

export async function obterAmbienteAtivo(): Promise<AmbienteEstruturaSubstituicao> {
  const config = await buscarConfigEstruturaSubstituicao();
  return config.usarAmbienteTeste ? "teste" : "producao";
}

export interface ItemNivelEstrutura {
  codigo: string;
  descricao: string | null;
  sequencia: string;
  quantidade: number;
  dataInicial: string;
  dataFinal: string;
  /*
   * Cada item carrega o código (e descrição) do SEU pai direto — não
   * necessariamente o código raiz pesquisado, já que a estrutura pode
   * ter vários níveis. É o que permite agrupar por nível na hora de
   * montar o payload de substituição (ver substituirItemNaEstrutura).
   */
  codigoPai: string;
  descricaoPai: string | null;
}

export interface EstruturaCompleta {
  codigoRaiz: string;
  descricaoRaiz: string | null;
  itens: ItemNivelEstrutura[];
}

/*
 * DT_INI/DT_FIM do ERP às vezes vêm com hora junto ("1990-01-01T00:00:00")
 * — o payload de atualização espera só a data (ver formato no CLAUDE.md
 * do módulo). Corta de forma defensiva em vez de assumir um formato só.
 */
function apenasData(valor: string | null | undefined): string {
  if (!valor) return "";
  return valor.slice(0, 10);
}

function itemApiParaItemNivel(item: EstruturaApiItem): ItemNivelEstrutura {
  return {
    codigo: String(item.COD_ITEM_FILHO ?? ""),
    descricao: item.DESC_TECNICA_FILHO ?? null,
    sequencia: String(item.SEQ_ORD ?? 0),
    quantidade: item.QTDE ?? 0,
    dataInicial: apenasData(item.DT_INI),
    dataFinal: apenasData(item.DT_FIM),
    codigoPai: String(item.COD_ITEM_PAI ?? ""),
    descricaoPai: item.DESC_TECNICA_PAI ?? null,
  };
}

/*
 * Busca a estrutura completa de um código raiz no ERP (proserver) — a
 * resposta já vem como uma lista plana cobrindo TODOS os níveis abaixo
 * desse raiz (cada item aponta pro seu próprio pai direto, que pode ser
 * um nível intermediário, não só o raiz pesquisado). Antes filtrávamos
 * só os filhos diretos do raiz; agora mantemos a árvore inteira, porque
 * a substituição precisa alcançar uma ocorrência do item em QUALQUER
 * nível abaixo do raiz informado, não só no primeiro.
 */
export async function buscarEstruturaCompleta(codigoRaiz: string): Promise<EstruturaCompleta> {
  const { urlConsultaEstrutura } = await exigirConfig();

  const url = anexarCaminho(urlConsultaEstrutura, codigoRaiz);

  let resposta: Response;
  try {
    resposta = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new ValidationError(
      "Não foi possível conectar ao serviço de estrutura do ERP. Confira o endpoint configurado."
    );
  }

  if (!resposta.ok) {
    throw new ValidationError(`O serviço de estrutura do ERP respondeu com erro (${resposta.status}).`);
  }

  const json = (await resposta.json()) as EstruturaApiResponse;

  if (!json.success) {
    throw new ValidationError("O serviço de estrutura do ERP não encontrou esse código.");
  }

  const descricaoRaiz = json.data[0]?.DESC_TECNICA_PAI_RAIZ ?? null;

  return {
    codigoRaiz,
    descricaoRaiz,
    itens: json.data.map(itemApiParaItemNivel),
  };
}

export interface ResultadoValidacaoItem {
  codigo: string;
  existeNoErp: boolean;
  possuiConversao: boolean;
}

/*
 * Confere no ERP se os códigos informados existem de verdade — usado
 * pra validar o código substituto antes de aplicar a troca (ver
 * COMANDOS em src/modules/estrutura-substituicao).
 */
export async function validarCodigosNoErp(
  codigos: string[],
  codEmpresa: string
): Promise<ResultadoValidacaoItem[]> {
  const { urlValidarItens } = await exigirConfig();

  const url = comParametro(urlValidarItens, "cod_emp", codEmpresa);

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ codigos }),
    });
  } catch {
    throw new ValidationError(
      "Não foi possível conectar ao serviço de validação de itens do ERP. Confira o endpoint configurado."
    );
  }

  if (!resposta.ok) {
    throw new ValidationError(`O serviço de validação do ERP respondeu com erro (${resposta.status}).`);
  }

  const json = (await resposta.json()) as {
    success: boolean;
    items: { codigo: string; existeNoERP: boolean; possuiConversao: boolean }[];
  };

  if (!json.success) {
    throw new ValidationError("O serviço de validação do ERP não retornou um resultado válido.");
  }

  return json.items.map((item) => ({
    codigo: item.codigo,
    existeNoErp: item.existeNoERP,
    possuiConversao: item.possuiConversao,
  }));
}

export interface ResultadoNivelSubstituicao {
  codigoPai: string;
  descricaoPai: string | null;
  sucesso: boolean;
  mensagemErro: string | null;
}

/*
 * Uma estrutura pode ter vários níveis, e o mesmo código pode aparecer
 * como filho em mais de um nível diferente abaixo do raiz pesquisado —
 * a substituição precisa alcançar TODAS essas ocorrências, não só a
 * primeira. Agrupa os itens já buscados (ver buscarEstruturaCompleta)
 * pelo próprio pai direto de cada um, identifica quais desses grupos
 * contêm o código a substituir, e envia UM POST POR NÍVEL afetado
 * (decisão deliberada: mais fácil de isolar sucesso/erro por nível do
 * que um POST só com vários itemPai, mesmo que algum nível possa falhar
 * enquanto outros aplicam com sucesso — por isso o retorno é por
 * nível, não um booleano único).
 */
export async function substituirItemNaEstrutura(params: {
  cnpj: string;
  estrutura: EstruturaCompleta;
  codigoAntigo: string;
  codigoNovo: string;
  usuarioNome: string;
  empresaNome: string | null;
}): Promise<ResultadoNivelSubstituicao[]> {
  const { ambiente, urlAtualizarEstrutura } = await exigirConfig();

  const gruposPorPai = new Map<string, ItemNivelEstrutura[]>();
  for (const item of params.estrutura.itens) {
    const grupo = gruposPorPai.get(item.codigoPai);
    if (grupo) {
      grupo.push(item);
    } else {
      gruposPorPai.set(item.codigoPai, [item]);
    }
  }

  const niveisAfetados = [...gruposPorPai.entries()].filter(([, itens]) =>
    itens.some((item) => item.codigo === params.codigoAntigo)
  );

  if (niveisAfetados.length === 0) {
    throw new ValidationError(
      "O código a substituir não foi encontrado em nenhum nível desta estrutura."
    );
  }

  const resultados: ResultadoNivelSubstituicao[] = [];

  for (const [codigoPaiNivel, itensDoNivel] of niveisAfetados) {
    const descricaoPai = itensDoNivel[0]?.descricaoPai ?? null;

    const itensFilho = itensDoNivel.map((item) => ({
      codigo: item.codigo === params.codigoAntigo ? params.codigoNovo : item.codigo,
      caracteristicas: [] as unknown[],
      sequencia: item.sequencia,
      quantidade: item.quantidade,
      dataInicial: item.dataInicial,
      dataFinal: item.dataFinal,
    }));

    const payload = {
      cnpj: params.cnpj,
      itemPai: [
        {
          codigo: codigoPaiNivel,
          caracteristicas: [] as unknown[],
          itensFilho,
        },
      ],
    };
    const payloadEnviado = JSON.stringify(payload);

    /*
     * Loga TODA tentativa de envio (sucesso ou falha) na mesma estrutura
     * de monitoramento de "Integrações externas" já usada por AD/e-mail/
     * ERP de matéria-prima (ver src/lib/monitoramento/chamadas-externas.ts)
     * — dá pra validar uso real (quem, quando, com que frequência) e
     * status de saúde do endpoint direto em Administração →
     * Monitoramento, sem criar uma tabela de log nova só pra isso.
     */
    const inicio = performance.now();
    let sucesso = false;
    let mensagemErro: string | null = null;

    try {
      let resposta: Response;
      try {
        resposta = await fetch(urlAtualizarEstrutura, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        mensagemErro = "Não foi possível conectar ao serviço de atualização de estrutura.";
        throw new ValidationError(`${mensagemErro} Confira o endpoint configurado.`);
      }

      if (!resposta.ok) {
        let mensagem = `O serviço de atualização respondeu com erro (${resposta.status}).`;
        try {
          const corpo = (await resposta.json()) as { message?: string; error?: string };
          mensagem = corpo.message ?? corpo.error ?? mensagem;
        } catch {
          /* corpo não era JSON — mantém a mensagem genérica. */
        }
        mensagemErro = mensagem;
        throw new ValidationError(mensagem);
      }

      sucesso = true;
    } catch (error) {
      if (!(error instanceof ValidationError)) {
        mensagemErro = mensagemErro ?? "Erro inesperado ao aplicar a substituição neste nível.";
      }
    } finally {
      await registrarChamadaExternaSemFalhar({
        servico: "erp_estrutura",
        origem: "uso_real",
        sucesso,
        duracaoMs: performance.now() - inicio,
        mensagemErro,
      });

      await registrarHistoricoSubstituicaoSemFalhar({
        usuarioNome: params.usuarioNome,
        empresaNome: params.empresaNome,
        ambiente,
        codPai: codigoPaiNivel,
        codPaiRaiz: params.estrutura.codigoRaiz,
        codigoAntigo: params.codigoAntigo,
        codigoNovo: params.codigoNovo,
        sucesso,
        mensagemErro,
        payloadEnviado,
      });
    }

    resultados.push({ codigoPai: codigoPaiNivel, descricaoPai, sucesso, mensagemErro });
  }

  return resultados;
}

export interface HistoricoSubstituicaoItem {
  id: string;
  usuarioNome: string;
  empresaNome: string | null;
  ambiente: AmbienteEstruturaSubstituicao;
  codPai: string;
  codPaiRaiz: string | null;
  codigoAntigo: string;
  codigoNovo: string;
  sucesso: boolean;
  mensagemErro: string | null;
  payloadEnviado: string | null;
  criadoEm: string;
}

/*
 * Nunca lança — a substituição em si já foi resolvida (sucesso ou
 * falha) quando este registro roda; uma falha ao GRAVAR o histórico
 * não pode mascarar ou substituir o resultado real já decidido acima
 * (mesmo espírito de registrarChamadaExternaSemFalhar).
 */
async function registrarHistoricoSubstituicaoSemFalhar(params: {
  usuarioNome: string;
  empresaNome: string | null;
  ambiente: AmbienteEstruturaSubstituicao;
  codPai: string;
  codPaiRaiz: string;
  codigoAntigo: string;
  codigoNovo: string;
  sucesso: boolean;
  mensagemErro: string | null;
  payloadEnviado: string;
}): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("usuarioNome", sql.NVarChar(150), params.usuarioNome);
    request.input("empresaNome", sql.NVarChar(200), params.empresaNome);
    request.input("ambiente", sql.VarChar(10), params.ambiente);
    request.input("codPai", sql.NVarChar(60), params.codPai);
    request.input("codPaiRaiz", sql.NVarChar(60), params.codPaiRaiz);
    request.input("codigoAntigo", sql.NVarChar(60), params.codigoAntigo);
    request.input("codigoNovo", sql.NVarChar(60), params.codigoNovo);
    request.input("sucesso", sql.Bit, params.sucesso);
    request.input("mensagemErro", sql.NVarChar(500), params.mensagemErro?.slice(0, 500) ?? null);
    request.input("payloadEnviado", sql.NVarChar(sql.MAX), params.payloadEnviado);

    await request.query(`
      INSERT INTO dbo.eng_estrutura_substituicao_historico
        ([usuario_nome], [empresa_nome], [ambiente], [cod_pai], [cod_pai_raiz], [codigo_antigo], [codigo_novo], [sucesso], [mensagem_erro], [payload_enviado])
      VALUES (@usuarioNome, @empresaNome, @ambiente, @codPai, @codPaiRaiz, @codigoAntigo, @codigoNovo, @sucesso, @mensagemErro, @payloadEnviado);
    `);
  } catch (error) {
    console.error("Erro ao registrar histórico de substituição de estrutura:", error);
  }
}

export interface FiltrosHistoricoSubstituicao {
  codPai?: string;
}

export async function listarHistoricoSubstituicao(
  pagina: number,
  porPagina: number,
  filtros: FiltrosHistoricoSubstituicao = {}
): Promise<{ itens: HistoricoSubstituicaoItem[]; total: number }> {
  const pool = await getSqlServerPool();
  const offset = (pagina - 1) * porPagina;

  /*
   * A pesquisa por código pai vale tanto pro nível específico que foi
   * alterado (cod_pai) quanto pro código raiz que o usuário informou
   * na tela de busca (cod_pai_raiz) — numa estrutura de vários níveis,
   * o usuário pode lembrar só do código que digitou originalmente, não
   * necessariamente do nível intermediário onde a troca de fato caiu.
   */
  const condicoes: string[] = [];
  if (filtros.codPai) {
    condicoes.push("([cod_pai] = @codPai OR [cod_pai_raiz] = @codPai)");
  }
  const whereClause = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";

  const requestItens = pool.request();
  if (filtros.codPai) requestItens.input("codPai", sql.NVarChar(60), filtros.codPai);
  requestItens.input("offset", sql.Int, offset);
  requestItens.input("porPagina", sql.Int, porPagina);

  const requestTotal = pool.request();
  if (filtros.codPai) requestTotal.input("codPai", sql.NVarChar(60), filtros.codPai);

  const [itensResult, totalResult] = await Promise.all([
    requestItens.query<{
      id: string;
      usuario_nome: string;
      empresa_nome: string | null;
      ambiente: AmbienteEstruturaSubstituicao;
      cod_pai: string;
      cod_pai_raiz: string | null;
      codigo_antigo: string;
      codigo_novo: string;
      sucesso: boolean;
      mensagem_erro: string | null;
      payload_enviado: string | null;
      criado_em: string;
    }>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        [usuario_nome],
        [empresa_nome],
        [ambiente],
        [cod_pai],
        [cod_pai_raiz],
        [codigo_antigo],
        [codigo_novo],
        CAST([sucesso] AS BIT) AS [sucesso],
        [mensagem_erro],
        [payload_enviado],
        CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
      FROM dbo.eng_estrutura_substituicao_historico
      ${whereClause}
      ORDER BY [criado_em] DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `),
    requestTotal.query<{ total: number }>(`
      SELECT COUNT(*) AS [total]
      FROM dbo.eng_estrutura_substituicao_historico
      ${whereClause};
    `),
  ]);

  return {
    itens: itensResult.recordset.map((row) => ({
      id: row.id,
      usuarioNome: row.usuario_nome,
      empresaNome: row.empresa_nome,
      ambiente: row.ambiente,
      codPai: row.cod_pai,
      codPaiRaiz: row.cod_pai_raiz,
      codigoAntigo: row.codigo_antigo,
      codigoNovo: row.codigo_novo,
      sucesso: row.sucesso,
      mensagemErro: row.mensagem_erro,
      payloadEnviado: row.payload_enviado,
      criadoEm: row.criado_em,
    })),
    total: totalResult.recordset[0]?.total ?? 0,
  };
}
