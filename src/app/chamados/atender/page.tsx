import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { listarEmpresasComChamados, listarSetoresParaChamado } from "@/lib/chamados/chamados";
import { requireAtendenteChamados } from "@/lib/chamados/autorizacao-chamados";
import { FilaAtendimentoPage } from "@/modules/chamados/components/FilaAtendimentoPage";

export default async function Page() {
  const { usuario } = await requireAtendenteChamados();
  await registrarAcessoModuloSemFalhar(usuario.id, "chamados-atender");

  const [setores, empresas] = await Promise.all([
    listarSetoresParaChamado(),
    listarEmpresasComChamados(),
  ]);

  return <FilaAtendimentoPage setores={setores} empresas={empresas} />;
}
