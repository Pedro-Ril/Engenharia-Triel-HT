"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Loader } from "@/components/ui/Loader";
import { NumberInput } from "@/components/ui/NumberInput";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { listarNotificacoesEmailChamados } from "@/modules/chamados/services/chamados.service";
import type {
  EventoNotificacaoChamado,
  NotificacaoEmailChamado,
} from "@/modules/chamados/types/chamados.types";

const EVENTO_LABELS: Record<EventoNotificacaoChamado, string> = {
  aberto: "Abertura",
  aceito: "Aceito",
  nova_resposta: "Nova resposta",
  resolvido_pendente: "Resolvido (aguardando confirmação)",
  reaberto: "Reaberto",
  fechado: "Fechado",
};

const OPCOES_EVENTO = [
  { value: "", label: "Todos os eventos" },
  ...(Object.keys(EVENTO_LABELS) as EventoNotificacaoChamado[]).map((evento) => ({
    value: evento,
    label: EVENTO_LABELS[evento],
  })),
];

const OPCOES_STATUS = [
  { value: "", label: "Todos os status" },
  { value: "true", label: "Enviado com sucesso" },
  { value: "false", label: "Falhou" },
];

function formatarDataHora(dataIso: string): string {
  return new Date(dataIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

const POR_PAGINA = 20;

export function NotificacoesEmailChamadosPainel() {
  const [chamadoNumeroDigitado, setChamadoNumeroDigitado] = useState("");
  const [chamadoNumero, setChamadoNumero] = useState("");
  const [evento, setEvento] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [pagina, setPagina] = useState(1);

  const [itens, setItens] = useState<NotificacaoEmailChamado[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setChamadoNumero(chamadoNumeroDigitado);
      setPagina(1);
    }, 400);
    return () => clearTimeout(temporizador);
  }, [chamadoNumeroDigitado]);

  useEffect(() => {
    let cancelado = false;

    /*
     * setCarregando(true) fica dentro do efeito (não no timeout do
     * debounce nem nos handlers de filtro) — o efeito só reexecuta
     * quando chamadoNumero/evento/sucesso/pagina realmente mudam, então
     * nunca fica "preso" em true. Colocar no timeout do debounce causava
     * um bug real: ele dispara de novo a cada digitação mesmo sem
     * mudança de valor, reancorando carregando=true sem nenhum efeito
     * subsequente pra voltar a false (loader trava pra sempre).
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true);
    listarNotificacoesEmailChamados({
      chamadoNumero: chamadoNumero ? Number(chamadoNumero) : undefined,
      evento: (evento as EventoNotificacaoChamado) || undefined,
      sucesso: sucesso === "" ? undefined : sucesso === "true",
      pagina,
      porPagina: POR_PAGINA,
    }).then((resultado) => {
      if (cancelado) return;

      if (resultado) {
        setItens(resultado.itens);
        setTotal(resultado.total);
      }

      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [chamadoNumero, evento, sucesso, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <Card
      title="Notificações de e-mail"
      description="Todo e-mail enviado ao solicitante sobre uma mudança no chamado (abertura, aceite, respostas, resolução, reabertura, encerramento)."
    >
      <Stack gap={16}>
        <FormGrid columns={3}>
          <Field label="Nº do chamado">
            <NumberInput
              value={chamadoNumeroDigitado}
              min={1}
              placeholder="Ex: 1024"
              onChange={(event) => setChamadoNumeroDigitado(event.target.value)}
            />
          </Field>

          <Field label="Evento">
            <Dropdown
              value={evento}
              options={OPCOES_EVENTO}
              onValueChange={(valor) => {
                setEvento(valor);
                setPagina(1);
              }}
            />
          </Field>

          <Field label="Status do envio">
            <Dropdown
              value={sucesso}
              options={OPCOES_STATUS}
              onValueChange={(valor) => {
                setSucesso(valor);
                setPagina(1);
              }}
            />
          </Field>
        </FormGrid>

        {carregando ? (
          <Loader label="Carregando notificações..." />
        ) : itens.length === 0 ? (
          <EmptyState
            icon={<Mail size={28} />}
            title="Nenhuma notificação encontrada"
            description="Sem e-mails registrados para os filtros selecionados."
          />
        ) : (
          <>
            <Table minWidth={860}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Chamado</TableHeaderCell>
                  <TableHeaderCell>Evento</TableHeaderCell>
                  <TableHeaderCell>Destinatário</TableHeaderCell>
                  <TableHeaderCell>Assunto</TableHeaderCell>
                  <TableHeaderCell align="center">Status</TableHeaderCell>
                  <TableHeaderCell>Quando</TableHeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {itens.map((notificacao) => (
                  <TableRow key={notificacao.id}>
                    <TableCell>
                      #{notificacao.chamadoNumero} — {notificacao.chamadoTitulo}
                    </TableCell>
                    <TableCell>{EVENTO_LABELS[notificacao.evento]}</TableCell>
                    <TableCell>
                      {notificacao.destinatarioNome ?? notificacao.destinatarioEmail}
                      {notificacao.destinatarioNome && (
                        <>
                          <br />
                          <small>{notificacao.destinatarioEmail}</small>
                        </>
                      )}
                    </TableCell>
                    <TableCell>{notificacao.assunto}</TableCell>
                    <TableCell align="center">
                      <Badge variant={notificacao.sucesso ? "success" : "danger"}>
                        {notificacao.sucesso ? "Enviado" : "Falhou"}
                      </Badge>
                      {!notificacao.sucesso && notificacao.erroMensagem && (
                        <>
                          <br />
                          <small>{notificacao.erroMensagem}</small>
                        </>
                      )}
                    </TableCell>
                    <TableCell>{formatarDataHora(notificacao.enviadoEm)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
          </>
        )}
      </Stack>
    </Card>
  );
}
