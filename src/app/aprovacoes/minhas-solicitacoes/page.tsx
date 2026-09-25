import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { MinhasSolicitacoesPage } from "@/modules/aprovacoes/components/MinhasSolicitacoesPage";

export default async function Page() {
  const usuario = await requireModuloAccess("aprovacoes-minhas-solicitacoes");
  await registrarAcessoModuloSemFalhar(usuario.id, "aprovacoes-minhas-solicitacoes");

  return <MinhasSolicitacoesPage />;
}
