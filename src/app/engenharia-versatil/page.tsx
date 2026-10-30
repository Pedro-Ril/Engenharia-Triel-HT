import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { EngenhariaVersatilPage } from "@/modules/engenharia-versatil/components/EngenhariaVersatilPage";

/*
 * requireModuloAccess já registra o acesso ao módulo (ver
 * src/lib/auth/autorizacao.ts).
 */
export default async function Page() {
  await requireModuloAccess("engenharia-versatil");

  return <EngenhariaVersatilPage />;
}
