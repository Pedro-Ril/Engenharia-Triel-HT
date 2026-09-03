import type { ReactNode } from "react";

import { requireModuloAccess } from "@/lib/auth/autorizacao";

export default async function ConversorTxtRhLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModuloAccess("conversor-txt-rh");

  return <>{children}</>;
}
