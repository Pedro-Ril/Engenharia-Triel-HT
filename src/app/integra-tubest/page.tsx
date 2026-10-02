/* requireModuloAccess já registra o acesso ao módulo -- ver src/lib/auth/autorizacao.ts. */
import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { buscarPreferenciaModulo } from "@/lib/preferencias/preferencias-modulo";
import { IntegraTubestPage } from "@/modules/integra-tubest/components/IntegraTubestPage";
import {
  CHAVE_PREFERENCIA_COLUNAS,
  normalizarColunas,
} from "@/modules/integra-tubest/constants/colunas";

export default async function Page() {
  const usuario = await requireModuloAccess("integra-tubest");

  /* Lido aqui, no servidor: a tabela já nasce com as colunas da pessoa,
     sem piscar o padrão antes. */
  const salvas = await buscarPreferenciaModulo<string[]>(usuario.id, CHAVE_PREFERENCIA_COLUNAS);

  return <IntegraTubestPage colunasIniciais={normalizarColunas(salvas)} />;
}
