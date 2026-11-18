import "server-only";

import { readFile } from "node:fs/promises";
import net from "node:net";

import type { DivergenciaPerfil } from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

import { MARCADOR_COMPUTADOR } from "./config";

/*
 * Leitura do estado.json que workstations-nvidia/Verificar-PerfilNvidia.ps1
 * grava em cada workstation, direto pela rede (caminho UNC da
 * configuração, com {computador} trocado pelo nome da máquina).
 *
 * Antes de tocar no arquivo, testa a porta 445 (SMB) com tempo curto:
 * uma máquina desligada faria o readFile esperar o timeout do SMB do
 * Windows (dezenas de segundos) ocupando uma thread do pool do libuv —
 * que é compartilhado com o resto do portal (fs, crypto, dns). Com o
 * teste, máquina desligada é descartada em ~3s sem nem abrir o arquivo.
 */

const PORTA_SMB = 445;
const TIMEOUT_PORTA_MS = 3000;
const TIMEOUT_LEITURA_MS = 15000;

export interface EstadoWorkstation {
  computador: string | null;
  executadoComo: string | null;
  verificadoEm: string | null;
  gpu: {
    nome: string | null;
    driverWindows: string | null;
    driverNvidia: string | null;
    dataDriver: string | null;
  } | null;
  perfilHash: string | null;
  conforme: boolean;
  acao: string | null;
  divergenciasEncontradas: DivergenciaPerfil[];
  divergenciasAposReaplicar: DivergenciaPerfil[];
  ultimaReaplicacao: {
    em: string | null;
    sucesso: boolean | null;
  } | null;
  erro: string | null;
}

export type ResultadoLeituraEstado =
  | { ok: true; estado: EstadoWorkstation }
  | { ok: false; erro: string };

export function montarCaminhoEstado(modelo: string, computador: string): string {
  return modelo.split(MARCADOR_COMPUTADOR).join(computador);
}

function portaAberta(host: string, porta: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: porta });
    const finalizar = (aberta: boolean) => {
      socket.destroy();
      resolve(aberta);
    };
    socket.setTimeout(timeoutMs, () => finalizar(false));
    socket.once("connect", () => finalizar(true));
    socket.once("error", () => finalizar(false));
  });
}

function comTimeout<T>(promessa: Promise<T>, timeoutMs: number, mensagem: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(mensagem)), timeoutMs);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

function texto(valor: unknown, max = 1000): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo.slice(0, max) : null;
}

function booleano(valor: unknown): boolean | null {
  return typeof valor === "boolean" ? valor : null;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

/*
 * O ConvertTo-Json do PowerShell 5.1 grava um array de 1 item como
 * array mesmo (o script força isso), mas aceita objeto solto por
 * segurança.
 */
function divergencias(valor: unknown): DivergenciaPerfil[] {
  const lista = Array.isArray(valor) ? valor : objeto(valor) ? [valor] : [];

  return lista
    .map(objeto)
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ({
      perfil: texto(item.perfil, 200) ?? "",
      configuracaoId: texto(item.configuracaoId, 20) ?? "",
      configuracao: texto(item.configuracao, 200) ?? "",
      esperado: texto(item.esperado, 200) ?? "",
      encontrado: texto(item.encontrado, 200),
    }));
}

export function interpretarEstado(conteudo: string): EstadoWorkstation {
  const bruto: unknown = JSON.parse(conteudo.replace(/^﻿/, ""));
  const raiz = objeto(bruto);
  if (!raiz) throw new Error("O estado.json não contém um objeto JSON.");

  const gpu = objeto(raiz.gpu);
  const perfil = objeto(raiz.perfilOficial);
  const reaplicacao = objeto(raiz.ultimaReaplicacao);

  return {
    computador: texto(raiz.computador, 100),
    executadoComo: texto(raiz.executadoComo, 150),
    verificadoEm: texto(raiz.verificadoEm, 40),
    gpu: gpu
      ? {
          nome: texto(gpu.nome, 150),
          driverWindows: texto(gpu.driverWindows, 30),
          driverNvidia: texto(gpu.driverNvidia, 20),
          dataDriver: texto(gpu.dataDriver, 10),
        }
      : null,
    perfilHash: perfil ? texto(perfil.hash, 64) : null,
    conforme: raiz.conforme === true,
    acao: texto(raiz.acao, 30),
    divergenciasEncontradas: divergencias(raiz.divergenciasEncontradas),
    divergenciasAposReaplicar: divergencias(raiz.divergenciasAposReaplicar),
    ultimaReaplicacao: reaplicacao
      ? { em: texto(reaplicacao.em, 40), sucesso: booleano(reaplicacao.sucesso) }
      : null,
    erro: texto(raiz.erro, 1000),
  };
}

function descreverErroLeitura(error: unknown, caminho: string): string {
  const codigo = (error as NodeJS.ErrnoException)?.code;

  if (codigo === "ENOENT") {
    return `O estado.json não existe em ${caminho} — o script ainda não rodou nessa máquina?`;
  }
  if (codigo === "EACCES" || codigo === "EPERM") {
    return `Sem permissão para ler ${caminho} com a conta que roda o portal.`;
  }
  if (error instanceof SyntaxError) {
    return "O estado.json está com um JSON inválido.";
  }
  return error instanceof Error ? error.message : "Erro desconhecido ao ler o estado.json.";
}

export async function lerEstadoWorkstation(
  computador: string,
  modeloCaminho: string
): Promise<ResultadoLeituraEstado> {
  const acessivel = await portaAberta(computador, PORTA_SMB, TIMEOUT_PORTA_MS);

  if (!acessivel) {
    return {
      ok: false,
      erro: "Máquina inacessível pela rede (desligada, fora da rede ou porta 445 bloqueada).",
    };
  }

  const caminho = montarCaminhoEstado(modeloCaminho, computador);

  try {
    const bytes = await comTimeout(
      readFile(caminho),
      TIMEOUT_LEITURA_MS,
      `A leitura de ${caminho} passou de ${TIMEOUT_LEITURA_MS / 1000}s.`
    );
    return { ok: true, estado: interpretarEstado(bytes.toString("utf8")) };
  } catch (error) {
    return { ok: false, erro: descreverErroLeitura(error, caminho) };
  }
}
