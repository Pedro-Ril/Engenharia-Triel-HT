import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { listarSetoresParaChamado } from "@/lib/chamados/chamados";
import { AbrirChamadoPage } from "@/modules/chamados/components/AbrirChamadoPage";

export default async function Page() {
  const [usuario, setores] = await Promise.all([
    getUsuarioAutenticado(),
    listarSetoresParaChamado(),
  ]);

  if (usuario) {
    await registrarAcessoModuloSemFalhar(usuario.id, "chamados-abrir");
  }

  return (
    <AbrirChamadoPage
      setores={setores}
      usuarioLogado={
        usuario ? { nomeExibicao: usuario.nomeExibicao, email: usuario.email } : null
      }
    />
  );
}
