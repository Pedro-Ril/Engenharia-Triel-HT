import "server-only";

import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { ValidationError } from "@/lib/auth/errors";
import type {
  ConfiguracaoPerfilNip,
  PerfilOficialNvidia,
} from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

import { buscarConfiguracaoNvidia, NOME_ARQUIVO_PERFIL } from "./config";
import { registrarEventoSemFalhar } from "./eventos";
import { calcularHashNip, decodificarNip, lerConfiguracoesNip, prepararNipParaPublicar } from "./nip";

/*
 * O perfil oficial mora numa pasta central da rede (configuração
 * "pasta_perfil", ex: \\trielht.local\NETLOGON\NvidiaProfile) como
 * perfil-padrao.nip. O GPO copia esse arquivo para cada workstation
 * (C:\ProgramData\TI\NvidiaProfile\perfil-padrao.nip) e o script aplica.
 * O portal só lê e substitui o arquivo da pasta central.
 */

const TAMANHO_MAXIMO_NIP = 2 * 1024 * 1024;

function caminhoPerfil(pastaPerfil: string): string {
  return path.win32.join(pastaPerfil, NOME_ARQUIVO_PERFIL);
}

export async function lerPerfilOficial(): Promise<PerfilOficialNvidia> {
  const config = await buscarConfiguracaoNvidia();

  if (!config.pastaPerfil) {
    return {
      configurado: false,
      caminho: null,
      hash: null,
      modificadoEm: null,
      configuracoes: [],
      erro: null,
    };
  }

  const caminho = caminhoPerfil(config.pastaPerfil);

  try {
    const [bytes, info] = await Promise.all([readFile(caminho), stat(caminho)]);
    return {
      configurado: true,
      caminho,
      hash: calcularHashNip(bytes),
      modificadoEm: info.mtime.toISOString(),
      configuracoes: lerConfiguracoesNip(decodificarNip(bytes)),
      erro: null,
    };
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException)?.code;
    const erro =
      codigo === "ENOENT"
        ? `Ainda não existe ${NOME_ARQUIVO_PERFIL} em ${config.pastaPerfil}. Envie o perfil oficial pela aba Perfil oficial.`
        : error instanceof Error
          ? `Não foi possível ler ${caminho}: ${error.message}`
          : `Não foi possível ler ${caminho}.`;

    return {
      configurado: true,
      caminho,
      hash: null,
      modificadoEm: null,
      configuracoes: [],
      erro,
    };
  }
}

export async function publicarPerfilOficial(params: {
  bytes: Buffer;
  nomeArquivoOriginal: string;
  publicadoPor: string;
}): Promise<{ perfil: PerfilOficialNvidia; removidas: ConfiguracaoPerfilNip[] }> {
  const config = await buscarConfiguracaoNvidia();

  if (!config.pastaPerfil) {
    throw new ValidationError(
      "Configure a pasta central do perfil na aba Configurações antes de enviar o perfil oficial."
    );
  }

  if (params.bytes.length === 0) throw new ValidationError("O arquivo enviado está vazio.");
  if (params.bytes.length > TAMANHO_MAXIMO_NIP) {
    throw new ValidationError("O arquivo é grande demais para um perfil .nip (máximo de 2 MB).");
  }

  const { conteudo, configuracoes, removidas } = prepararNipParaPublicar(params.bytes);

  /* Grava num temporário e troca — o GPO nunca copia um arquivo pela metade. */
  const destino = caminhoPerfil(config.pastaPerfil);
  const temporario = `${destino}.tmp`;

  try {
    await writeFile(temporario, conteudo);
    await rename(temporario, destino);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "erro desconhecido";
    throw new ValidationError(
      `Não foi possível gravar o perfil em ${config.pastaPerfil}: ${mensagem}`
    );
  }

  const perfis = [...new Set(configuracoes.map((cfg) => cfg.perfil))];
  await registrarEventoSemFalhar({
    maquinaId: null,
    computador: null,
    tipo: "perfil_publicado",
    descricao:
      `${params.publicadoPor} publicou um novo perfil oficial (${params.nomeArquivoOriginal}): ` +
      `${configuracoes.length} configuração(ões) em ${perfis.join(", ")}. ` +
      `Hash ${calcularHashNip(conteudo).slice(0, 12)}…`,
  });

  return { perfil: await lerPerfilOficial(), removidas };
}
