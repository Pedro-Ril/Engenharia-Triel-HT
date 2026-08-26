import { Suspense } from "react";

import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import TerminalFabrica from "./TerminalFabrica";

export const metadata = {
  title: "Terminal de Fábrica — Portal Grupo Triel-HT",
};

/*
 * Rota pública (ver src/lib/auth/rotas-publicas.ts) — não passa
 * por requireModuloAccess, então precisa registrar o acesso
 * aqui manualmente para contar como os demais módulos em
 * "Acessos por módulo" (Minha Conta) e na home. Só registra
 * quando HÁ sessão (quem estiver logado no navegador do
 * terminal); visitantes anônimos continuam sem contagem aqui —
 * as buscas deles já ficam no contador separado do terminal
 * (portal_terminal_fabrica_buscas).
 */
export default async function Page() {
  const usuario = await getUsuarioAutenticado();

  if (usuario) {
    await registrarAcessoModuloSemFalhar(usuario.id, "terminal-fabrica");
  }

  return (
    <Suspense fallback={null}>
      <TerminalFabrica />
    </Suspense>
  );
}
