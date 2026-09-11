import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { EstoqueListaPage } from "@/modules/estoque-equipamentos-usados/components/EstoqueListaPage";

export default async function Page() {
  await requireModuloAccess("estoque-equipamentos-usados");

  return <EstoqueListaPage />;
}
