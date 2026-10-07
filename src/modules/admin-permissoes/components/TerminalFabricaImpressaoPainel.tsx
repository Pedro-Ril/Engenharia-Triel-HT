"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, ShieldCheck, Trash2, UserCheck } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/Autocomplete";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Pagination } from "@/components/ui/Pagination";
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

import {
  buscarImpressoesTerminalFabrica,
  liberarImpressaoTerminal,
  listarPermissoesImpressaoTerminal,
  revogarImpressaoTerminal,
} from "../services/adminPermissoes.service";
import type {
  ImpressoesTerminalFabricaData,
} from "../services/adminPermissoes.service";
import type {
  PermissaoImpressaoTerminal,
  PortalUsuarioAdmin,
} from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface TerminalFabricaImpressaoPainelProps {
  usuarios: PortalUsuarioAdmin[];
  onFeedback: FeedbackHandler;
}

const POR_PAGINA_IMPRESSOES = 25;

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/*
 * O visualizador da Consulta 2D / 3D não imprime nem baixa de propósito
 * -- é um kiosk de chão de fábrica. Aqui se libera a exceção, usuário
 * por usuário, e se acompanha o que foi pedido para imprimir.
 *
 * Administrador não aparece na lista porque não precisa de linha: ele
 * imprime sempre, como em todo o resto do portal.
 */
export function TerminalFabricaImpressaoPainel({
  usuarios,
  onFeedback,
}: TerminalFabricaImpressaoPainelProps) {
  const [permissoes, setPermissoes] = useState<PermissaoImpressaoTerminal[]>([]);
  const [carregandoPermissoes, setCarregandoPermissoes] = useState(true);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<AutocompleteOption | null>(null);
  const [liberando, setLiberando] = useState(false);
  const [revogando, setRevogando] = useState<PermissaoImpressaoTerminal | null>(null);
  const [confirmandoRevogar, setConfirmandoRevogar] = useState(false);

  const [impressoes, setImpressoes] = useState<ImpressoesTerminalFabricaData | null>(null);
  const [carregandoImpressoes, setCarregandoImpressoes] = useState(true);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    listarPermissoesImpressaoTerminal().then((resultado) => {
      if (resultado.ok && resultado.data) setPermissoes(resultado.data);
      setCarregandoPermissoes(false);
    });
  }, []);

  useEffect(() => {
    let cancelado = false;

    buscarImpressoesTerminalFabrica({ pagina, porPagina: POR_PAGINA_IMPRESSOES }).then(
      (resultado) => {
        if (cancelado) return;
        setImpressoes(resultado);
        setCarregandoImpressoes(false);
      }
    );

    return () => {
      cancelado = true;
    };
  }, [pagina]);

  /* Quem ainda pode ser liberado: ativo, não administrador e sem linha. */
  const opcoesUsuarios = useMemo<AutocompleteOption[]>(() => {
    const jaLiberados = new Set(permissoes.map((item) => item.usuarioId));

    return usuarios
      .filter(
        (usuario) =>
          usuario.ativo && !usuario.ehAdministrador && !jaLiberados.has(usuario.id)
      )
      .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao, "pt-BR"))
      .map((usuario) => ({ value: usuario.id, label: usuario.nomeExibicao }));
  }, [usuarios, permissoes]);

  async function liberar() {
    if (!usuarioSelecionado) return;

    setLiberando(true);

    const resultado = await liberarImpressaoTerminal(usuarioSelecionado.value);

    if (resultado.ok && resultado.data) {
      setPermissoes((atual) =>
        [...atual, resultado.data as PermissaoImpressaoTerminal].sort((a, b) =>
          a.usuarioNome.localeCompare(b.usuarioNome, "pt-BR")
        )
      );
      setUsuarioSelecionado(null);
      onFeedback(
        "success",
        "Impressão liberada",
        `${usuarioSelecionado.label} já pode imprimir desenhos na Consulta 2D / 3D.`
      );
    } else {
      onFeedback(
        "danger",
        "Não foi possível liberar a impressão",
        resultado.message ?? "Tente novamente em instantes."
      );
    }

    setLiberando(false);
  }

  async function confirmarRevogar() {
    if (!revogando) return;

    setConfirmandoRevogar(true);

    const resultado = await revogarImpressaoTerminal(revogando.usuarioId);

    if (resultado.ok) {
      setPermissoes((atual) => atual.filter((item) => item.usuarioId !== revogando.usuarioId));
      onFeedback(
        "success",
        "Permissão revogada",
        `${revogando.usuarioNome} não imprime mais desenhos.`
      );
      setRevogando(null);
    } else {
      onFeedback(
        "danger",
        "Não foi possível revogar",
        resultado.message ?? "Tente novamente em instantes."
      );
    }

    setConfirmandoRevogar(false);
  }

  const totalPaginas = impressoes
    ? Math.max(1, Math.ceil(impressoes.total / POR_PAGINA_IMPRESSOES))
    : 1;

  return (
    <Stack gap={20}>
      {/*
        allowOverflow por causa do Autocomplete: o Card tem
        overflow: hidden, e sem isto a lista de sugestões é cortada na
        borda de baixo. Mesmo motivo de AprovacoesEscopoPainel.
      */}
      <Card
        allowOverflow
        title="Quem pode imprimir"
        description="O visualizador de desenho da Consulta 2D / 3D não imprime nem baixa — é um terminal de chão de fábrica. Quem estiver nesta lista ganha o botão de imprimir dentro do visualizador. Administradores imprimem sempre, sem precisar entrar aqui."
      >
        <Stack gap={16}>
          <Alert variant="info">
            A permissão é por pessoa: só vale para quem estiver logado no portal. No terminal
            compartilhado, sem ninguém logado, o botão não aparece para nenhum visitante.
          </Alert>

          <FormGrid columns={2}>
            <Field label="Liberar impressão para">
              <Autocomplete
                options={opcoesUsuarios}
                selectedOption={usuarioSelecionado}
                onSelect={setUsuarioSelecionado}
                placeholder="Digite o nome do usuário..."
                emptyMessage="Nenhum usuário disponível."
                disabled={carregandoPermissoes || liberando}
              />
            </Field>

            <Field label="&nbsp;">
              <Button
                onClick={liberar}
                disabled={!usuarioSelecionado || liberando}
                loading={liberando}
              >
                <UserCheck size={16} />
                Liberar impressão
              </Button>
            </Field>
          </FormGrid>

          {carregandoPermissoes ? (
            <Loader label="Carregando permissões..." />
          ) : permissoes.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck />}
              title="Ninguém liberado ainda"
              description="Só administradores imprimem desenhos no momento."
            />
          ) : (
            <Table minWidth={620}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Usuário</TableHeaderCell>
                  <TableHeaderCell>Liberado em</TableHeaderCell>
                  <TableHeaderCell>Liberado por</TableHeaderCell>
                  <TableHeaderCell align="center">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {permissoes.map((permissao) => (
                  <TableRow key={permissao.usuarioId}>
                    <TableCell>
                      <strong>{permissao.usuarioNome}</strong>
                    </TableCell>

                    <TableCell>{formatarData(permissao.concedidoEm)}</TableCell>

                    <TableCell>{permissao.concedidoPor ?? "—"}</TableCell>

                    <TableCell align="center">
                      <IconButton
                        icon={<Trash2 size={16} />}
                        label={`Revogar impressão de ${permissao.usuarioNome}`}
                        variant="danger"
                        onClick={() => setRevogando(permissao)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Card>

      <Card
        title="Impressões pedidas"
        description="Cada vez que alguém clicou em imprimir no visualizador. O diálogo de impressão é do sistema operacional, então o portal registra o pedido — não dá para saber se a pessoa confirmou ou cancelou na janela do navegador."
      >
        {carregandoImpressoes || !impressoes ? (
          <Loader label="Carregando impressões..." />
        ) : (
          <Stack gap={20}>
            <FormGrid columns={3}>
              <StatCard
                label="Total de impressões"
                value={impressoes.resumo.totalImpressoes}
                icon={<Printer />}
              />

              <StatCard
                label="Impressões hoje"
                value={impressoes.resumo.impressoesHoje}
                icon={<Printer />}
                variant="info"
              />

              {/*
                Sai da mesma lista da tabela acima, não do resumo do
                servidor: liberar ou revogar muda o estado local na hora,
                e o resumo só seria recarregado na próxima visita --
                o card ficava contando errado logo depois da ação.
              */}
              <StatCard
                label="Usuários liberados"
                value={permissoes.length}
                icon={<ShieldCheck />}
                variant="neutral"
              />
            </FormGrid>

            {impressoes.impressoes.length === 0 ? (
              <EmptyState
                icon={<Printer />}
                title="Nenhuma impressão registrada"
                description="Nenhum desenho foi mandado para a impressora pela Consulta 2D / 3D até agora."
              />
            ) : (
              <>
                <Table minWidth={700}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Item</TableHeaderCell>
                      <TableHeaderCell>Usuário</TableHeaderCell>
                      <TableHeaderCell align="center">Páginas</TableHeaderCell>
                      <TableHeaderCell>Origem</TableHeaderCell>
                      <TableHeaderCell>Data</TableHeaderCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {impressoes.impressoes.map((impressao) => (
                      <TableRow key={impressao.id}>
                        <TableCell>
                          <strong>{impressao.codigoItem}</strong>
                        </TableCell>

                        <TableCell>{impressao.usuarioNome}</TableCell>

                        <TableCell align="center">
                          {impressao.totalPaginas ? (
                            <Badge variant="neutral">{impressao.totalPaginas}</Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>

                        <TableCell>{impressao.ipOrigem ?? "—"}</TableCell>

                        <TableCell>{formatarData(impressao.impressoEm)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination
                  page={pagina}
                  totalPages={totalPaginas}
                  onPageChange={(novaPagina) => {
                    setCarregandoImpressoes(true);
                    setPagina(novaPagina);
                  }}
                />
              </>
            )}
          </Stack>
        )}
      </Card>

      <ConfirmDialog
        open={revogando !== null}
        title="Revogar permissão de impressão"
        message={
          revogando
            ? `${revogando.usuarioNome} deixará de ver o botão de imprimir no visualizador da Consulta 2D / 3D. O histórico de impressões já registradas continua.`
            : ""
        }
        confirmLabel="Revogar"
        variant="danger"
        loading={confirmandoRevogar}
        onConfirm={confirmarRevogar}
        onClose={() => setRevogando(null)}
      />
    </Stack>
  );
}
