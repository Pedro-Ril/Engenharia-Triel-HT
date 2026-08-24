import "server-only";

import { getConfiguracaoAd } from "./configuracao-ad";
import { ValidationError } from "./errors";
import { buscarMembrosDoGrupo, buscarUsuariosNoDiretorioPorSamAccountNames } from "./ldap";
import {
  atualizarDadosUsuarioDoAd,
  listarTodosSamAccountNames,
  upsertUsuarioImportado,
} from "./usuarios";

export interface ResultadoImportacaoAd {
  encontrados: number;
  criados: number;
  atualizados: number;
}

/*
 * Importação manual (botão na tela Usuários) — cria/atualiza
 * o cadastro de todo mundo que está no grupo de usuários do
 * AD configurado em Administração → Configurações, ANTES do
 * primeiro login. Assim um admin já consegue montar as
 * permissões da pessoa com antecedência.
 *
 * A conta de serviço (usada para consultar o AD) nunca é
 * importada, mesmo que apareça no grupo por engano — mesma
 * regra de "nunca aparece na lista de usuários" já aplicada
 * no login e em listarUsuarios.
 */
export async function importarUsuariosDoGrupoAd(): Promise<ResultadoImportacaoAd> {
  const config = await getConfiguracaoAd();

  if (!config) {
    throw new ValidationError(
      "Configure a conexão com o Active Directory antes de importar usuários."
    );
  }

  if (!config.grupoUsuariosDn) {
    throw new ValidationError(
      "Configure o grupo de usuários do AD em Administração → Configurações antes de importar."
    );
  }

  const membros = await buscarMembrosDoGrupo(config, config.grupoUsuariosDn);

  const contaServico = config.usuarioServico.trim().toLowerCase();

  const candidatos = membros.filter(
    (membro) =>
      membro.samAccountName &&
      membro.samAccountName.toLowerCase() !== contaServico
  );

  let criados = 0;
  let atualizados = 0;

  for (const candidato of candidatos) {
    const { criado } = await upsertUsuarioImportado(candidato);

    if (criado) {
      criados += 1;
    } else {
      atualizados += 1;
    }
  }

  return {
    encontrados: candidatos.length,
    criados,
    atualizados,
  };
}

export interface ResultadoAtualizacaoAd {
  verificados: number;
  atualizados: number;
  naoEncontrados: number;
}

/*
 * "Atualizar Usuário AD" (botão na tela Usuários) — diferente de
 * importarUsuariosDoGrupoAd: aqui o ponto de partida é quem JÁ
 * está cadastrado no portal_usuarios (login anterior ou
 * importação), não o grupo configurado. Útil para quando alguém
 * mudou de setor no AD (grupo "GRUPO X") ou virou/deixou de ser
 * admin, e não vai logar de novo tão cedo pra isso se atualizar
 * sozinho. Nunca cria usuário novo — só atualiza quem já existe
 * e ainda for encontrado no AD.
 */
export async function atualizarUsuariosExistentesComAd(): Promise<ResultadoAtualizacaoAd> {
  const config = await getConfiguracaoAd();

  if (!config) {
    throw new ValidationError(
      "Configure a conexão com o Active Directory antes de atualizar usuários."
    );
  }

  const samAccountNames = await listarTodosSamAccountNames();

  if (samAccountNames.length === 0) {
    return { verificados: 0, atualizados: 0, naoEncontrados: 0 };
  }

  const encontrados = await buscarUsuariosNoDiretorioPorSamAccountNames(
    config,
    samAccountNames
  );

  let atualizados = 0;
  let naoEncontrados = 0;

  for (const samAccountName of samAccountNames) {
    const diretorioUsuario = encontrados.get(samAccountName.toLowerCase());

    if (!diretorioUsuario) {
      naoEncontrados += 1;
      continue;
    }

    await atualizarDadosUsuarioDoAd(samAccountName, diretorioUsuario);
    atualizados += 1;
  }

  return {
    verificados: samAccountNames.length,
    atualizados,
    naoEncontrados,
  };
}
