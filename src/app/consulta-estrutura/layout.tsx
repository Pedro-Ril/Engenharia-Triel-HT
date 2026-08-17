import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function ConsultaEstruturaLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("consulta-estrutura");

  return <>{children}</>;
}
