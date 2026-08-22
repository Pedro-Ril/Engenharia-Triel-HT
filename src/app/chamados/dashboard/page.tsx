import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { listarEmpresasComChamados, listarSetoresParaChamado } from "@/lib/chamados/chamados";
import { requireAtendenteChamados } from "@/lib/chamados/autorizacao-chamados";
import { DashboardChamadosPage } from "@/modules/chamados/components/DashboardChamadosPage";

export default async function Page() {
  const { usuario, setorIds } = await requireAtendenteChamados();
  await registrarAcessoModuloSemFalhar(usuario.id, "chamados-dashboard");

  const [todosSetores, empresas] = await Promise.all([
    listarSetoresParaChamado(),
    listarEmpresasComChamados(),
  ]);

  const setores =
    setorIds === null ? todosSetores : todosSetores.filter((setor) => setorIds.includes(setor.id));

  return <DashboardChamadosPage setores={setores} empresas={empresas} />;
}
