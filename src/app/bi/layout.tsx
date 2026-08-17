import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function BiLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("bi");

  return <>{children}</>;
}
