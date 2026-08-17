export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends Error {
  /*
   * Motivo interno, usado só para registrar no
   * portal_login_historico. A mensagem exibida ao
   * usuário (`message`) deve continuar genérica para
   * não revelar se o usuário existe ou não no AD.
   */
  motivo: string;

  constructor(message: string, motivo: string) {
    super(message);
    this.name = "AuthenticationError";
    this.motivo = motivo;
  }
}
