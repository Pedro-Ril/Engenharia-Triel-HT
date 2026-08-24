import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { listarCategoriasAtivas } from "@/lib/chamados/categorias";
import {
  listarDepartamentosComChamados,
  listarEmpresasComChamados,
  listarSetoresParaChamado,
} from "@/lib/chamados/chamados";
import { requireAtendenteChamados } from "@/lib/chamados/autorizacao-chamados";
import { DashboardChamadosPage } from "@/modules/chamados/components/DashboardChamadosPage";

interface PageProps {
  searchParams: Promise<{
    fullscreen?: string;
    setorId?: string;
    empresa?: string;
    departamento?: string;
    categoriaId?: string;
    dataInicial?: string;
    dataFinal?: string;
  }>;
}

export default async function Page({ searchParams }: PageProps) {
  const { usuario, setorIds } = await requireAtendenteChamados();
  await registrarAcessoModuloSemFalhar(usuario.id, "chamados-dashboard");

  const [todosSetores, categorias, empresas, departamentos, params] = await Promise.all([
    listarSetoresParaChamado(),
    listarCategoriasAtivas(),
    listarEmpresasComChamados(),
    listarDepartamentosComChamados(),
    searchParams,
  ]);

  const setores =
    setorIds === null ? todosSetores : todosSetores.filter((setor) => setorIds.includes(setor.id));

  return (
    <DashboardChamadosPage
      setores={setores}
      categorias={categorias}
      empresas={empresas}
      departamentos={departamentos}
      fullscreen={params.fullscreen === "1"}
      filtrosIniciais={{
        setorId: params.setorId ?? "",
        empresa: params.empresa ?? "",
        departamento: params.departamento ?? "",
        categoriaId: params.categoriaId ?? "",
        dataInicial: params.dataInicial ?? "",
        dataFinal: params.dataFinal ?? "",
      }}
    />
  );
}
