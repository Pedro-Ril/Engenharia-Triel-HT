import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function SubstituicaoEstruturaLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("substituicao-estrutura");

  return <>{children}</>;
}
