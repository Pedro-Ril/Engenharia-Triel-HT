import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function RevisaoProjetoLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("revisao-projeto");

  return <>{children}</>;
}
