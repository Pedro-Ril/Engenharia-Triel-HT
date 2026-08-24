import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { listarCategoriasAtivas } from "@/lib/chamados/categorias";
import { listarSetoresParaChamado } from "@/lib/chamados/chamados";
import { AbrirChamadoPage } from "@/modules/chamados/components/AbrirChamadoPage";

export default async function Page() {
  const [usuario, setores, categorias] = await Promise.all([
    getUsuarioAutenticado(),
    listarSetoresParaChamado(),
    listarCategoriasAtivas(),
  ]);

  if (usuario) {
    await registrarAcessoModuloSemFalhar(usuario.id, "chamados-abrir");
  }

  return (
    <AbrirChamadoPage
      setores={setores}
      categorias={categorias}
      usuarioLogado={
        usuario ? { nomeExibicao: usuario.nomeExibicao, email: usuario.email } : null
      }
    />
  );
}
