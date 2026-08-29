import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function DeparaMateriaPrimaLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("depara-materia-prima");

  return <>{children}</>;
}
