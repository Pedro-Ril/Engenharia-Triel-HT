import SemaforoPage from "@/modules/semaforo/components/SemaforoPage";
import { SemaforoPageReformulado } from "@/modules/semaforo/components/SemaforoPageReformulado";
import { buscarConfigSemaforo } from "@/lib/semaforo/config";

export default async function Page() {
  const config = await buscarConfigSemaforo();

  return config.modoLegado ? <SemaforoPage /> : <SemaforoPageReformulado />;
}
