import "server-only";

const USUARIO_PADRAO =
  "portal-sem-autenticacao";

const TAMANHO_MAXIMO_USUARIO = 150;

/*
 * Exemplos válidos:
 *
 * joao.silva
 * maria.souza
 * joao.pedro.silva
 *
 * Exemplos inválidos:
 *
 * joao
 * João Silva
 * portal-web
 * joao..silva
 */
const usuarioNominalPattern =
  /^[a-z0-9]+(?:\.[a-z0-9]+)+$/;

function getUsuarioPadrao(): string {
  const usuarioConfigurado =
    process.env.PORTAL_AUDIT_USER
      ?.trim()
      .toLowerCase();

  if (
    usuarioConfigurado &&
    usuarioConfigurado.length <=
      TAMANHO_MAXIMO_USUARIO
  ) {
    return usuarioConfigurado;
  }

  return USUARIO_PADRAO;
}

export function isUsuarioNominalValido(
  value: unknown
): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const usuario =
    value.trim().toLowerCase();

  return (
    usuario.length > 0 &&
    usuario.length <=
      TAMANHO_MAXIMO_USUARIO &&
    usuarioNominalPattern.test(usuario)
  );
}

export function getUsuarioAtual(
  usuarioInformado?: unknown
): string {
  if (
    isUsuarioNominalValido(
      usuarioInformado
    )
  ) {
    return usuarioInformado
      .trim()
      .toLowerCase();
  }

  return getUsuarioPadrao();
}