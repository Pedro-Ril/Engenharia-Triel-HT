import "server-only";

import { Client, escapeFilter } from "ldapts";
import type { Entry } from "ldapts";

import { getConfiguracaoAd } from "./configuracao-ad";
import type { ConfiguracaoAd } from "./configuracao-ad";
import { AuthenticationError } from "./errors";

export interface ActiveDirectoryUser {
  distinguishedName: string;
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  memberOf: string[];
  ehAdministrador: boolean;
}

function toSingleString(value: Entry[string] | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    const first = value[0];
    return first === undefined ? null : first.toString();
  }

  return value.toString();
}

function toStringArray(value: Entry[string] | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => item.toString());
  }

  return [value.toString()];
}

/*
 * Localiza o usuário no diretório usando a conta de serviço
 * (portal_sync), autenticando com sAMAccountName — assim o
 * usuário do portal digita só o nome de usuário, sem prefixo
 * de domínio.
 */
async function buscarUsuarioNoDiretorio(
  config: ConfiguracaoAd,
  samAccountName: string
): Promise<Omit<ActiveDirectoryUser, "ehAdministrador"> | null> {
  const client = new Client({ url: config.url });

  try {
    await client.bind(config.usuarioServico, config.senhaServico);

    const { searchEntries } = await client.search(config.baseDn, {
      scope: "sub",
      filter: escapeFilter`(&(objectClass=user)(objectCategory=person)(sAMAccountName=${samAccountName}))`,
      attributes: [
        "distinguishedName",
        "sAMAccountName",
        "displayName",
        "mail",
        "memberOf",
      ],
    });

    const entry = searchEntries[0];

    if (!entry) {
      return null;
    }

    return {
      distinguishedName: toSingleString(entry.distinguishedName) ?? entry.dn,
      samAccountName: toSingleString(entry.sAMAccountName) ?? samAccountName,
      nomeExibicao: toSingleString(entry.displayName) ?? samAccountName,
      email: toSingleString(entry.mail),
      memberOf: toStringArray(entry.memberOf),
    };
  } finally {
    await client.unbind();
  }
}

/*
 * Valida a senha digitada abrindo uma segunda conexão e
 * tentando o bind como o próprio usuário (nunca reaproveita
 * a conexão da conta de serviço para isso).
 */
async function validarSenhaNoDiretorio(
  config: ConfiguracaoAd,
  distinguishedName: string,
  senha: string
): Promise<boolean> {
  const client = new Client({ url: config.url });

  try {
    await client.bind(distinguishedName, senha);
    return true;
  } catch {
    return false;
  } finally {
    await client.unbind();
  }
}

export async function authenticateWithActiveDirectory(
  usuarioDigitado: string,
  senha: string
): Promise<ActiveDirectoryUser> {
  const samAccountName = usuarioDigitado.trim();

  if (!samAccountName || !senha) {
    throw new AuthenticationError(
      "Usuário ou senha inválidos.",
      "credenciais_invalidas"
    );
  }

  const config = await getConfiguracaoAd();

  if (!config) {
    throw new AuthenticationError(
      "O login corporativo ainda não foi configurado. Fale com o administrador.",
      "ad_nao_configurado"
    );
  }

  let diretorioUsuario: Omit<ActiveDirectoryUser, "ehAdministrador"> | null;

  try {
    diretorioUsuario = await buscarUsuarioNoDiretorio(config, samAccountName);
  } catch (error) {
    console.error("Erro ao consultar o Active Directory:", error);

    throw new AuthenticationError(
      "Não foi possível conectar ao Active Directory. Tente novamente em instantes.",
      "erro_conexao_ad"
    );
  }

  if (!diretorioUsuario) {
    throw new AuthenticationError(
      "Usuário ou senha inválidos.",
      "usuario_nao_encontrado"
    );
  }

  const senhaValida = await validarSenhaNoDiretorio(
    config,
    diretorioUsuario.distinguishedName,
    senha
  );

  if (!senhaValida) {
    throw new AuthenticationError(
      "Usuário ou senha inválidos.",
      "senha_invalida"
    );
  }

  return {
    ...diretorioUsuario,
    ehAdministrador: ehMembroDoGrupoAdmin(
      diretorioUsuario.memberOf,
      config.grupoAdminDn
    ),
  };
}

/*
 * Busca todos os usuários que são membro do grupo informado
 * (ex: grupo de usuários liberados para importação). Usa
 * memberOf no filtro em vez de ler o atributo member do
 * grupo — evita lidar com paginação/range retrieval do AD
 * para grupos grandes.
 */
export async function buscarMembrosDoGrupo(
  config: ConfiguracaoAd,
  grupoDn: string
): Promise<ActiveDirectoryUser[]> {
  const client = new Client({ url: config.url });

  try {
    await client.bind(config.usuarioServico, config.senhaServico);

    const { searchEntries } = await client.search(config.baseDn, {
      scope: "sub",
      filter: escapeFilter`(&(objectClass=user)(objectCategory=person)(memberOf=${grupoDn}))`,
      attributes: [
        "distinguishedName",
        "sAMAccountName",
        "displayName",
        "mail",
        "memberOf",
      ],
    });

    return searchEntries.map((entry) => {
      const memberOf = toStringArray(entry.memberOf);

      return {
        distinguishedName: toSingleString(entry.distinguishedName) ?? entry.dn,
        samAccountName: toSingleString(entry.sAMAccountName) ?? "",
        nomeExibicao:
          toSingleString(entry.displayName) ??
          toSingleString(entry.sAMAccountName) ??
          "",
        email: toSingleString(entry.mail),
        memberOf,
        ehAdministrador: ehMembroDoGrupoAdmin(memberOf, config.grupoAdminDn),
      };
    });
  } finally {
    await client.unbind();
  }
}

export function ehMembroDoGrupoAdmin(
  memberOf: string[],
  grupoAdminDn: string
): boolean {
  const grupoAdminDNNormalizado = grupoAdminDn.trim().toLowerCase();

  if (!grupoAdminDNNormalizado) {
    return false;
  }

  return memberOf.some(
    (dn) => dn.trim().toLowerCase() === grupoAdminDNNormalizado
  );
}
