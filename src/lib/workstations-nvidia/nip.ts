import "server-only";

import { createHash } from "node:crypto";

import { ValidationError } from "@/lib/auth/errors";
import type { ConfiguracaoPerfilNip } from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

/*
 * Leitura do formato .nip do NVIDIA Profile Inspector (XML de
 * <ArrayOfProfile>). Particularidades vistas nos exports reais:
 *
 * - O Profile Inspector grava em UTF-8 com BOM, mas declara
 *   encoding="utf-16" no cabeçalho — então a codificação é decidida pelo
 *   BOM, nunca pela declaração. Um .nip salvo em UTF-16 (BOM FF FE)
 *   também é aceito.
 * - A estrutura é fixa e rasa, então dá para ler com expressões
 *   regulares, sem dependência de parser XML.
 *
 * O hash é SHA-256 dos BYTES do arquivo, em maiúsculas — o mesmo que o
 * Get-FileHash do script da workstation calcula, para o portal comparar
 * o perfil aplicado em cada máquina com o perfil oficial.
 */

/*
 * Configurações que o próprio driver grava e que mudam de máquina para
 * máquina (ex: "List of Universal GPU ids" carrega o ID da GPU local) —
 * nunca entram no perfil oficial, para não espalhar o valor de uma
 * máquina nas outras.
 */
export const CONFIGURACOES_GERENCIADAS_PELO_DRIVER = new Set(["271929336"]);

export function decodificarNip(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString("utf16le");
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const invertido = Buffer.from(bytes.subarray(2));
    invertido.swap16();
    return invertido.toString("utf16le");
  }

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString("utf8");
  }

  return bytes.toString("utf8");
}

export function calcularHashNip(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function decodificarEntidadesXml(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function conteudoTag(bloco: string, tag: string): string {
  const autoFechada = new RegExp(`<${tag}\\s*/>`);
  if (autoFechada.test(bloco)) return "";

  const match = bloco.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodificarEntidadesXml(match[1].trim()) : "";
}

export function lerConfiguracoesNip(texto: string): ConfiguracaoPerfilNip[] {
  if (!/<ArrayOfProfile[\s>]/.test(texto)) {
    throw new ValidationError(
      "O arquivo não parece um perfil do NVIDIA Profile Inspector (.nip): falta o <ArrayOfProfile>."
    );
  }

  const configuracoes: ConfiguracaoPerfilNip[] = [];
  const perfis = texto.match(/<Profile>[\s\S]*?<\/Profile>/g) ?? [];

  for (const blocoPerfil of perfis) {
    const perfil = conteudoTag(blocoPerfil, "ProfileName");
    const blocoExecutaveis = blocoPerfil.match(/<Executeables>([\s\S]*?)<\/Executeables>/);
    const executaveis = blocoExecutaveis
      ? [...blocoExecutaveis[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) =>
          decodificarEntidadesXml(m[1].trim())
        )
      : [];

    const blocosConfiguracao = blocoPerfil.match(/<ProfileSetting>[\s\S]*?<\/ProfileSetting>/g) ?? [];

    for (const blocoConfiguracao of blocosConfiguracao) {
      configuracoes.push({
        perfil,
        executaveis,
        configuracaoId: conteudoTag(blocoConfiguracao, "SettingID"),
        configuracao: conteudoTag(blocoConfiguracao, "SettingNameInfo"),
        valor: conteudoTag(blocoConfiguracao, "SettingValue"),
        tipo: conteudoTag(blocoConfiguracao, "ValueType"),
      });
    }
  }

  return configuracoes;
}

/*
 * Prepara um .nip enviado pelo admin para virar o perfil oficial: tira as
 * configurações gerenciadas pelo driver e grava no mesmo formato que o
 * Profile Inspector usa (UTF-8 com BOM, quebras de linha CRLF).
 */
export function prepararNipParaPublicar(bytes: Buffer): {
  conteudo: Buffer;
  configuracoes: ConfiguracaoPerfilNip[];
  removidas: ConfiguracaoPerfilNip[];
} {
  const texto = decodificarNip(bytes);
  const originais = lerConfiguracoesNip(texto);

  const removidas = originais.filter((cfg) =>
    CONFIGURACOES_GERENCIADAS_PELO_DRIVER.has(cfg.configuracaoId)
  );

  let limpo = texto;
  for (const id of CONFIGURACOES_GERENCIADAS_PELO_DRIVER) {
    limpo = limpo.replace(
      new RegExp(
        `[ \\t]*<ProfileSetting>(?:(?!</ProfileSetting>)[\\s\\S])*?<SettingID>${id}</SettingID>[\\s\\S]*?</ProfileSetting>\\r?\\n?`,
        "g"
      ),
      ""
    );
  }

  const configuracoes = lerConfiguracoesNip(limpo);

  if (configuracoes.length === 0) {
    throw new ValidationError(
      "O perfil não tem nenhuma configuração para aplicar (depois de tirar as que o próprio driver gerencia)."
    );
  }

  const comCrlf = limpo.replace(/\r?\n/g, "\r\n");
  const conteudo = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(comCrlf, "utf8")]);

  return { conteudo, configuracoes, removidas };
}
