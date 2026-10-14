import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { ConferenciaDerivadosPage } from "@/modules/conferencia-derivados/components/ConferenciaDerivadosPage";

export const metadata = {
  title: "Conferência de Arquivos Derivados — Portal Grupo Triel-HT",
};

/*
 * requireModuloAccess já registra o acesso ao módulo (ver
 * src/lib/auth/autorizacao.ts), então não se chama
 * registrarAcessoModuloSemFalhar aqui -- seria contado duas vezes.
 */
export default async function Page() {
  await requireModuloAccess("conferencia-derivados");

  return <ConferenciaDerivadosPage />;
}
