import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { OrigemChamadaExterna, ServicoExterno } from "./chamadas-externas";

/*
 * O jeito padrão de chamar um serviço de fora do portal.
 *
 * Em vez de cada módulo fazer o seu fetch e (talvez) registrar algo
 * depois, a chamada passa por aqui e fica gravada sozinha: endereço,
 * método, o que foi enviado, o que voltou, o status HTTP, quanto
 * demorou e quem pediu. É isso que aparece em Administração >
 * Monitoramento > Logs e no status dos serviços.
 *
 * O registro NUNCA atrapalha a chamada real: falha ao gravar vai para
 * o console e o fluxo segue. Se o serviço externo cair, quem trata é
 * quem chamou -- aqui a exceção é registrada e re-lançada igual.
 *
 * LIMITE CONHECIDO: só cobre chamada feita pelo servidor. Hoje alguns
 * módulos falam com o ERP direto do navegador (Cadastro de Roteiro,
 * Consulta de Estrutura, Revisão de Projeto e a busca do Terminal de
 * Fábrica) -- essas o servidor não vê, e para entrarem aqui precisam
 * antes passar a ir por uma rota do portal.
 */

/*
 * Corpo guardado cortado: o que serve para investigar é o começo da
 * resposta (erro do ERP, primeiros registros), não o anexo inteiro.
 * Sem corte, uma consulta grande sozinha ocuparia megabytes por linha.
 */
const LIMITE_CORPO = 8 * 1024;

/*
 * Cabeçalhos não são gravados: é onde moram token e cookie, e nenhum
 * deles tem lugar no banco de log.
 *
 * Mas segredo também viaja na QUERY STRING -- o integrador do Focco,
 * por exemplo, recebe a chave de API em "?chave=". Gravar a URL crua
 * colocaria essa chave em claro numa tabela que qualquer administrador
 * lê. Estes nomes de parâmetro têm o valor trocado por "***".
 */
const PARAMETROS_SECRETOS = [
  "chave",
  "token",
  "access_token",
  "api_key",
  "apikey",
  "key",
  "senha",
  "password",
  "secret",
  "client_secret",
];

function mascararUrl(url: string): string {
  try {
    const endereco = new URL(url);
    let mexeu = false;

    for (const [nome] of [...endereco.searchParams]) {
      if (PARAMETROS_SECRETOS.includes(nome.toLowerCase())) {
        endereco.searchParams.set(nome, "***");
        mexeu = true;
      }
    }

    return mexeu ? endereco.toString() : url;
  } catch {
    /* Não é URL absoluta: devolve como veio, sem inventar. */
    return url;
  }
}

export interface ContextoIntegracao {
  servico: ServicoExterno;
  /* Para o log aparecer sob o módulo certo no filtro da tela. */
  moduloChave?: string | null;
  origem?: OrigemChamadaExterna;
  usuarioId?: string | null;
}

function cortar(texto: string | null | undefined): string | null {
  if (!texto) return null;
  if (texto.length <= LIMITE_CORPO) return texto;

  return `${texto.slice(0, LIMITE_CORPO)}\n[...] (cortado em ${LIMITE_CORPO} caracteres)`;
}

/*
 * O corpo enviado, como texto. FormData e stream não viram texto de
 * forma barata nem útil, então viram só uma descrição.
 */
function descreverRequisicao(init?: RequestInit): string | null {
  const corpo = init?.body;
  if (corpo === undefined || corpo === null) return null;

  if (typeof corpo === "string") return cortar(corpo);
  if (corpo instanceof URLSearchParams) return cortar(corpo.toString());
  if (corpo instanceof FormData) return "[FormData]";

  return "[corpo binário]";
}

async function registrar(dados: {
  servico: ServicoExterno;
  moduloChave: string | null;
  origem: OrigemChamadaExterna;
  metodo: string;
  url: string;
  requisicao: string | null;
  statusHttp: number | null;
  resposta: string | null;
  sucesso: boolean;
  duracaoMs: number;
  mensagemErro: string | null;
  usuarioId: string | null;
}): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("servico", sql.VarChar(40), dados.servico);
    request.input("moduloChave", sql.VarChar(60), dados.moduloChave);
    request.input("origem", sql.VarChar(20), dados.origem);
    request.input("metodo", sql.VarChar(10), dados.metodo.slice(0, 10));
    request.input("url", sql.NVarChar(1000), dados.url.slice(0, 1000));
    request.input("requisicao", sql.NVarChar(sql.MAX), dados.requisicao);
    request.input("statusHttp", sql.Int, dados.statusHttp);
    request.input("resposta", sql.NVarChar(sql.MAX), dados.resposta);
    request.input("sucesso", sql.Bit, dados.sucesso);
    request.input("duracaoMs", sql.Int, Math.round(dados.duracaoMs));
    request.input("mensagemErro", sql.NVarChar(500), dados.mensagemErro?.slice(0, 500) ?? null);
    request.input("usuarioId", sql.UniqueIdentifier, dados.usuarioId);

    await request.query(`
      INSERT INTO dbo.portal_monitoramento_chamadas_externas
        ([servico], [modulo_chave], [origem], [metodo], [url], [requisicao],
         [status_http], [resposta], [sucesso], [duracao_ms], [mensagem_erro], [usuario_id])
      VALUES
        (@servico, @moduloChave, @origem, @metodo, @url, @requisicao,
         @statusHttp, @resposta, @sucesso, @duracaoMs, @mensagemErro, @usuarioId);
    `);
  } catch (error) {
    console.error("Erro ao registrar chamada externa:", error);
  }
}

/*
 * Troca direta de `fetch` para falar com serviço externo.
 *
 * A Response devolvida não foi consumida: o corpo é lido de uma cópia,
 * então quem chamou continua podendo usar .json() ou .text()
 * normalmente.
 */
export async function fetchMonitorado(
  url: string,
  init: RequestInit | undefined,
  contexto: ContextoIntegracao
): Promise<Response> {
  const inicio = performance.now();
  const metodo = init?.method ?? "GET";
  const requisicao = descreverRequisicao(init);

  try {
    const resposta = await fetch(url, init);

    /* Clona para ler sem gastar o corpo de quem chamou. */
    let corpoResposta: string | null = null;
    try {
      corpoResposta = cortar(await resposta.clone().text());
    } catch {
      corpoResposta = "[não foi possível ler o corpo da resposta]";
    }

    await registrar({
      servico: contexto.servico,
      moduloChave: contexto.moduloChave ?? null,
      origem: contexto.origem ?? "uso_real",
      metodo,
      url: mascararUrl(url),
      requisicao,
      statusHttp: resposta.status,
      resposta: corpoResposta,
      /* Status 4xx/5xx é falha do ponto de vista de quem monitora,
         mesmo que o fetch em si não tenha lançado. */
      sucesso: resposta.ok,
      duracaoMs: performance.now() - inicio,
      mensagemErro: resposta.ok ? null : `HTTP ${resposta.status} ${resposta.statusText}`.trim(),
      usuarioId: contexto.usuarioId ?? null,
    });

    return resposta;
  } catch (erro) {
    /* Rede fora, DNS, timeout: não há resposta nenhuma. */
    await registrar({
      servico: contexto.servico,
      moduloChave: contexto.moduloChave ?? null,
      origem: contexto.origem ?? "uso_real",
      metodo,
      url: mascararUrl(url),
      requisicao,
      statusHttp: null,
      resposta: null,
      sucesso: false,
      duracaoMs: performance.now() - inicio,
      mensagemErro: erro instanceof Error ? erro.message : String(erro),
      usuarioId: contexto.usuarioId ?? null,
    });

    throw erro;
  }
}

/*
 * Para integração que não é HTTP (Firebird, LDAP): mede e registra do
 * mesmo jeito, com a "url" servindo de identificação do destino.
 */
export async function medirIntegracao<T>(
  contexto: ContextoIntegracao & { descricao: string; requisicao?: string | null },
  executar: () => Promise<T>
): Promise<T> {
  const inicio = performance.now();

  try {
    const resultado = await executar();

    await registrar({
      servico: contexto.servico,
      moduloChave: contexto.moduloChave ?? null,
      origem: contexto.origem ?? "uso_real",
      metodo: "-",
      url: contexto.descricao,
      requisicao: cortar(contexto.requisicao),
      statusHttp: null,
      resposta: null,
      sucesso: true,
      duracaoMs: performance.now() - inicio,
      mensagemErro: null,
      usuarioId: contexto.usuarioId ?? null,
    });

    return resultado;
  } catch (erro) {
    await registrar({
      servico: contexto.servico,
      moduloChave: contexto.moduloChave ?? null,
      origem: contexto.origem ?? "uso_real",
      metodo: "-",
      url: contexto.descricao,
      requisicao: cortar(contexto.requisicao),
      statusHttp: null,
      resposta: null,
      sucesso: false,
      duracaoMs: performance.now() - inicio,
      mensagemErro: erro instanceof Error ? erro.message : String(erro),
      usuarioId: contexto.usuarioId ?? null,
    });

    throw erro;
  }
}
