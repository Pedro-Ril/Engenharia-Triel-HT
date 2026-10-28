"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import { enviarRubrica, listarRubricas, removerRubrica, urlPreviaRubrica } from "../services/adminPermissoes.service";
import type { RubricaAprovador } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./RubricasAprovadoresCard.module.css";

interface RubricasAprovadoresCardProps {
  onFeedback: FeedbackHandler;
  /* Depois de enviar/remover: o histórico das alçadas ganha uma linha. */
  onAlterado: () => void;
}

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/*
 * Rubricas dos aprovadores de pedido de compra: o PNG que o Portal
 * estampa no rodapé do PDF do pedido, no nível que a pessoa aprovou.
 * Lista quem está nas alçadas de pedido de compra (e quem tem rubrica
 * mesmo fora delas, para poder remover).
 */
export function RubricasAprovadoresCard({ onFeedback, onAlterado }: RubricasAprovadoresCardProps) {
  const [rubricas, setRubricas] = useState<RubricaAprovador[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<RubricaAprovador | null>(null);
  const [processandoRemocao, setProcessandoRemocao] = useState(false);
  /* Para quem é o arquivo escolhido no seletor (um seletor só para a lista toda). */
  const alvoEnvio = useRef<RubricaAprovador | null>(null);
  const seletor = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ativo = true;
    listarRubricas().then((resultado) => {
      if (!ativo) return;
      if (resultado.ok && resultado.data) {
        setRubricas(resultado.data);
        setErro(null);
      } else {
        setErro(resultado.message ?? "Não foi possível carregar as rubricas.");
      }
    });
    return () => {
      ativo = false;
    };
  }, [recarga]);

  function escolherArquivo(pessoa: RubricaAprovador) {
    alvoEnvio.current = pessoa;
    seletor.current?.click();
  }

  async function handleArquivo(arquivo: File | undefined) {
    const pessoa = alvoEnvio.current;
    if (seletor.current) seletor.current.value = "";
    if (!arquivo || !pessoa) return;

    setEnviando(pessoa.usuarioId);
    try {
      const resultado = await enviarRubrica(pessoa.usuarioId, arquivo);
      if (resultado.ok) {
        onFeedback("success", "Rubrica salva", `Vale para os próximos PDFs que ${pessoa.nome} aprovar ou já aprovou.`);
        setRecarga((n) => n + 1);
        onAlterado();
      } else {
        onFeedback("danger", "Rubrica não enviada", resultado.message ?? "Tente novamente.");
      }
    } finally {
      setEnviando(null);
    }
  }

  async function handleRemover() {
    if (!removendo) return;
    setProcessandoRemocao(true);
    try {
      const resultado = await removerRubrica(removendo.usuarioId);
      if (resultado.ok) {
        onFeedback("success", "Rubrica removida", `Os PDFs passam a mostrar só o nome de ${removendo.nome}.`);
        setRemovendo(null);
        setRecarga((n) => n + 1);
        onAlterado();
      } else {
        onFeedback("danger", "Não foi possível remover", resultado.message ?? "Tente novamente.");
      }
    } finally {
      setProcessandoRemocao(false);
    }
  }

  return (
    <Card
      title="Rubricas dos aprovadores"
      description="Estampadas no rodapé do PDF do pedido de compra, no nível que cada pessoa aprovou. PNG de até 512 KB, de preferência com fundo transparente."
    >
      <Stack gap={16}>
        <input
          ref={seletor}
          type="file"
          accept="image/png"
          className={styles.seletor}
          onChange={(evento) => void handleArquivo(evento.target.files?.[0])}
        />

        {erro && <Alert variant="danger">{erro}</Alert>}

        {!rubricas && !erro ? (
          <Loader label="Carregando rubricas..." />
        ) : rubricas && rubricas.length === 0 ? (
          <span className={styles.vazio}>Ninguém nas alçadas de pedido de compra ainda.</span>
        ) : (
          rubricas && (
            <Table minWidth={640}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Aprovador</TableHeaderCell>
                  <TableHeaderCell>Rubrica</TableHeaderCell>
                  <TableHeaderCell>Atualizada</TableHeaderCell>
                  <TableHeaderCell align="center">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rubricas.map((pessoa) => (
                  <TableRow key={pessoa.usuarioId}>
                    <TableCell>
                      <Stack gap={4}>
                        <strong>{pessoa.nome}</strong>
                        {!pessoa.naAlcada && <Badge variant="neutral">Fora das alçadas</Badge>}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {pessoa.temRubrica ? (
                        // eslint-disable-next-line @next/next/no-img-element -- prévia privada, servida pela rota de admin
                        <img
                          className={styles.previa}
                          src={urlPreviaRubrica(pessoa.usuarioId, pessoa.atualizadoEm)}
                          alt={`Rubrica de ${pessoa.nome}`}
                        />
                      ) : (
                        <Badge variant="warning">Sem rubrica</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {pessoa.atualizadoEm ? (
                        <span className={styles.secundario}>
                          {formatarData(pessoa.atualizadoEm)}
                          {pessoa.atualizadoPor ? ` por ${pessoa.atualizadoPor}` : ""}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" gap={6} justify="center">
                        <Button
                          variant="secondary"
                          loading={enviando === pessoa.usuarioId}
                          onClick={() => escolherArquivo(pessoa)}
                        >
                          <Upload size={15} />
                          {pessoa.temRubrica ? "Trocar" : "Enviar PNG"}
                        </Button>
                        {pessoa.temRubrica && (
                          <IconButton
                            icon={<Trash2 size={15} />}
                            label={`Remover a rubrica de ${pessoa.nome}`}
                            size="small"
                            onClick={() => setRemovendo(pessoa)}
                          />
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        )}
      </Stack>

      <ConfirmDialog
        open={removendo !== null}
        title="Remover rubrica?"
        variant="danger"
        message={
          removendo
            ? `Os PDFs dos pedidos que ${removendo.nome} aprovou passam a mostrar só o nome, o nível e a data, sem a rubrica.`
            : ""
        }
        confirmLabel="Remover"
        loading={processandoRemocao}
        onConfirm={handleRemover}
        onClose={() => setRemovendo(null)}
      />
    </Card>
  );
}
