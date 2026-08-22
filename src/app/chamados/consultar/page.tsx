import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { ConsultarChamadoForm } from "@/modules/chamados/components/ConsultarChamadoForm";

export default async function Page() {
  const usuario = await getUsuarioAutenticado();

  if (usuario) {
    await registrarAcessoModuloSemFalhar(usuario.id, "chamados-consultar");
  }

  return <ConsultarChamadoForm />;
}
