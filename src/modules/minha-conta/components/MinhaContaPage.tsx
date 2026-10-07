"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Home,
  Settings,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TOOLTIP_GRAFICO_TEMA } from "@/lib/tema/tooltip-grafico";
import Link from "next/link";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormGrid } from "@/components/ui/FormGrid";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RadioGroup } from "@/components/ui/RadioGroup";
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
import { Tabs } from "@/components/ui/Tabs";
import { Toast } from "@/components/ui/Toast";
import { resolverIcone } from "@/lib/icons/icon-registry";
import { aplicarTemaComTransicao } from "@/lib/tema/aplicar-tema";
import { OPCOES_TEMA } from "@/lib/tema/opcoes-tema";
import {
  MODO_GESTOS_PADRAO,
  OPCOES_MODO_GESTOS,
  type ModoGestos,
} from "@/modules/visualizador-cad/constants/gestos";

import {
  atualizarGestosCadUsuario,
  atualizarTemaUsuario,
  buscarMinhaConta,
} from "../services/minhaConta.service";
import type { MinhaContaData, TemaPreferencia } from "../types/minhaConta.types";
import styles from "./MinhaConta.module.css";

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
  const [erro, setErro] = useState<"sessao_expirada" | "erro" | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("geral");
  const [tema, setTema] = useState<TemaPreferencia>("sistema");
  const [salvandoTema, setSalvandoTema] = useState(false);
  const [gestosCad, setGestosCad] = useState<ModoGestos>(MODO_GESTOS_PADRAO);
  const [salvandoGestos, setSalvandoGestos] = useState(false);
  const ultimoCliqueTemaRef = useRef({ x: 0, y: 0 });
  const [toast, setToast] = useState({
    open: false,
    variant: "success" as "success" | "danger",
    title: "",
    description: "",
  });

  useEffect(() => {
    let cancelado = false;

    buscarMinhaConta().then((resultado) => {
      if (cancelado) return;

      if (resultado.ok) {
        setDados(resultado.data);
        setTema(resultado.data.perfil.tema);
        setGestosCad(resultado.data.perfil.gestosCad);
        setErro(null);
      } else {
        setErro(resultado.motivo);
      }

      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, []);

  async function handleAlterarTema(
    novoTema: TemaPreferencia,
    origem: { x: number; y: number }
  ) {
    const temaAnterior = tema;

    setTema(novoTema);
    aplicarTemaComTransicao(novoTema, origem);
    setSalvandoTema(true);

    const resultado = await atualizarTemaUsuario(novoTema);

    setSalvandoTema(false);

    if (!resultado.ok) {
      setTema(temaAnterior);
      aplicarTemaComTransicao(temaAnterior, origem);
      setToast({
        open: true,
        variant: "danger",
        title: "Não foi possível salvar",
        description: resultado.message ?? "Tente novamente em instantes.",
      });
      return;
    }

    setToast({
      open: true,
      variant: "success",
      title: "Aparência atualizada",
      description: "Sua preferência foi salva.",
    });
  }

  async function handleAlterarGestos(novoModo: ModoGestos) {
    const anterior = gestosCad;

    /* Troca na hora e desfaz se o servidor recusar -- mesmo padrão do tema. */
    setGestosCad(novoModo);
    setSalvandoGestos(true);

    const resultado = await atualizarGestosCadUsuario(novoModo);

    setSalvandoGestos(false);

    if (!resultado.ok) {
      setGestosCad(anterior);
      setToast({
        open: true,
        variant: "danger",
        title: "Não foi possível salvar",
        description: resultado.message ?? "Tente novamente em instantes.",
      });
      return;
    }

    setToast({
      open: true,
      variant: "success",
      title: "Gestos do mouse atualizados",
      description: "Vale no Visualizador CAD, da próxima vez que você abrir.",
    });
  }

  if (carregando) {
    return (
      <PageContainer>
        <Loader label="Carregando sua conta..." />
      </PageContainer>
    );
  }

  if (erro === "sessao_expirada") {
    return (
      <PageContainer>
        <Alert variant="warning" title="Sua sessão expirou">
          <Stack gap={12}>
            <span>Entre novamente para ver os dados da sua conta.</span>
            <Stack direction="row">
              <Link href="/login?next=/minha-conta&motivo=sessao_expirada">
                <Button>Entrar novamente</Button>
              </Link>
            </Stack>
          </Stack>
        </Alert>
      </PageContainer>
    );
  }

  if (!dados) {
    return (
      <PageContainer>
        <Alert variant="danger">
          Não foi possível carregar os dados da sua conta. Verifique sua conexão e tente
          novamente.
        </Alert>
      </PageContainer>
    );
  }

  const { perfil, historico, acessosModulos } = dados;
  const totalSucessos = historico.filter((item) => item.sucesso).length;

  const dadosAcessosGrafico = [...acessosModulos]
    .sort((a, b) => b.totalAcessos - a.totalAcessos)
    .map((item) => ({ nome: item.moduloNome, total: item.totalAcessos }));

  const dadosLoginGrafico = [
    { label: "Sucesso", total: totalSucessos, cor: "var(--success-text)" },
    { label: "Falha", total: historico.length - totalSucessos, cor: "var(--danger-text)" },
  ].filter((item) => item.total > 0);

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

      <Tabs
        value={aba}
        onValueChange={setAba}
        items={[
          {
            value: "geral",
            label: "Visão geral",
            content: (
              <Stack gap={20}>
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
          description="Definido pelo grupo do Active Directory."
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

      <FormGrid columns={2}>
        <Card
          title="Acessos por módulo"
          description="Ferramentas mais utilizadas por você."
        >
          <div className={styles.painelConteudo}>
            {dadosAcessosGrafico.length === 0 ? (
              <div className={styles.painelVazio}>
                Nenhuma ferramenta acessada ainda.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={dadosAcessosGrafico} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 12 }} />
                  <Tooltip {...TOOLTIP_GRAFICO_TEMA} cursor={false} />
                  <Bar dataKey="total" name="Acessos" fill="var(--primary)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card
          title="Detalhe de acessos por módulo"
          description="Quantas vezes você abriu cada ferramenta liberada para o seu usuário."
        >
          <div className={`${styles.painelConteudo} ${styles.painelRolavel}`}>
            {acessosModulos.length === 0 ? (
              <div className={styles.painelVazio}>
                Nenhuma ferramenta liberada para o seu usuário ainda.
              </div>
            ) : (
              <Table minWidth={420}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className={styles.cabecalhoFixo}>Módulo</TableHeaderCell>
                    <TableHeaderCell align="center" className={styles.cabecalhoFixo}>
                      Acessos
                    </TableHeaderCell>
                    <TableHeaderCell className={styles.cabecalhoFixo}>
                      Último acesso
                    </TableHeaderCell>
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
          </div>
        </Card>
      </FormGrid>

      <FormGrid columns={2}>
        <Card
          title="Logins"
          description="Sucessos x falhas nas últimas tentativas registradas."
        >
          <div className={styles.painelConteudo}>
            {dadosLoginGrafico.length === 0 ? (
              <div className={styles.painelVazio}>Nenhum login registrado ainda.</div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <PieChart>
                  <Pie
                    data={dadosLoginGrafico}
                    dataKey="total"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label
                  >
                    {dadosLoginGrafico.map((entry) => (
                      <Cell key={entry.label} fill={entry.cor} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_GRAFICO_TEMA} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card
          title="Histórico de acessos"
          description="Últimas 50 tentativas de login com o seu usuário."
        >
          <div className={`${styles.painelConteudo} ${styles.painelRolavel}`}>
            {historico.length === 0 ? (
              <div className={styles.painelVazio}>Nenhum registro encontrado.</div>
            ) : (
              <Table minWidth={420}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell align="center" className={styles.cabecalhoFixo}>
                      Status
                    </TableHeaderCell>
                    <TableHeaderCell className={styles.cabecalhoFixo}>Data</TableHeaderCell>
                    <TableHeaderCell className={styles.cabecalhoFixo}>Detalhe</TableHeaderCell>
                    <TableHeaderCell className={styles.cabecalhoFixo}>Origem</TableHeaderCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {historico.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell align="center">
                        {item.sucesso ? (
                          <CheckCircle2
                            size={18}
                            color="var(--success-text)"
                            aria-label="Login bem-sucedido"
                          />
                        ) : (
                          <XCircle
                            size={18}
                            color="var(--danger-text)"
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
          </div>
        </Card>
                </FormGrid>
              </Stack>
            ),
          },
          {
            value: "configuracoes",
            label: (
              <Stack direction="row" gap={6} align="center">
                <Settings size={15} />
                Configurações
              </Stack>
            ),
            content: (
              <Stack gap={20}>
                <Card
                  title="Aparência"
                  description="Escolha como o portal deve aparecer para você. A preferência é salva na sua conta e vale em qualquer dispositivo."
                >
                  <div
                    onClickCapture={(event) => {
                      ultimoCliqueTemaRef.current = { x: event.clientX, y: event.clientY };
                    }}
                  >
                    <RadioGroup
                      name="tema"
                      orientation="horizontal"
                      options={OPCOES_TEMA}
                      value={tema}
                      disabled={salvandoTema}
                      onValueChange={(valor) =>
                        handleAlterarTema(valor as TemaPreferencia, ultimoCliqueTemaRef.current)
                      }
                    />
                  </div>
                </Card>

                {/* Só para quem abre o módulo: ajustar uma tela que a
                    pessoa não acessa seria ruído. */}
                {perfil.podeVisualizadorCad && (
                  <Card
                    title="Gestos do mouse no Visualizador CAD"
                    description="Como o mouse move a peça na tela do Visualizador CAD. Escolha SolidWorks se você estiver acostumado com os gestos de lá."
                  >
                    <RadioGroup
                      name="gestosCad"
                      options={OPCOES_MODO_GESTOS}
                      value={gestosCad}
                      disabled={salvandoGestos}
                      onValueChange={(valor) => handleAlterarGestos(valor as ModoGestos)}
                    />
                  </Card>
                )}
              </Stack>
            ),
          },
        ]}
      />

      <Toast
        open={toast.open}
        variant={toast.variant}
        title={toast.title}
        description={toast.description}
        onClose={() => setToast((atual) => ({ ...atual, open: false }))}
      />
    </PageContainer>
  );
}
