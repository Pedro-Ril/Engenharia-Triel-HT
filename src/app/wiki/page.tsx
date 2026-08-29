import { redirect } from "next/navigation";

import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado, motivoLoginSuffix } from "@/lib/auth/autorizacao";
import { listarArtigosVisiveis } from "@/lib/wiki/wiki";
import { WikiPageClient } from "@/modules/wiki/components/WikiPageClient";

export default async function WikiPage() {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    redirect(`/login?next=/wiki${await motivoLoginSuffix()}`);
  }

  await registrarAcessoModuloSemFalhar(usuario.id, "wiki");

  const artigos = await listarArtigosVisiveis(usuario);

  return <WikiPageClient artigos={artigos} />;
}
