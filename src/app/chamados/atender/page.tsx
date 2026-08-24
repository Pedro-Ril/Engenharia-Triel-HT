import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { listarCategoriasAtivas } from "@/lib/chamados/categorias";
import {
  listarDepartamentosComChamados,
  listarEmpresasComChamados,
  listarSetoresParaChamado,
} from "@/lib/chamados/chamados";
import { requireAtendenteChamados } from "@/lib/chamados/autorizacao-chamados";
import { FilaAtendimentoPage } from "@/modules/chamados/components/FilaAtendimentoPage";

export default async function Page() {
  const { usuario } = await requireAtendenteChamados();
  await registrarAcessoModuloSemFalhar(usuario.id, "chamados-atender");

  const [setores, categorias, empresas, departamentos] = await Promise.all([
    listarSetoresParaChamado(),
    listarCategoriasAtivas(),
    listarEmpresasComChamados(),
    listarDepartamentosComChamados(),
  ]);

  return (
    <FilaAtendimentoPage
      setores={setores}
      categorias={categorias}
      empresas={empresas}
      departamentos={departamentos}
    />
  );
}
