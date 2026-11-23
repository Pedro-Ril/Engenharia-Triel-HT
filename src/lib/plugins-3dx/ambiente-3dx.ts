import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import { montarEmailHtml } from "@/lib/smtp/template-email";
import type {
  Ambiente3dx,
  ArquivoVisualizacao3dx,
  Servidor3dx,
  StatusVerificacao3dx,
  VerificacaoAmbiente3dx,
  VerificacaoItem3dx,
} from "@/modules/plugins-3dx/types/plugins3dx.types";

import {
  ARQUIVOS_VISUALIZACAO,
  avaliarArquivoVisualizacao,
  situacaoGeralVisualizacao,
} from "./padrao-visualizacao";

/*
 * Verificação do ambiente 3DEXPERIENCE (migração 0175) -- o que pode quebrar num hotfix/atualização da Dassault.
 *
 * A cada 15 minutos, só lendo pela rede (sem login, sem instalar nada no 3DSpace, sem reinício):
 *  1. versão (build) do 3DSpace em cada nó de dbo.portal_3dx_servidores -- mudou = a Dassault foi atualizada;
 *  2. padrão de visualização do "Abrir com" em cada nó (mesma regra do aplicar_padrao_visualizacao.py --conferir);
 *  3. nós dos plugins (dbo.portal_3dx_plugins_nos): heartbeat parado há 10 min ou autoteste com falha.
 *
 * Só MUDANÇA de estado gera evento (portal_3dx_plugins_eventos) e e-mail para a lista do evento "ambiente_3dx"
 * (um e-mail por ambiente e rodada, com tudo o que mudou). A troca de estado é um UPDATE condicional: se dois
 * Portais rodarem a verificação (dev e produção), só um ganha e só um e-mail sai.
 */

export const EVENTO_AVISO_AMBIENTE = "ambiente_3dx";
const INTERVALO_MS = 15 * 60 * 1000;
const PRIMEIRA_RODADA_MS = 60 * 1000;
const TIMEOUT_MS = 20 * 1000;
/* um reinício do 3DSpace leva ~2 min; 10 min sem heartbeat já é problema de verdade */
const SEGUNDOS_PLUGIN_SEM_CONTATO = 10 * 60;
/* nó sem resposta só vira erro na segunda verificação seguida (um reinício não gera aviso) */
const FALHAS_PARA_ERRO = 2;
/* arquivo pequeno que todo deploy do 3DSpace regrava com o build: {"version":"6.428.4.26105"} */
const MARCADOR_VERSAO = "webapps/3DPlayExperienceModule/.3DPlayExperienceModule.mkversion.mk";

declare global {
  var ambiente3dxAgendadorIniciado: boolean | undefined;
  var ambiente3dxEmAndamento: Promise<ResultadoVerificacaoAmbiente> | undefined;
}

export interface ResultadoVerificacaoAmbiente {
  servidores: number;
  nosPlugins: number;
  mudancas: number;
}

interface Mudanca {
  ambiente: Ambiente3dx | null;
  nivel: "info" | "aviso" | "erro";
  pluginChave: string | null;
  no: string;
  titulo: string;
  texto: string;
}

interface ServidorRow {
  id: string;
  nome: string;
  ambiente: Ambiente3dx;
  url_base: string;
  ativo: boolean;
}

interface VerificacaoRow {
  servidor_id: string;
  item: string;
  status: StatusVerificacao3dx;
  valor: string | null;
  detalhe: string | null;
  falhas_seguidas: number;
  verificado_em: string;
  mudou_em: string;
}

interface NoPluginRow {
  plugin_chave: string;
  plugin_nome: string;
  no: string;
  ambiente: Ambiente3dx | null;
  autoteste: "ok" | "falha" | null;
  autoteste_detalhe: string | null;
  aviso_estado: string | null;
  segundos_sem_contato: number;
}

// ------------------------------------------------------------------ rede

type Leitura = { tipo: "ok"; texto: string } | { tipo: "nao_existe" } | { tipo: "sem_resposta"; erro: string };

async function ler(url: string): Promise<Leitura> {
  try {
    const resposta = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (resposta.status === 404) return { tipo: "nao_existe" };
    if (!resposta.ok) return { tipo: "sem_resposta", erro: `HTTP ${resposta.status}` };
    return { tipo: "ok", texto: await resposta.text() };
  } catch (erro) {
    const motivo = erro instanceof Error ? (erro.name === "TimeoutError" ? "tempo esgotado" : erro.message) : String(erro);
    return { tipo: "sem_resposta", erro: motivo };
  }
}

function lerVersao(texto: string): string | null {
  try {
    const v = (JSON.parse(texto) as { version?: unknown }).version;
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ estado

interface NovoEstado {
  status: StatusVerificacao3dx;
  valor: string | null;
  detalhe: string | null;
}

/*
 * Grava o estado de um item. Devolve true quando ESTA chamada mudou o status/valor (é quem avisa).
 * Primeira verificação de um item: só grava, sem aviso.
 */
async function gravarEstado(servidorId: string, item: string, atual: VerificacaoRow | undefined, novo: NovoEstado) {
  const pool = await getSqlServerPool();
  const req = () =>
    pool
      .request()
      .input("servidor", sql.UniqueIdentifier, servidorId)
      .input("item", sql.VarChar(40), item)
      .input("status", sql.VarChar(10), novo.status)
      .input("valor", sql.NVarChar(200), novo.valor)
      .input("detalhe", sql.NVarChar(4000), novo.detalhe ? novo.detalhe.slice(0, 4000) : null);

  if (!atual) {
    await req().query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_verificacoes WHERE [servidor_id] = @servidor AND [item] = @item)
        INSERT INTO dbo.portal_3dx_verificacoes ([servidor_id], [item], [status], [valor], [detalhe])
        VALUES (@servidor, @item, @status, @valor, @detalhe);
    `);
    return false;
  }
  if (atual.status === novo.status && (atual.valor ?? "") === (novo.valor ?? "")) {
    await req().query(`
      UPDATE dbo.portal_3dx_verificacoes
      SET [detalhe] = @detalhe, [falhas_seguidas] = 0, [verificado_em] = SYSDATETIME()
      WHERE [servidor_id] = @servidor AND [item] = @item;
    `);
    return false;
  }
  const r = await req()
    .input("statusAntes", sql.VarChar(10), atual.status)
    .input("valorAntes", sql.NVarChar(200), atual.valor ?? "")
    .query(`
      UPDATE dbo.portal_3dx_verificacoes
      SET [status] = @status, [valor] = @valor, [detalhe] = @detalhe, [falhas_seguidas] = 0,
        [verificado_em] = SYSDATETIME(), [mudou_em] = SYSDATETIME()
      WHERE [servidor_id] = @servidor AND [item] = @item AND [status] = @statusAntes AND ISNULL([valor], N'') = @valorAntes;
    `);
  return (r.rowsAffected[0] ?? 0) === 1;
}

/* Nó sem resposta: conta a falha; na segunda seguida, o item versao_3dx vira 'erro' (mantém a última versão lida). */
async function gravarSemResposta(servidorId: string, atual: VerificacaoRow | undefined, erro: string) {
  const pool = await getSqlServerPool();
  const detalhe = `Sem resposta: ${erro}`.slice(0, 4000);
  const falhas = (atual?.falhas_seguidas ?? 0) + 1;
  if (!atual) {
    await pool
      .request()
      .input("servidor", sql.UniqueIdentifier, servidorId)
      .input("detalhe", sql.NVarChar(4000), detalhe)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_verificacoes WHERE [servidor_id] = @servidor AND [item] = 'versao_3dx')
          INSERT INTO dbo.portal_3dx_verificacoes ([servidor_id], [item], [status], [detalhe], [falhas_seguidas])
          VALUES (@servidor, 'versao_3dx', 'erro', @detalhe, 1);
      `);
    return false;
  }
  const viraErro = falhas >= FALHAS_PARA_ERRO && atual.status !== "erro";
  const r = await pool
    .request()
    .input("servidor", sql.UniqueIdentifier, servidorId)
    .input("detalhe", sql.NVarChar(4000), detalhe)
    .input("falhas", sql.Int, falhas)
    .input("viraErro", sql.Bit, viraErro)
    .input("statusAntes", sql.VarChar(10), atual.status)
    .query(`
      UPDATE dbo.portal_3dx_verificacoes
      SET [falhas_seguidas] = @falhas, [verificado_em] = SYSDATETIME(),
        [detalhe] = CASE WHEN @viraErro = 1 OR [status] = 'erro' THEN @detalhe ELSE [detalhe] END,
        [status] = CASE WHEN @viraErro = 1 THEN 'erro' ELSE [status] END,
        [mudou_em] = CASE WHEN @viraErro = 1 THEN SYSDATETIME() ELSE [mudou_em] END
      WHERE [servidor_id] = @servidor AND [item] = 'versao_3dx' AND [status] = @statusAntes;
    `);
  return viraErro && (r.rowsAffected[0] ?? 0) === 1;
}

// ------------------------------------------------------------------ verificações

const TEXTO_VISUALIZACAO = {
  perdido:
    "O padrão de visualização do \"Abrir com\" voltou ao original da Dassault (provável hotfix/redeploy). " +
    "Reaplicar com aplicar_padrao_visualizacao.py --aplicar e limpar o cache do navegador.",
  mudou:
    "A Dassault mudou arquivos do visualizador: o script não reaplica sozinho. Analisar os arquivos novos no " +
    "dev-plm e ajustar o script antes de reaplicar.",
  aplicado: "Padrão de visualização do \"Abrir com\" aplicado.",
};

async function verificarServidor(servidor: ServidorRow, atuais: VerificacaoRow[]): Promise<Mudanca[]> {
  const mudancas: Mudanca[] = [];
  const base = servidor.url_base.replace(/\/+$/, "");
  const atualVersao = atuais.find((a) => a.item === "versao_3dx");
  const atualVisu = atuais.find((a) => a.item === "visualizacao");
  const mudanca = (nivel: Mudanca["nivel"], titulo: string, texto: string) =>
    mudancas.push({ ambiente: servidor.ambiente, nivel, pluginChave: null, no: servidor.nome, titulo, texto });

  // 1. versão (e se o nó responde)
  const leitura = await ler(`${base}/${MARCADOR_VERSAO}`);
  if (leitura.tipo === "sem_resposta") {
    if (await gravarSemResposta(servidor.id, atualVersao, leitura.erro)) {
      mudanca(
        "erro",
        `${servidor.nome}: 3DSpace não responde`,
        `Duas verificações seguidas sem resposta em ${base} (${leitura.erro}).`
      );
    }
    return mudancas; // sem resposta: o padrão de visualização fica com o último estado conhecido
  }
  const versao = leitura.tipo === "ok" ? lerVersao(leitura.texto) : null;
  const novoVersao: NovoEstado = versao
    ? { status: "ok", valor: versao, detalhe: null }
    : {
        status: "alerta",
        valor: atualVersao?.valor ?? null,
        detalhe: "Marcador de versão não encontrado (a Dassault pode ter mudado o arquivo).",
      };
  if (await gravarEstado(servidor.id, "versao_3dx", atualVersao, novoVersao)) {
    const voltou = atualVersao?.status === "erro";
    if (atualVersao?.valor && versao && atualVersao.valor !== versao) {
      /* o caso que importa: hotfix aplicado (o nó costuma ficar fora do ar durante o deploy) */
      mudanca(
        "aviso",
        `${servidor.nome}: 3DEXPERIENCE atualizado (build ${atualVersao.valor} → ${versao})`,
        (voltou ? "O nó voltou a responder já com outra versão. " : "") +
          "A Dassault foi atualizada neste nó. Conferir os plugins (autoteste e execuções) e o padrão de visualização."
      );
    } else if (novoVersao.status === "alerta") {
      mudanca("aviso", `${servidor.nome}: versão do 3DSpace não identificada`, novoVersao.detalhe ?? "");
    } else if (voltou) {
      mudanca("info", `${servidor.nome}: 3DSpace voltou a responder`, `Build ${versao}.`);
    }
  }

  // 2. padrão de visualização
  const leituras = await Promise.all(ARQUIVOS_VISUALIZACAO.map((a) => ler(`${base}/webapps/${a.caminho}`)));
  if (leituras.some((l) => l.tipo === "sem_resposta")) return mudancas; // tenta de novo na próxima rodada
  const arquivos: ArquivoVisualizacao3dx[] = ARQUIVOS_VISUALIZACAO.map((a, i) => {
    const l = leituras[i];
    const r = avaliarArquivoVisualizacao(a.caminho, l.tipo === "ok" ? l.texto : null);
    return { caminho: a.caminho, descricao: a.descricao, situacao: r.situacao, mensagem: r.mensagem };
  });
  const geral = situacaoGeralVisualizacao(arquivos.map((a) => a.situacao));
  const status: StatusVerificacao3dx = geral === "aplicado" ? "ok" : geral === "perdido" ? "alerta" : "erro";
  const detalhe = JSON.stringify({ arquivos: arquivos.map(({ caminho, situacao, mensagem }) => ({ caminho, situacao, mensagem })) });
  if (await gravarEstado(servidor.id, "visualizacao", atualVisu, { status, valor: geral, detalhe })) {
    const problemas = arquivos
      .filter((a) => a.situacao !== "aplicado")
      .map((a) => `${a.caminho}: ${a.mensagem ?? a.situacao}`);
    mudanca(
      geral === "aplicado" ? "info" : geral === "perdido" ? "aviso" : "erro",
      `${servidor.nome}: padrão de visualização ${geral === "aplicado" ? "aplicado" : geral === "perdido" ? "perdido" : "precisa de análise"}`,
      [TEXTO_VISUALIZACAO[geral], ...problemas].join("\n")
    );
  }
  return mudancas;
}

function estadoNoPlugin(no: NoPluginRow): "ok" | "sem_contato" | "incompativel" {
  if (no.segundos_sem_contato > SEGUNDOS_PLUGIN_SEM_CONTATO) return "sem_contato";
  if (no.autoteste === "falha") return "incompativel";
  return "ok";
}

async function verificarNosPlugins(): Promise<{ total: number; mudancas: Mudanca[] }> {
  const pool = await getSqlServerPool();
  const nos = await pool.request().query<NoPluginRow>(`
    SELECT n.[plugin_chave], p.[nome] AS [plugin_nome], n.[no], n.[ambiente], n.[autoteste], n.[autoteste_detalhe],
      n.[aviso_estado], DATEDIFF(SECOND, n.[ultimo_contato], SYSDATETIME()) AS [segundos_sem_contato]
    FROM dbo.portal_3dx_plugins_nos n
    JOIN dbo.portal_3dx_plugins p ON p.[chave] = n.[plugin_chave];
  `);
  const mudancas: Mudanca[] = [];
  for (const no of nos.recordset) {
    const estado = estadoNoPlugin(no);
    if ((no.aviso_estado ?? "") === estado) continue;
    const r = await pool
      .request()
      .input("plugin", sql.VarChar(40), no.plugin_chave)
      .input("no", sql.VarChar(200), no.no)
      .input("estado", sql.VarChar(20), estado)
      .input("antes", sql.VarChar(20), no.aviso_estado ?? "")
      .query(`
        UPDATE dbo.portal_3dx_plugins_nos SET [aviso_estado] = @estado
        WHERE [plugin_chave] = @plugin AND [no] = @no AND ISNULL([aviso_estado], '') = @antes;
      `);
    if ((r.rowsAffected[0] ?? 0) !== 1) continue; // outro Portal já tratou
    if (no.aviso_estado === null && estado === "ok") continue; // primeira vez, tudo certo: sem aviso

    const base = { ambiente: no.ambiente, pluginChave: no.plugin_chave, no: no.no };
    if (estado === "sem_contato") {
      mudancas.push({
        ...base,
        nivel: "erro",
        titulo: `${no.plugin_nome}: sem contato no nó ${no.no}`,
        texto:
          `Nenhum heartbeat há ${Math.round(no.segundos_sem_contato / 60)} min. Causas comuns: 3DSpace parado, ` +
          "jar removido por um hotfix/redeploy (conferir se os jars estão no STAGING) ou nó sem acesso ao banco do Portal.",
      });
    } else if (estado === "incompativel") {
      mudancas.push({
        ...base,
        nivel: "erro",
        titulo: `${no.plugin_nome}: incompatível com o 3DEXPERIENCE do nó ${no.no}`,
        texto:
          "O autoteste do núcleo não achou partes internas da Dassault que o plugin usa (provável hotfix). " +
          `O plugin vai falhar até ser ajustado.\nFaltando: ${no.autoteste_detalhe ?? "?"}`,
      });
    } else {
      mudancas.push({ ...base, nivel: "info", titulo: `${no.plugin_nome}: normal no nó ${no.no}`, texto: "Voltou ao normal." });
    }
  }
  return { total: nos.recordset.length, mudancas };
}

// ------------------------------------------------------------------ avisos

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function destinatariosAmbiente(ambiente: Ambiente3dx | null): Promise<string[]> {
  const pool = await getSqlServerPool();
  const r = await pool
    .request()
    .input("evento", sql.VarChar(40), EVENTO_AVISO_AMBIENTE)
    .input("ambiente", sql.VarChar(10), ambiente)
    .query<{ email: string | null }>(`
      SELECT COALESCE(u.[email], d.[email]) AS [email]
      FROM dbo.portal_3dx_plugins_destinatarios d
      LEFT JOIN dbo.portal_usuarios u ON u.[id] = d.[usuario_id]
      WHERE d.[plugin_chave] IS NULL AND d.[evento] = @evento AND d.[ativo] = 1
        AND (d.[ambiente] IS NULL OR d.[ambiente] = @ambiente)
        AND (d.[usuario_id] IS NULL OR u.[ativo] = 1);
    `);
  return [...new Set(r.recordset.map((x) => x.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e)))];
}

const COR_NIVEL = { info: "#15803d", aviso: "#b45309", erro: "#b91c1c" } as const;

/* Um e-mail por ambiente com tudo o que mudou nesta rodada; cada mudança vira um evento (com o resultado do envio). */
async function avisar(mudancas: Mudanca[]): Promise<void> {
  const pool = await getSqlServerPool();
  const porAmbiente = new Map<Ambiente3dx | null, Mudanca[]>();
  for (const m of mudancas) porAmbiente.set(m.ambiente, [...(porAmbiente.get(m.ambiente) ?? []), m]);

  for (const [ambiente, lista] of porAmbiente) {
    let envio: string;
    const emails = await destinatariosAmbiente(ambiente);
    if (emails.length === 0) {
      envio = "Sem destinatários para o evento ambiente_3dx.";
    } else {
      const prefixo = ambiente === "TESTE" ? "[TESTE] " : "";
      const assunto = `${prefixo}3DEXPERIENCE: ${lista[0].titulo}${lista.length > 1 ? ` (+${lista.length - 1})` : ""}`;
      const corpo = `
        <p style="margin: 0 0 14px;">Verificação do ambiente 3DEXPERIENCE pelo Portal Triel-HT${
          ambiente ? ` (${ambiente === "PRODUCAO" ? "produção" : "teste"})` : ""
        }:</p>
        ${lista
          .map(
            (m) => `
          <div style="margin: 0 0 14px; padding: 10px 12px; border-left: 4px solid ${COR_NIVEL[m.nivel]}; background: #f9fafb;">
            <div style="font-weight: 600; margin: 0 0 4px;">${escaparHtml(m.titulo)}</div>
            <div style="font-size: 13px; white-space: pre-line;">${escaparHtml(m.texto)}</div>
          </div>`
          )
          .join("")}
        <p style="margin: 0; font-size: 12px; color: #6b7280;">Detalhes em Administração &gt; Plugins 3DX.</p>`;
      try {
        await enviarEmail({ destinatario: emails, assunto: assunto.slice(0, 300), corpoHtml: montarEmailHtml(corpo) });
        envio = `Aviso enviado para ${emails.length} destinatário(s).`;
      } catch (erro) {
        envio = `Falha ao enviar o aviso: ${erro instanceof Error ? erro.message : String(erro)}`;
        console.error("Erro ao enviar aviso do ambiente 3DX:", erro);
      }
    }
    for (const m of lista) {
      await pool
        .request()
        .input("plugin", sql.VarChar(40), m.pluginChave)
        .input("ambiente", sql.VarChar(10), m.ambiente)
        .input("no", sql.VarChar(200), m.no.slice(0, 200))
        .input("nivel", sql.VarChar(5), m.nivel)
        .input("mensagem", sql.NVarChar(1000), m.titulo.slice(0, 1000))
        .input("detalhe", sql.NVarChar(sql.MAX), `${m.texto}\n\n${envio}`)
        .query(`
          INSERT INTO dbo.portal_3dx_plugins_eventos ([plugin_chave], [ambiente], [no], [nivel], [mensagem], [detalhe])
          VALUES (@plugin, @ambiente, @no, @nivel, @mensagem, @detalhe);
        `);
    }
  }
}

// ------------------------------------------------------------------ entrada

async function executarVerificacao(): Promise<ResultadoVerificacaoAmbiente> {
  const pool = await getSqlServerPool();
  const [servidores, verificacoes] = await Promise.all([
    pool.request().query<ServidorRow>(`
      SELECT CONVERT(VARCHAR(36), [id]) AS [id], [nome], [ambiente], [url_base], [ativo]
      FROM dbo.portal_3dx_servidores WHERE [ativo] = 1 ORDER BY [ordem];
    `),
    pool.request().query<VerificacaoRow>(`
      SELECT CONVERT(VARCHAR(36), [servidor_id]) AS [servidor_id], [item], [status], [valor], [detalhe], [falhas_seguidas],
        CONVERT(VARCHAR(33), [verificado_em], 126) AS [verificado_em], CONVERT(VARCHAR(33), [mudou_em], 126) AS [mudou_em]
      FROM dbo.portal_3dx_verificacoes;
    `),
  ]);
  const porServidor = await Promise.all(
    servidores.recordset.map((s) =>
      verificarServidor(
        s,
        verificacoes.recordset.filter((v) => v.servidor_id === s.id)
      ).catch((erro) => {
        console.error(`Erro ao verificar o nó ${s.nome} do 3DSpace:`, erro);
        return [] as Mudanca[];
      })
    )
  );
  const plugins = await verificarNosPlugins();
  const mudancas = [...porServidor.flat(), ...plugins.mudancas];
  if (mudancas.length > 0) await avisar(mudancas);
  return { servidores: servidores.recordset.length, nosPlugins: plugins.total, mudancas: mudancas.length };
}

/* Uma verificação por vez neste processo: quem chamar durante uma em andamento recebe o resultado dela. */
export function verificarAmbiente3dx(): Promise<ResultadoVerificacaoAmbiente> {
  if (!global.ambiente3dxEmAndamento) {
    global.ambiente3dxEmAndamento = executarVerificacao().finally(() => {
      global.ambiente3dxEmAndamento = undefined;
    });
  }
  return global.ambiente3dxEmAndamento;
}

function mapearItem(row: VerificacaoRow | undefined): VerificacaoItem3dx | null {
  if (!row) return null;
  const json = row.detalhe?.startsWith("{");
  return {
    status: row.status,
    valor: row.valor,
    mensagem: json ? null : row.detalhe,
    verificadoEm: row.verificado_em,
    mudouEm: row.mudou_em,
  };
}

function lerArquivos(detalhe: string | null): ArquivoVisualizacao3dx[] {
  try {
    const o = JSON.parse(detalhe ?? "") as { arquivos?: { caminho: string; situacao: string; mensagem: string | null }[] };
    return (o.arquivos ?? []).map((a) => ({
      caminho: a.caminho,
      descricao: ARQUIVOS_VISUALIZACAO.find((x) => x.caminho === a.caminho)?.descricao ?? a.caminho,
      situacao: a.situacao as ArquivoVisualizacao3dx["situacao"],
      mensagem: a.mensagem,
    }));
  } catch {
    return [];
  }
}

export async function buscarVerificacaoAmbiente3dx(): Promise<VerificacaoAmbiente3dx> {
  const pool = await getSqlServerPool();
  const [servidores, verificacoes] = await Promise.all([
    pool.request().query<ServidorRow>(`
      SELECT CONVERT(VARCHAR(36), [id]) AS [id], [nome], [ambiente], [url_base], [ativo]
      FROM dbo.portal_3dx_servidores ORDER BY [ordem], [nome];
    `),
    pool.request().query<VerificacaoRow>(`
      SELECT CONVERT(VARCHAR(36), [servidor_id]) AS [servidor_id], [item], [status], [valor], [detalhe], [falhas_seguidas],
        CONVERT(VARCHAR(33), [verificado_em], 126) AS [verificado_em], CONVERT(VARCHAR(33), [mudou_em], 126) AS [mudou_em]
      FROM dbo.portal_3dx_verificacoes;
    `),
  ]);
  const lista: Servidor3dx[] = servidores.recordset.map((s) => {
    const doServidor = verificacoes.recordset.filter((v) => v.servidor_id === s.id);
    const visu = doServidor.find((v) => v.item === "visualizacao");
    const itemVisu = mapearItem(visu);
    return {
      id: s.id.toLowerCase(),
      nome: s.nome,
      ambiente: s.ambiente,
      urlBase: s.url_base,
      ativo: s.ativo,
      versao3dx: mapearItem(doServidor.find((v) => v.item === "versao_3dx")),
      visualizacao: itemVisu ? { ...itemVisu, arquivos: lerArquivos(visu?.detalhe ?? null) } : null,
    };
  });
  const datas = verificacoes.recordset.map((v) => v.verificado_em).sort();
  return {
    servidores: lista,
    intervaloMinutos: INTERVALO_MS / 60000,
    ultimaVerificacaoEm: datas.length ? datas[datas.length - 1] : null,
  };
}

export function iniciarAgendadorAmbiente3dx() {
  if (global.ambiente3dxAgendadorIniciado) return;
  global.ambiente3dxAgendadorIniciado = true;

  const rodar = () =>
    verificarAmbiente3dx().catch((erro) => {
      /* Sem a migração 0175 as tabelas não existem: só registra, não derruba o servidor. */
      console.error("Erro na verificação do ambiente 3DX:", erro);
    });
  setTimeout(rodar, PRIMEIRA_RODADA_MS);
  setInterval(rodar, INTERVALO_MS);
}
