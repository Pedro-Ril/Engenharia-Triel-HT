import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { TransferenciaPageClient } from "@/modules/transferencia-arquivos/components/TransferenciaPageClient";

export default async function TransferenciaArquivosPage() {
  await requireModuloAccess("transferencia-arquivos");

  return <TransferenciaPageClient />;
}
