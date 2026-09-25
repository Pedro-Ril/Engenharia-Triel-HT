import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { PainelAprovacoesPage } from "@/modules/aprovacoes/components/PainelAprovacoesPage";

export default async function Page() {
  const usuario = await requireModuloAccess("aprovacoes-painel");
  await registrarAcessoModuloSemFalhar(usuario.id, "aprovacoes-painel");

  return <PainelAprovacoesPage />;
}
