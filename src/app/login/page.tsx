import { redirect } from "next/navigation";

import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
} from "@/lib/auth/autorizacao";
import { proximaRotaSegura } from "@/lib/auth/next-redirect";
import { HomeContent } from "@/modules/home/components/HomeContent";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioAutenticado();

  if (usuario) {
    const { next } = await searchParams;
    redirect(proximaRotaSegura(next));
  }

  const setores = await getSetoresComModulosPermitidos(null);

  return <HomeContent usuario={null} setores={setores} abrirLoginInicial />;
}
