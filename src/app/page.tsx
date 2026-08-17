import { getResumoAcessosModulos } from "@/lib/auth/acesso-modulo";
import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
} from "@/lib/auth/autorizacao";
import { HomeContent } from "@/modules/home/components/HomeContent";

export default async function HomePage() {
  const usuario = await getUsuarioAutenticado();
  const setores = await getSetoresComModulosPermitidos(usuario);
  const resumoAcessos = usuario
    ? await getResumoAcessosModulos(usuario.id)
    : [];

  return (
    <HomeContent
      usuario={usuario ? { nomeExibicao: usuario.nomeExibicao } : null}
      setores={setores}
      resumoAcessos={resumoAcessos}
    />
  );
}
