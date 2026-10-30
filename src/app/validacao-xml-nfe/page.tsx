import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { ValidacaoXmlNfePage } from "@/modules/validacao-xml-nfe/components/ValidacaoXmlNfePage";

/*
 * requireModuloAccess já registra o acesso ao módulo (ver
 * src/lib/auth/autorizacao.ts), então não se chama
 * registrarAcessoModuloSemFalhar aqui -- seria contado duas vezes.
 */
export default async function Page() {
  await requireModuloAccess("validacao-xml-nfe");

  return <ValidacaoXmlNfePage />;
}
