import { listarAtualizacoes } from "@/lib/atualizacoes/atualizacoes";
import AtualizacoesModulePage from "@/modules/atualizacoes/AtualizacoesPage";

export default async function Page() {
  const atualizacoes = await listarAtualizacoes({ apenasPublicadas: true });

  return <AtualizacoesModulePage atualizacoes={atualizacoes} />;
}
