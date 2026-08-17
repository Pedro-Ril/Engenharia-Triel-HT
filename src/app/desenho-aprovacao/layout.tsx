import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function DesenhoAprovacaoLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("desenho-aprovacao");

  return <>{children}</>;
}
