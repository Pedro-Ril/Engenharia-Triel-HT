import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function AssinaturasLayout({ children }: { children: ReactNode }) {
  await requireModuloAccess("assinaturas");
  return <>{children}</>;
}
