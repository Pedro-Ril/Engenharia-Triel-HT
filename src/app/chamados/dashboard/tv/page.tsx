import { Suspense } from "react";

import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { PainelTvChamadosPage } from "@/modules/chamados/components/PainelTvChamadosPage";

/*
 * BI de chamados para a TV da sala. Rota PÚBLICA (prefixo /chamados em
 * src/lib/auth/rotas-publicas.ts) de propósito, como o BI de Equipamentos
 * Usados: roda sem ninguém logado (kiosk ou slide "Página web" da TV
 * Corporativa), então NÃO passa por requireAtendenteChamados como o
 * /chamados/dashboard. Registra o acesso só quando há sessão. Com
 * ?fullscreen=1 some o menu do portal (ROTAS_COM_TELA_CHEIA em AppShell).
 */
export default async function Page() {
  const usuario = await getUsuarioAutenticado();

  if (usuario) {
    await registrarAcessoModuloSemFalhar(usuario.id, "chamados-dashboard");
  }

  return (
    <Suspense fallback={null}>
      <PainelTvChamadosPage />
    </Suspense>
  );
}
