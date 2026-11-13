import type { PoliticaSenhaAd } from "./politica-senha";

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

export type TipoTrocaSenha = "obrigatoria" | "expirada";

/*
 * Senha digitada CERTA, mas o AD exige trocá-la antes de entrar
 * ("alterar a senha no próximo logon" marcado, ou senha vencida). A
 * tela de login usa `tipo`/`politica` para abrir o passo de nova senha.
 */
export class TrocaSenhaPendenteError extends AuthenticationError {
  tipo: TipoTrocaSenha;
  politica: PoliticaSenhaAd | null;

  constructor(tipo: TipoTrocaSenha, politica: PoliticaSenhaAd | null) {
    super(
      tipo === "expirada"
        ? "Sua senha venceu. Crie uma nova senha para entrar."
        : "Você está usando uma senha provisória. Crie a sua nova senha para entrar.",
      tipo === "expirada" ? "senha_expirada" : "senha_troca_obrigatoria"
    );
    this.name = "TrocaSenhaPendenteError";
    this.tipo = tipo;
    this.politica = politica;
  }
}
