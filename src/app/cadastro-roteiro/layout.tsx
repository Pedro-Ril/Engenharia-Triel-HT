import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function CadastroRoteiroLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("cadastro-roteiro");

  return <>{children}</>;
}
