import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { TresDExperiencePage, type AbaTresDExperience } from "@/modules/3dexperience/components/TresDExperiencePage";

const ABAS: AbaTresDExperience[] = ["ultima-revisao", "liberar-desenhos"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; codigo?: string; rodada?: string }>;
}) {
  const usuario = await requireModuloAccess("3dexperience");
  await registrarAcessoModuloSemFalhar(usuario.id, "3dexperience");

  const { aba, codigo, rodada } = await searchParams;
  const abaInicial = ABAS.find((valor) => valor === aba) ?? "ultima-revisao";
  const codigoInicial = (codigo ?? "").trim().slice(0, 50);
  /* &rodada= vem do link do e-mail da liberação agendada: abre a aba de liberação já nela. */
  const rodadaInicial = rodada && UUID.test(rodada) ? rodada : null;

  return (
    <TresDExperiencePage
      abaInicial={rodadaInicial ? "liberar-desenhos" : abaInicial}
      codigoInicial={codigoInicial}
      rodadaInicialId={rodadaInicial}
      liberaComoAdminPlataforma={usuario.ehAdministrador}
    />
  );
}
