import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { SolicitarAumentoPage } from "@/modules/aprovacoes/components/SolicitarAumentoPage";

export default async function Page() {
  const usuario = await requireModuloAccess("aprovacoes-solicitar-aumento");
  await registrarAcessoModuloSemFalhar(usuario.id, "aprovacoes-solicitar-aumento");

  return <SolicitarAumentoPage />;
}
