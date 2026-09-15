import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { getSetoresQueAtende } from "@/lib/chamados/autorizacao-chamados";
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

  /* Atendente de qualquer setor ou admin -- só essas pessoas podem abrir um chamado em nome de outra. */
  const setoresAtendidos = await getSetoresQueAtende(usuario);
  const podeAbrirEmNomeDe = setoresAtendidos === null || setoresAtendidos.length > 0;

  return (
    <AbrirChamadoPage
      setores={setores}
      categorias={categorias}
      usuarioLogado={
        usuario ? { nomeExibicao: usuario.nomeExibicao, email: usuario.email } : null
      }
      podeAbrirEmNomeDe={podeAbrirEmNomeDe}
    />
  );
}
