import "server-only";

import {
  buscarPreferenciaModulo,
  salvarPreferenciaModulo,
} from "@/lib/preferencias/preferencias-modulo";
import {
  CHAVE_PREFERENCIA_ABERTURA,
  ehModoAberturaArquivos,
  MODO_ABERTURA_PADRAO,
  type ModoAberturaArquivos,
} from "@/modules/cadastro-roteiro/constants/abertura-arquivos";

/*
 * Onde o PDF e o 3D do Roteiro abrem, por usuário. Mesmo store genérico
 * do modo de gestos do Visualizador CAD (ver
 * src/lib/visualizador-cad/preferencias.ts) -- preferência de uma tela
 * só, sem motivo para virar coluna em portal_usuarios.
 */

export async function buscarModoAberturaArquivos(
  usuarioId: string
): Promise<ModoAberturaArquivos> {
  const salvo = await buscarPreferenciaModulo<unknown>(usuarioId, CHAVE_PREFERENCIA_ABERTURA);

  /* Valor estranho (JSON corrompido, opção removida) cai no padrão. */
  return ehModoAberturaArquivos(salvo) ? salvo : MODO_ABERTURA_PADRAO;
}

export async function definirModoAberturaArquivos(
  usuarioId: string,
  modo: ModoAberturaArquivos
): Promise<void> {
  await salvarPreferenciaModulo(usuarioId, CHAVE_PREFERENCIA_ABERTURA, modo);
}
