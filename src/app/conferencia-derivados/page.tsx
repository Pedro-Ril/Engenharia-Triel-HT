import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { resolverEmpresaDoUsuario } from "@/lib/empresas/empresas";
import { ConferenciaDerivadosPage } from "@/modules/conferencia-derivados/components/ConferenciaDerivadosPage";

/*
 * requireModuloAccess já registra o acesso ao módulo (ver
 * src/lib/auth/autorizacao.ts), então não se chama
 * registrarAcessoModuloSemFalhar aqui -- seria contado duas vezes.
 */
export default async function Page() {
  const usuario = await requireModuloAccess("conferencia-derivados");
  /* Multiempresa: a conferência lê as pastas da empresa do cadastro do usuário. */
  const empresa = await resolverEmpresaDoUsuario(usuario);

  return <ConferenciaDerivadosPage empresaNome={empresa?.nome ?? null} />;
}
