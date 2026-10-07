import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { buscarModoGestos } from "@/lib/visualizador-cad/preferencias";
import { VisualizadorCadPage } from "@/modules/visualizador-cad/components/VisualizadorCadPage";

export const metadata = {
  title: "Visualizador CAD — Portal Grupo Triel-HT",
};

/*
 * requireModuloAccess já registra o acesso ao módulo (ver
 * src/lib/auth/autorizacao.ts), então não se chama
 * registrarAcessoModuloSemFalhar aqui -- seria contado duas vezes.
 */
export default async function Page() {
  const usuario = await requireModuloAccess("visualizador-cad");

  /* Resolvido no servidor para a cena já nascer com os gestos certos --
     sem um instante no modo errado enquanto o cliente pergunta. */
  const modoGestos = await buscarModoGestos(usuario.id);

  return <VisualizadorCadPage modoGestos={modoGestos} />;
}
