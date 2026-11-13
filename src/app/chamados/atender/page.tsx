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
import { FilaAtendimentoPage } from "@/modules/chamados/components/FilaAtendimentoPage";

export default async function Page() {
  const { usuario, setorIds } = await requireAtendenteChamados();
  await registrarAcessoModuloSemFalhar(usuario.id, "chamados-atender");

  /* Mesmo escopo do dashboard: admin vê todos os setores; atendente, só os dele (também nos filtros). */
  const [todosSetores, todasCategorias, empresas, unidades, departamentos] = await Promise.all([
    listarSetoresParaChamado(),
    listarCategoriasAtivas(),
    listarEmpresasComChamados(setorIds),
    listarUnidadesComChamados(setorIds),
    listarDepartamentosComChamados(setorIds),
  ]);

  const setores = filtrarPorSetoresAtendidos(todosSetores, setorIds, (setor) => setor.id);
  const categorias = filtrarPorSetoresAtendidos(todasCategorias, setorIds, (categoria) => categoria.setorId);

  return (
    <FilaAtendimentoPage
      setores={setores}
      categorias={categorias}
      empresas={empresas}
      unidades={unidades}
      departamentos={departamentos}
    />
  );
}
