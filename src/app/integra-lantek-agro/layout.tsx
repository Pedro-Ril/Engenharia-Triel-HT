import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function IntegraLantekAgroLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("integra-lantek-agro");

  return <>{children}</>;
}
