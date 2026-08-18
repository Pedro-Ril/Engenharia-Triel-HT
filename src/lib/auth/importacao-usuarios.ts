import "server-only";

import { getConfiguracaoAd } from "./configuracao-ad";
import { ValidationError } from "./errors";
import { buscarMembrosDoGrupo } from "./ldap";
import { upsertUsuarioImportado } from "./usuarios";

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
