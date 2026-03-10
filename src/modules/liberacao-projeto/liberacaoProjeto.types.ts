export type NomeItem = {
  name: string;
};

export type ClienteItem = {
  cod_cli: string;
  descricao: string;
};

export type EmailPayload = {
  nome: string;
  cliente: string;
  ordem: string;
  numOf: string;
  codFocco: string;
  idMasc: string;
  numPed: string;
  codCjGeral: string;
};

export type ApiErrorResponse = {
  error?: string;
};