import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { listarEmpresasComChamados, listarSetoresParaChamado } from "@/lib/chamados/chamados";
import { requireAtendenteChamados } from "@/lib/chamados/autorizacao-chamados";
import { DashboardChamadosPage } from "@/modules/chamados/components/DashboardChamadosPage";

interface PageProps {
  searchParams: Promise<{
    fullscreen?: string;
    setorId?: string;
    empresa?: string;
    dataInicial?: string;
    dataFinal?: string;
  }>;
}

export default async function Page({ searchParams }: PageProps) {
  const { usuario, setorIds } = await requireAtendenteChamados();
  await registrarAcessoModuloSemFalhar(usuario.id, "chamados-dashboard");

  const [todosSetores, empresas, params] = await Promise.all([
    listarSetoresParaChamado(),
    listarEmpresasComChamados(),
    searchParams,
  ]);

  const setores =
    setorIds === null ? todosSetores : todosSetores.filter((setor) => setorIds.includes(setor.id));

  return (
    <DashboardChamadosPage
      setores={setores}
      empresas={empresas}
      fullscreen={params.fullscreen === "1"}
      filtrosIniciais={{
        setorId: params.setorId ?? "",
        empresa: params.empresa ?? "",
        dataInicial: params.dataInicial ?? "",
        dataFinal: params.dataFinal ?? "",
      }}
    />
  );
}
