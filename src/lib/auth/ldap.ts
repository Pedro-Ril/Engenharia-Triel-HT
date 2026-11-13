import "server-only";

import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import type { ConnectionOptions } from "node:tls";

import {
  Attribute,
  Change,
  Client,
  ConstraintViolationError,
  InvalidCredentialsError,
  escapeFilter,
} from "ldapts";
import type { Entry } from "ldapts";

import { CERTIFICADO_CA_AD } from "./ad-ca";
import { getConfiguracaoAd } from "./configuracao-ad";
import type { ConfiguracaoAd } from "./configuracao-ad";
import { AuthenticationError, TrocaSenhaPendenteError, ValidationError } from "./errors";
import { descreverPoliticaSenha } from "./politica-senha";
import type { PoliticaSenhaAd } from "./politica-senha";

export interface ActiveDirectoryUser {
  distinguishedName: string;
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  memberOf: string[];
  ehAdministrador: boolean;
  departamento: string | null;
  /* Conta habilitada no AD -- bit ACCOUNTDISABLE (0x2) de userAccountControl. Ver upsertUsuarioImportado/atualizarDadosUsuarioDoAd em usuarios.ts. */
  contaAtiva: boolean;
}

/*
 * userAccountControl é uma máscara de bits -- ACCOUNTDISABLE (0x2)
 * marca a conta como desabilitada no AD (independente de senha
 * expirada, bloqueio temporário etc., que são bits diferentes e não
 * nos interessam aqui). Atributo ausente (não deveria acontecer para
 * um objeto "user" de verdade) é tratado como conta ativa, por
 * segurança -- não queremos desativar alguém por causa de um atributo
 * que não veio na resposta.
 */
const AD_ACCOUNTDISABLE = 0x2;

function contaEstaAtiva(userAccountControl: Entry[string] | undefined): boolean {
  const bruto = toSingleString(userAccountControl);
  if (bruto === null) return true;

  const valor = Number(bruto);
  if (Number.isNaN(valor)) return true;

  return (valor & AD_ACCOUNTDISABLE) === 0;
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
        "userAccountControl",
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
      contaAtiva: contaEstaAtiva(entry.userAccountControl),
      departamento: extrairDepartamentoDoMemberOf(memberOf),
    };
  } finally {
    await client.unbind();
  }
}

/*
 * "troca_obrigatoria" = "o usuário deve alterar a senha no próximo
 * logon" marcado no AD; "expirada" = passou da validade da política
 * (hoje 180 dias). Nos dois casos o AD recusa o bind com o código 49,
 * mas o sub-código ("data 773"/"data 532" na mensagem) só vem quando a
 * senha digitada está CERTA -- senha errada é sempre "data 52e". Por
 * isso diferenciar aqui não revela nada a quem não sabe a senha.
 */
type ResultadoValidacaoSenha = "ok" | "invalida" | "troca_obrigatoria" | "expirada";

const SUBCODIGO_AD_TROCA_OBRIGATORIA = "773";
const SUBCODIGO_AD_SENHA_EXPIRADA = "532";

function subcodigoErroBindAd(error: unknown): string | null {
  if (!(error instanceof InvalidCredentialsError)) return null;

  return /\bdata ([0-9a-f]+)/i.exec(error.message)?.[1]?.toLowerCase() ?? null;
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
): Promise<ResultadoValidacaoSenha> {
  const client = new Client({ url: config.url });

  try {
    await client.bind(distinguishedName, senha);
    return "ok";
  } catch (error) {
    const subcodigo = subcodigoErroBindAd(error);

    if (subcodigo === SUBCODIGO_AD_TROCA_OBRIGATORIA) return "troca_obrigatoria";
    if (subcodigo === SUBCODIGO_AD_SENHA_EXPIRADA) return "expirada";

    return "invalida";
  } finally {
    await client.unbind();
  }
}

/*
 * O AD só aceita mexer em senha (unicodePwd) por conexão criptografada.
 * A configuração salva usa ldap://IP:389 para todo o resto; para a troca
 * de senha abre-se a mesma máquina em LDAPS (636).
 */
function urlSeguraDoAd(url: string): string {
  const atual = new URL(url);

  if (atual.protocol === "ldaps:") return url;

  return `ldaps://${atual.hostname}:636`;
}

/*
 * `ca` SUBSTITUI as raízes públicas do Node: só um certificado emitido
 * pela CA interna é aceito. A configuração aponta o DC pelo IP, e o
 * certificado do DC só traz o nome DNS (SRV-DC01.trielht.ad) -- pelo IP
 * vale a cadeia (que só a nossa CA consegue satisfazer); por nome,
 * confere o nome também.
 */
function opcoesTlsAd(): ConnectionOptions {
  return {
    ca: [CERTIFICADO_CA_AD],
    checkServerIdentity: (host, certificado) =>
      isIP(host) ? undefined : checkServerIdentity(host, certificado),
  };
}

/* unicodePwd é a senha entre aspas duplas, em UTF-16LE. */
function valorUnicodePwd(senha: string): Buffer {
  return Buffer.from(`"${senha}"`, "utf16le");
}

/* Atributos de intervalo do AD vêm em unidades de 100ns, negativos. */
function intervaloAdEmDias(valor: string | null): number {
  if (!valor) return 0;

  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero >= 0) return 0;

  return Math.round(-numero / 864_000_000_000);
}

/*
 * Política de senha padrão do domínio (lida do objeto raiz). Se a TI
 * criar uma política refinada (PSO) para algum grupo, ela vale para
 * aquele grupo e não aparece aqui -- a mensagem do AD continua sendo a
 * palavra final, isto é só a dica mostrada antes de digitar.
 */
async function lerPoliticaSenha(
  client: Client,
  config: ConfiguracaoAd
): Promise<PoliticaSenhaAd | null> {
  try {
    const { searchEntries } = await client.search(config.baseDn, {
      scope: "base",
      attributes: ["minPwdLength", "pwdProperties", "pwdHistoryLength", "maxPwdAge"],
    });

    const entry = searchEntries[0];
    if (!entry) return null;

    const DOMAIN_PASSWORD_COMPLEX = 0x1;

    return {
      tamanhoMinimo: Number(toSingleString(entry.minPwdLength) ?? 0),
      exigeComplexidade:
        (Number(toSingleString(entry.pwdProperties) ?? 0) & DOMAIN_PASSWORD_COMPLEX) !== 0,
      historico: Number(toSingleString(entry.pwdHistoryLength) ?? 0),
      validadeDias: intervaloAdEmDias(toSingleString(entry.maxPwdAge)),
    };
  } catch (error) {
    console.error("Erro ao ler a política de senha do AD:", error);
    return null;
  }
}

async function lerPoliticaSenhaComContaServico(
  config: ConfiguracaoAd
): Promise<PoliticaSenhaAd | null> {
  const client = new Client({ url: config.url });

  try {
    await client.bind(config.usuarioServico, config.senhaServico);
    return await lerPoliticaSenha(client, config);
  } catch (error) {
    console.error("Erro ao ler a política de senha do AD:", error);
    return null;
  } finally {
    await client.unbind();
  }
}

/*
 * Passos comuns ao login e à troca de senha: entrada preenchida, AD
 * configurado, usuário existe no diretório e a senha digitada confere
 * (inclusive no caso "certa, mas precisa trocar").
 */
async function localizarEValidarSenha(
  usuarioDigitado: string,
  senha: string
): Promise<{
  config: ConfiguracaoAd;
  diretorioUsuario: Omit<ActiveDirectoryUser, "ehAdministrador">;
  resultado: Exclude<ResultadoValidacaoSenha, "invalida">;
}> {
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

  const resultado = await validarSenhaNoDiretorio(
    config,
    diretorioUsuario.distinguishedName,
    senha
  );

  if (resultado === "invalida") {
    throw new AuthenticationError(
      "Usuário ou senha inválidos.",
      "senha_invalida"
    );
  }

  return { config, diretorioUsuario, resultado };
}

function comPerfilAdmin(
  diretorioUsuario: Omit<ActiveDirectoryUser, "ehAdministrador">,
  config: ConfiguracaoAd
): ActiveDirectoryUser {
  return {
    ...diretorioUsuario,
    ehAdministrador: ehMembroDoGrupoAdmin(
      diretorioUsuario.memberOf,
      config.grupoAdminDn
    ),
  };
}

export async function authenticateWithActiveDirectory(
  usuarioDigitado: string,
  senha: string
): Promise<ActiveDirectoryUser> {
  const { config, diretorioUsuario, resultado } = await localizarEValidarSenha(
    usuarioDigitado,
    senha
  );

  if (resultado !== "ok") {
    throw new TrocaSenhaPendenteError(
      resultado === "expirada" ? "expirada" : "obrigatoria",
      await lerPoliticaSenhaComContaServico(config)
    );
  }

  return comPerfilAdmin(diretorioUsuario, config);
}

/*
 * Troca de senha pendente (provisória ou vencida), feita na tela de
 * login. Só serve para esse caso: se a senha atual ainda está valendo,
 * recusa -- o endpoint não vira um "trocar senha" genérico sem sessão.
 *
 * O usuário não consegue fazer bind (é justamente o que o AD bloqueia),
 * então a troca vai pela conta de serviço, com a operação de TROCA
 * (apaga o valor antigo + grava o novo na mesma modificação), não de
 * redefinição: o próprio AD confere a senha antiga e aplica histórico e
 * política normalmente -- o direito "Alterar senha" é de Todos por
 * padrão, a conta de serviço não precisa de permissão especial.
 */
export async function trocarSenhaPendenteNoAd(
  usuarioDigitado: string,
  senhaAtual: string,
  novaSenha: string
): Promise<ActiveDirectoryUser> {
  const { config, diretorioUsuario, resultado } = await localizarEValidarSenha(
    usuarioDigitado,
    senhaAtual
  );

  if (resultado === "ok") {
    throw new ValidationError(
      "Sua senha atual ainda está valendo, não é preciso trocá-la agora. Entre normalmente."
    );
  }

  const client = new Client({
    url: urlSeguraDoAd(config.url),
    connectTimeout: 10_000,
    tlsOptions: opcoesTlsAd(),
  });

  try {
    await client.bind(config.usuarioServico, config.senhaServico);

    try {
      await client.modify(diretorioUsuario.distinguishedName, [
        new Change({
          operation: "delete",
          modification: new Attribute({
            type: "unicodePwd",
            values: [valorUnicodePwd(senhaAtual)],
          }),
        }),
        new Change({
          operation: "add",
          modification: new Attribute({
            type: "unicodePwd",
            values: [valorUnicodePwd(novaSenha)],
          }),
        }),
      ]);
    } catch (error) {
      /*
       * 19 (constraintViolation) com 0000052D = a nova senha não passou
       * na política (tamanho, complexidade, histórico). Qualquer outra
       * recusa é problema de infraestrutura/permissão, não do usuário.
       */
      if (error instanceof ConstraintViolationError && /0000052D/i.test(error.message)) {
        throw new ValidationError(
          `A rede não aceitou essa nova senha. ${descreverPoliticaSenha(
            await lerPoliticaSenha(client, config)
          )}`.trim()
        );
      }

      throw error;
    }
  } finally {
    await client.unbind();
  }

  return comPerfilAdmin(diretorioUsuario, config);
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
        "userAccountControl",
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
        contaAtiva: contaEstaAtiva(entry.userAccountControl),
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
        "userAccountControl",
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
        contaAtiva: contaEstaAtiva(entry.userAccountControl),
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
