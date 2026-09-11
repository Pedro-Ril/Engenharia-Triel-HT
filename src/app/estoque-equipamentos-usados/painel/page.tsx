import { Suspense } from "react";

import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { PainelBiEstoquePage } from "@/modules/estoque-equipamentos-usados/components/PainelBiEstoquePage";

export const metadata = {
  title: "Painel de BI — Estoque de Equipamentos Usados",
};

/*
 * Rota pública (ver src/lib/auth/rotas-publicas.ts) — feita pra rodar
 * numa TV sem ninguém logado (aberta direto em modo kiosk, ou como
 * slide "Página web" da TV Corporativa), então não passa por
 * requireModuloAccess. Registra o acesso manualmente, e só quando HÁ
 * sessão (mesmo padrão de src/app/terminal-fabrica/page.tsx), pra
 * continuar contando em "Acessos por módulo" quem chega aqui logado.
 */
export default async function Page() {
  const usuario = await getUsuarioAutenticado();

  if (usuario) {
    await registrarAcessoModuloSemFalhar(usuario.id, "estoque-equipamentos-usados");
  }

  return (
    <Suspense fallback={null}>
      <PainelBiEstoquePage />
    </Suspense>
  );
}
