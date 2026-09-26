import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { ConsultaUltimaRevisaoPage } from "@/modules/consulta-ultima-revisao/components/ConsultaUltimaRevisaoPage";

export default async function Page() {
  const usuario = await requireModuloAccess("consulta-ultima-revisao");
  await registrarAcessoModuloSemFalhar(usuario.id, "consulta-ultima-revisao");

  return <ConsultaUltimaRevisaoPage />;
}
