export interface UsuarioSessao {
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  codigoEmpresa: string | null;
  ehAdministrador: boolean;
}

export interface LoginResponse {
  ok: boolean;
  message?: string;
  data?: {
    nomeExibicao: string;
    email: string | null;
    ehAdministrador: boolean;
  };
}
