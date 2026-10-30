import { Suspense } from "react";

import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { PainelGerencialPage } from "@/modules/estoque-equipamentos-usados/components/PainelGerencialPage";

/*
 * Painel gerencial de Equipamentos Usados: duas páginas que se revezam na
 * TV ("onde está o estoque" e "quanto vale e há quanto tempo"). Pública
 * como /painel (mesmo prefixo em rotas-publicas.ts), registra o acesso só
 * quando há sessão.
 */
export default async function Page() {
  const usuario = await getUsuarioAutenticado();

  if (usuario) {
    await registrarAcessoModuloSemFalhar(usuario.id, "estoque-equipamentos-usados");
  }

  return (
    <Suspense fallback={null}>
      <PainelGerencialPage />
    </Suspense>
  );
}
