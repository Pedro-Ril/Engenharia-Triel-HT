import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { TresDExperiencePage, type AbaTresDExperience } from "@/modules/3dexperience/components/TresDExperiencePage";

export const metadata = {
  title: "3DExperience — Portal Grupo Triel-HT",
};

const ABAS: AbaTresDExperience[] = ["ultima-revisao", "liberar-desenhos"];

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string; codigo?: string }> }) {
  const usuario = await requireModuloAccess("3dexperience");
  await registrarAcessoModuloSemFalhar(usuario.id, "3dexperience");

  const { aba, codigo } = await searchParams;
  const abaInicial = ABAS.find((valor) => valor === aba) ?? "ultima-revisao";
  const codigoInicial = (codigo ?? "").trim().slice(0, 50);

  return <TresDExperiencePage abaInicial={abaInicial} codigoInicial={codigoInicial} />;
}
