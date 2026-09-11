import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { NovaEntradaPage } from "@/modules/estoque-equipamentos-usados/components/NovaEntradaPage";

export default async function Page() {
  const usuario = await requireModuloAccess("estoque-equipamentos-usados");

  return <NovaEntradaPage codigoEmpresaUsuario={usuario.codigoEmpresa} />;
}
