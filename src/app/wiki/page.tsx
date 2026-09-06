import { redirect } from "next/navigation";

import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
  motivoLoginSuffix,
} from "@/lib/auth/autorizacao";
import { listarArtigosVisiveis } from "@/lib/wiki/wiki";
import { WikiPageClient } from "@/modules/wiki/components/WikiPageClient";

export default async function WikiPage() {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    redirect(`/login?next=/wiki${await motivoLoginSuffix()}`);
  }

  await registrarAcessoModuloSemFalhar(usuario.id, "wiki");

  const [artigos, setoresComModulos] = await Promise.all([
    listarArtigosVisiveis(usuario),
    getSetoresComModulosPermitidos(usuario),
  ]);

  return <WikiPageClient artigos={artigos} setoresComModulos={setoresComModulos} />;
}
