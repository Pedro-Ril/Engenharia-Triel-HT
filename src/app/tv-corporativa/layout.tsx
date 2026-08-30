import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function TvCorporativaLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("tv-corporativa");

  return <>{children}</>;
}
