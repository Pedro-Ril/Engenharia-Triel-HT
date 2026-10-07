import "server-only";

import {
  buscarPreferenciaModulo,
  salvarPreferenciaModulo,
} from "@/lib/preferencias/preferencias-modulo";
import {
  CHAVE_PREFERENCIA_GESTOS,
  ehModoGestos,
  MODO_GESTOS_PADRAO,
  type ModoGestos,
} from "@/modules/visualizador-cad/constants/gestos";

/*
 * Modo de gestos do visualizador, por usuário.
 *
 * Usa o store genérico de preferência por módulo (nada de coluna nova):
 * é exatamente o caso para o qual ele existe -- uma preferência de uma
 * tela só, que não precisa ser consultada junto com o perfil em todo
 * lugar do portal, como o tema.
 */

export async function buscarModoGestos(usuarioId: string): Promise<ModoGestos> {
  const salvo = await buscarPreferenciaModulo<unknown>(usuarioId, CHAVE_PREFERENCIA_GESTOS);

  /* Valor estranho (preferência antiga, JSON corrompido) cai no padrão. */
  return ehModoGestos(salvo) ? salvo : MODO_GESTOS_PADRAO;
}

export async function definirModoGestos(
  usuarioId: string,
  modo: ModoGestos
): Promise<void> {
  await salvarPreferenciaModulo(usuarioId, CHAVE_PREFERENCIA_GESTOS, modo);
}
