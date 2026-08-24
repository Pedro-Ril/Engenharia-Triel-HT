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
  departamento: string | null;
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

    const memberOf = toStringArray(entry.memberOf);

    return {
      distinguishedName: toSingleString(entry.distinguishedName) ?? entry.dn,
      samAccountName: toSingleString(entry.sAMAccountName) ?? samAccountName,
      nomeExibicao: toSingleString(entry.displayName) ?? samAccountName,
      email: toSingleString(entry.mail),
      memberOf,
      departamento: extrairDepartamentoDoMemberOf(memberOf),
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
        departamento: extrairDepartamentoDoMemberOf(memberOf),
      };
    });
  } finally {
    await client.unbind();
  }
}

/*
 * Busca vários usuários de uma vez pelo sAMAccountName, numa
 * única conexão/consulta (filtro OR com todos os nomes) — usado
 * para "Atualizar Usuário AD" (ver src/lib/auth/importacao-usuarios.ts),
 * que precisa checar todo mundo que já está cadastrado no
 * portal, não só quem está no grupo configurado para importação
 * (essa é a diferença para buscarMembrosDoGrupo). Devolve um Map
 * por sAMAccountName em minúsculo — quem não for encontrado no
 * AD simplesmente não aparece no Map.
 */
export async function buscarUsuariosNoDiretorioPorSamAccountNames(
  config: ConfiguracaoAd,
  samAccountNames: string[]
): Promise<Map<string, ActiveDirectoryUser>> {
  const resultado = new Map<string, ActiveDirectoryUser>();

  if (samAccountNames.length === 0) {
    return resultado;
  }

  const client = new Client({ url: config.url });

  try {
    await client.bind(config.usuarioServico, config.senhaServico);

    const filtroNomes = samAccountNames
      .map((nome) => escapeFilter`(sAMAccountName=${nome})`)
      .join("");

    const { searchEntries } = await client.search(config.baseDn, {
      scope: "sub",
      filter: `(&(objectClass=user)(objectCategory=person)(|${filtroNomes}))`,
      attributes: [
        "distinguishedName",
        "sAMAccountName",
        "displayName",
        "mail",
        "memberOf",
      ],
    });

    for (const entry of searchEntries) {
      const samAccountName = toSingleString(entry.sAMAccountName);
      if (!samAccountName) continue;

      const memberOf = toStringArray(entry.memberOf);

      resultado.set(samAccountName.toLowerCase(), {
        distinguishedName: toSingleString(entry.distinguishedName) ?? entry.dn,
        samAccountName,
        nomeExibicao: toSingleString(entry.displayName) ?? samAccountName,
        email: toSingleString(entry.mail),
        memberOf,
        ehAdministrador: ehMembroDoGrupoAdmin(memberOf, config.grupoAdminDn),
        departamento: extrairDepartamentoDoMemberOf(memberOf),
      });
    }

    return resultado;
  } finally {
    await client.unbind();
  }
}

/*
 * Confere, antes de salvar a configuração do AD, que dá pra
 * conectar com essas credenciais e que o(s) grupo(s) informados
 * realmente existem no diretório. Um DN de grupo administrador
 * digitado errado nunca deveria ser aceito — do contrário, no
 * próximo login, TODOS os administradores perdem o acesso de
 * uma vez, e a própria tela que corrigiria isso passa a exigir
 * ser administrador.
 */
export interface ResultadoTesteConexaoAd {
  conectou: boolean;
  grupoAdminExiste: boolean;
  grupoUsuariosExiste: boolean | null;
  mensagemErro: string | null;
}

async function grupoExisteNoDiretorio(client: Client, grupoDn: string): Promise<boolean> {
  try {
    const { searchEntries } = await client.search(grupoDn, {
      scope: "base",
      filter: "(objectClass=group)",
    });

    return searchEntries.length > 0;
  } catch {
    return false;
  }
}

export async function testarConexaoAd(config: {
  url: string;
  usuarioServico: string;
  senhaServico: string;
  grupoAdminDn: string;
  grupoUsuariosDn: string | null;
}): Promise<ResultadoTesteConexaoAd> {
  const client = new Client({ url: config.url });

  try {
    await client.bind(config.usuarioServico, config.senhaServico);
  } catch {
    return {
      conectou: false,
      grupoAdminExiste: false,
      grupoUsuariosExiste: null,
      mensagemErro:
        "Não foi possível conectar ao Active Directory com essa URL, usuário e senha de serviço.",
    };
  }

  try {
    const grupoAdminExiste = await grupoExisteNoDiretorio(client, config.grupoAdminDn);

    if (!grupoAdminExiste) {
      return {
        conectou: true,
        grupoAdminExiste: false,
        grupoUsuariosExiste: null,
        mensagemErro:
          "O grupo de administradores informado não foi encontrado no Active Directory. Confira o DN e tente novamente.",
      };
    }

    const grupoUsuariosExiste = config.grupoUsuariosDn
      ? await grupoExisteNoDiretorio(client, config.grupoUsuariosDn)
      : null;

    if (config.grupoUsuariosDn && !grupoUsuariosExiste) {
      return {
        conectou: true,
        grupoAdminExiste: true,
        grupoUsuariosExiste: false,
        mensagemErro:
          "O grupo de usuários informado não foi encontrado no Active Directory. Confira o DN e tente novamente.",
      };
    }

    return { conectou: true, grupoAdminExiste: true, grupoUsuariosExiste, mensagemErro: null };
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

/*
 * Extrai o valor do primeiro RDN (CN=...) de um DN de grupo,
 * ex: "CN=GRUPO FINANCEIRO,OU=Grupos,DC=empresa,DC=local" →
 * "GRUPO FINANCEIRO". Considera sequências escapadas (\,) para
 * não cortar no meio de um nome com vírgula — improvável aqui,
 * mas é o jeito correto de fatiar um DN sem depender de uma lib
 * de parsing só para isso.
 */
function extrairCnDaDn(dn: string): string | null {
  const match = /^CN=((?:[^,\\]|\\.)*)/i.exec(dn.trim());
  if (!match) return null;

  return match[1].replace(/\\(.)/g, "$1").trim();
}

const PADRAO_GRUPO_DEPARTAMENTO = /^GRUPO\s+(.+)$/i;

/*
 * O setor/departamento do usuário vem do grupo do AD nomeado
 * "GRUPO <DEPARTAMENTO>" (ex: "GRUPO FINANCEIRO",
 * "GRUPO CONTROLADORIA") — usado para saber de qual setor é
 * quem abre um chamado, para relatórios (não confundir com o
 * setor de ROTEAMENTO do chamado, que é escolhido no formulário
 * e independente disso). Se a pessoa pertencer a mais de um
 * grupo "GRUPO X", usa o primeiro encontrado em `memberOf` — na
 * prática cada pessoa pertence a um único grupo de setor.
 */
export function extrairDepartamentoDoMemberOf(memberOf: string[]): string | null {
  for (const dn of memberOf) {
    const cn = extrairCnDaDn(dn);
    if (!cn) continue;

    const match = PADRAO_GRUPO_DEPARTAMENTO.exec(cn);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}
