/* requireModuloAccess já registra o acesso ao módulo -- ver src/lib/auth/autorizacao.ts. */
import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { IntegraTubestPage } from "@/modules/integra-tubest/components/IntegraTubestPage";

export default async function Page() {
  await requireModuloAccess("integra-tubest");

  return <IntegraTubestPage />;
}
