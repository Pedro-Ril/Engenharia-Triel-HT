import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function IntegraLantekVeLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("integra-lantek-ve");

  return <>{children}</>;
}
