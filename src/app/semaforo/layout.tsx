import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function SemaforoLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("semaforo");

  return <>{children}</>;
}
