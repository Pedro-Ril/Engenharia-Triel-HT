"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Home,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { FormGrid } from "@/components/ui/FormGrid";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { resolverIcone } from "@/lib/icons/icon-registry";

import { buscarMinhaConta } from "../services/minhaConta.service";
import type { MinhaContaData } from "../types/minhaConta.types";

const motivosFalha: Record<string, string> = {
  credenciais_invalidas: "Usuário ou senha em branco",
  usuario_nao_encontrado: "Usuário ou senha inválidos",
  senha_invalida: "Usuário ou senha inválidos",
  usuario_inativo: "Acesso desativado pelo administrador",
  erro_conexao_ad: "Erro de conexão com o Active Directory",
  limite_tentativas_excedido: "Muitas tentativas seguidas",
  conta_servico_bloqueada: "Usuário ou senha inválidos",
};

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";

  return new Date(valorIso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function MinhaContaPage() {
  const [dados, setDados] = useState<MinhaContaData | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    buscarMinhaConta().then((resultado) => {
      setDados(resultado);
      setCarregando(false);
    });
  }, []);

  if (carregando) {
    return (
      <PageContainer>
        <Loader label="Carregando sua conta..." />
      </PageContainer>
    );
  }

  if (!dados) {
    return (
      <PageContainer>
        <p>Não foi possível carregar os dados da sua conta.</p>
      </PageContainer>
    );
  }

  const { perfil, historico, acessosModulos } = dados;
  const totalSucessos = historico.filter((item) => item.sucesso).length;

  return (
    <PageContainer>
      <PageHeader
        title="Minha conta"
        description="Seus dados de perfil e o histórico de acessos ao portal."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home /> },
          { label: "Minha conta" },
        ]}
      />

      <FormGrid columns={4}>
        <StatCard
          label="Usuário"
          value={perfil.nomeExibicao}
          description={perfil.samAccountName}
          icon={<User />}
        />

        <StatCard
          label="Código de empresa"
          value={perfil.codigoEmpresa ?? "Não definido"}
          description="Definido por um administrador."
          icon={<Building2 />}
        />

        <StatCard
          label="Perfil"
          value={perfil.ehAdministrador ? "Administrador" : "Usuário"}
          icon={<ShieldCheck />}
          variant={perfil.ehAdministrador ? "info" : "neutral"}
        />

        <StatCard
          label="Último login"
          value={formatarData(perfil.ultimoLoginEm)}
          description={`${totalSucessos} login(s) registrado(s)`}
          icon={<Clock3 />}
        />
      </FormGrid>

      <Card
        title="Acessos por módulo"
        description="Quantas vezes você abriu cada ferramenta liberada para o seu usuário."
      >
        {acessosModulos.length === 0 ? (
          <p>Nenhuma ferramenta liberada para o seu usuário ainda.</p>
        ) : (
          <Table minWidth={560}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Módulo</TableHeaderCell>
                <TableHeaderCell align="center">Acessos</TableHeaderCell>
                <TableHeaderCell>Último acesso</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {acessosModulos.map((item) => {
                const ModuloIcon = resolverIcone(item.moduloIcone);

                return (
                  <TableRow key={item.moduloId}>
                    <TableCell>
                      <Stack direction="row" gap={8} align="center">
                        <ModuloIcon size={16} />
                        {item.moduloNome}
                      </Stack>
                    </TableCell>

                    <TableCell align="center">{item.totalAcessos}</TableCell>

                    <TableCell>{formatarData(item.ultimoAcesso)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card
        title="Histórico de acessos"
        description="Últimas 50 tentativas de login com o seu usuário."
      >
        {historico.length === 0 ? (
          <p>Nenhum registro encontrado.</p>
        ) : (
          <Table minWidth={560}>
            <TableHead>
              <TableRow>
                <TableHeaderCell align="center">Status</TableHeaderCell>
                <TableHeaderCell>Data</TableHeaderCell>
                <TableHeaderCell>Detalhe</TableHeaderCell>
                <TableHeaderCell>Origem</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {historico.map((item) => (
                <TableRow key={item.id}>
                  <TableCell align="center">
                    {item.sucesso ? (
                      <CheckCircle2
                        size={18}
                        color="#16a34a"
                        aria-label="Login bem-sucedido"
                      />
                    ) : (
                      <XCircle
                        size={18}
                        color="#c62828"
                        aria-label="Login com falha"
                      />
                    )}
                  </TableCell>

                  <TableCell>{formatarData(item.criadoEm)}</TableCell>

                  <TableCell>
                    {item.sucesso ? (
                      <Badge variant="success">Login realizado</Badge>
                    ) : (
                      <Badge variant="danger">
                        {motivosFalha[item.motivoFalha ?? ""] ??
                          "Falha no login"}
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell>{item.ipOrigem ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </PageContainer>
  );
}
