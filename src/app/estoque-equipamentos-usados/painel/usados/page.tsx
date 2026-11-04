import { Suspense } from "react";

import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { PainelItensPage } from "@/modules/estoque-equipamentos-usados/components/PainelItensPage";

/*
 * BI de itens dos equipamentos usados (TV): tabela por tipo com as
 * informações técnicas, em rodízio. Pública como /painel (mesmo prefixo
 * em rotas-publicas.ts); registra o acesso só quando há sessão.
 */
export default async function Page() {
  const usuario = await getUsuarioAutenticado();

  if (usuario) {
    await registrarAcessoModuloSemFalhar(usuario.id, "estoque-equipamentos-usados");
  }

  return (
    <Suspense fallback={null}>
      <PainelItensPage condicao="usado" />
    </Suspense>
  );
}
