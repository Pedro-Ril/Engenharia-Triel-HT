export interface UsuarioSessao {
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  codigoEmpresa: string | null;
  ehAdministrador: boolean;
}

import type { TipoTrocaSenha } from "@/lib/auth/errors";
import type { PoliticaSenhaAd } from "@/lib/auth/politica-senha";

export type { PoliticaSenhaAd, TipoTrocaSenha };

export interface LoginSucessoData {
  nomeExibicao: string;
  email: string | null;
  ehAdministrador: boolean;
}

/* Senha certa, mas o AD pede para trocá-la antes de entrar. */
export interface TrocaSenhaPendenteData {
  trocarSenha: TipoTrocaSenha;
  politica: PoliticaSenhaAd | null;
}

export interface LoginResponse {
  ok: boolean;
  message?: string;
  data?: LoginSucessoData | TrocaSenhaPendenteData;
}
