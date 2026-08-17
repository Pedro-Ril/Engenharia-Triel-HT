import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function LiberacaoProjetoLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("liberacao-projeto");

  return <>{children}</>;
}
