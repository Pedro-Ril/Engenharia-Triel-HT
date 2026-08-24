import { Home, LifeBuoy, LogIn } from "lucide-react";
import Link from "next/link";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { registrarAcessoModuloSemFalhar } from "@/lib/auth/acesso-modulo";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { listarChamadosDoUsuario } from "@/lib/chamados/chamados";
import { PrioridadeBadge, StatusBadge } from "@/modules/chamados/components/ChamadoBadges";

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

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
  const chamados = await listarChamadosDoUsuario(usuarioId);

  if (chamados.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<LifeBuoy size={28} />}
          title="Nenhum chamado ainda"
          description="Quando você abrir um chamado logado nesta conta, ele aparece aqui."
        />
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Nº</TableHeaderCell>
            <TableHeaderCell>Título</TableHeaderCell>
            <TableHeaderCell>Setor</TableHeaderCell>
            <TableHeaderCell>Categoria</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Prioridade</TableHeaderCell>
            <TableHeaderCell>Atualizado em</TableHeaderCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {chamados.map((chamado) => (
            <TableRow key={chamado.id}>
              <TableCell>
                <Link href={`/chamados/${chamado.numero}`}>#{chamado.numero}</Link>
              </TableCell>
              <TableCell>{chamado.titulo}</TableCell>
              <TableCell>{chamado.setorNome}</TableCell>
              <TableCell>{chamado.categoriaNome ?? "—"}</TableCell>
              <TableCell>
                <StatusBadge status={chamado.status} />
              </TableCell>
              <TableCell>
                <PrioridadeBadge prioridade={chamado.prioridade} />
              </TableCell>
              <TableCell>{formatarData(chamado.atualizadoEm)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
