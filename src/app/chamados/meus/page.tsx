import { Home, LifeBuoy, LogIn } from "lucide-react";
import Link from "next/link";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { listarChamadosDoUsuario, listarChamadosEmCopia } from "@/lib/chamados/chamados";
import { MeusChamadosTabs } from "@/modules/chamados/components/MeusChamadosTabs";

export default async function Page() {
  const usuario = await getUsuarioAutenticado();

  if (usuario) {
    await registrarAcessoModuloSemFalhar(usuario.id, "chamados-meus");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Meus chamados"
        description="Todos os chamados que você abriu, autenticado nesta conta."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Chamados", href: "/chamados", icon: <LifeBuoy size={14} /> },
          { label: "Meus chamados", current: true },
        ]}
      />

      {!usuario ? (
        <Card>
          <EmptyState
            icon={<LogIn size={28} />}
            title="Entre para ver seus chamados"
            description='Esta lista mostra os chamados abertos por você enquanto logado. Se abriu um chamado sem login, use "Consultar chamado" com o número recebido.'
            action={
              <Link href="/login?next=/chamados/meus">
                <Button>Entrar</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <ListaChamados usuarioId={usuario.id} />
      )}
    </PageContainer>
  );
}

async function ListaChamados({ usuarioId }: { usuarioId: string }) {
  const [meusChamados, chamadosEmCopia] = await Promise.all([
    listarChamadosDoUsuario(usuarioId),
    listarChamadosEmCopia(usuarioId),
  ]);

  return <MeusChamadosTabs meusChamados={meusChamados} chamadosEmCopia={chamadosEmCopia} />;
}
