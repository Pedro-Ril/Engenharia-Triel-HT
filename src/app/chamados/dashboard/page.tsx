import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { listarCategoriasAtivas } from "@/lib/chamados/categorias";
import {
  filtrarPorSetoresAtendidos,
  listarDepartamentosComChamados,
  listarEmpresasComChamados,
  listarSetoresParaChamado,
  listarUnidadesComChamados,
} from "@/lib/chamados/chamados";
import { requireAtendenteChamados } from "@/lib/chamados/autorizacao-chamados";
import { DashboardChamadosPage } from "@/modules/chamados/components/DashboardChamadosPage";

interface PageProps {
  searchParams: Promise<{
    fullscreen?: string;
    setorId?: string;
    empresa?: string;
    unidadeId?: string;
    departamento?: string;
    categoriaId?: string;
    dataInicial?: string;
    dataFinal?: string;
  }>;
}

export default async function Page({ searchParams }: PageProps) {
  const { usuario, setorIds } = await requireAtendenteChamados();
  await registrarAcessoModuloSemFalhar(usuario.id, "chamados-dashboard");

  /*
   * Admin (setorIds null) vê todos os setores; atendente, só os que atende
   * -- nos números (API) e também nas opções de cada filtro.
   */
  const [todosSetores, todasCategorias, empresas, unidades, departamentos, params] =
    await Promise.all([
      listarSetoresParaChamado(),
      listarCategoriasAtivas(),
      listarEmpresasComChamados(setorIds),
      listarUnidadesComChamados(setorIds),
      listarDepartamentosComChamados(setorIds),
      searchParams,
    ]);

  const setores = filtrarPorSetoresAtendidos(todosSetores, setorIds, (setor) => setor.id);
  const categorias = filtrarPorSetoresAtendidos(todasCategorias, setorIds, (categoria) => categoria.setorId);

  return (
    <DashboardChamadosPage
      setores={setores}
      categorias={categorias}
      empresas={empresas}
      unidades={unidades}
      departamentos={departamentos}
      fullscreen={params.fullscreen === "1"}
      filtrosIniciais={{
        setorId: params.setorId ?? "",
        empresa: params.empresa ?? "",
        unidadeId: params.unidadeId ?? "",
        departamento: params.departamento ?? "",
        categoriaId: params.categoriaId ?? "",
        dataInicial: params.dataInicial ?? "",
        dataFinal: params.dataFinal ?? "",
      }}
    />
  );
}
