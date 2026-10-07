import { requireModuloAccess } from "@/lib/auth/autorizacao";
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
  await requireModuloAccess("visualizador-cad");

  return <VisualizadorCadPage />;
}
