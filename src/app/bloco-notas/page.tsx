import { Suspense } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { BlocoNotasPage } from "@/modules/bloco-notas/components/BlocoNotasPage";

/*
 * Bloco de Notas (Utilitários): aberto a qualquer usuário logado
 * (publico_autenticado em portal_modulos). requireModuloAccess exige login,
 * confere o módulo e registra o acesso. O caderno é sempre o do usuário
 * logado -- as rotas /api/bloco-notas/** filtram tudo pelo id dele.
 */
export default async function Page() {
  await requireModuloAccess("bloco-notas");

  return (
    <Suspense fallback={null}>
      <BlocoNotasPage />
    </Suspense>
  );
}
