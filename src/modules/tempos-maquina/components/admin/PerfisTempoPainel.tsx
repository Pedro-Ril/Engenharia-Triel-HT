"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Pencil, Plus, Timer, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { atualizarPerfilTempo, excluirPerfilTempo, listarPerfisTempo } from "../../services/temposMaquinaAdmin.service";
import { ROTULO_METODO, type PerfilTempoCadastro } from "../../types/temposMaquina.types";
import { PerfilTempoEditor, type PerfilEmEdicao } from "./PerfilTempoEditor";
import styles from "./TemposMaquina.module.css";

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function resumoParametros(perfil: PerfilTempoCadastro): string {
  const p = perfil.parametros;
  if (p.metodo === "corte_cnc") {
    const espessuras = p.linhas.map((l) => l.espessuraMm);
    const mm = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return `${p.variantes.map((v) => v.rotulo).join(" / ")} · ${mm(Math.min(...espessuras))} a ${mm(Math.max(...espessuras))} mm`;
  }
  const dobra = !p.dobra ? "sem dobra" : p.dobra.regra === "fator" ? `${p.dobra.fatores.length} tipos de dobra` : "acréscimo por dobra";
  return `${p.faixas.length} ${p.faixas.length === 1 ? "faixa" : "faixas"} · ${dobra}`;
}

/* Perfis de cálculo: lista, ativar/desativar, criar, duplicar, editar, excluir. */
export function PerfisTempoPainel({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [perfis, setPerfis] = useState<PerfilTempoCadastro[] | null>(null);
  const [emEdicao, setEmEdicao] = useState<PerfilEmEdicao | null>(null);
  const [paraAtivar, setParaAtivar] = useState<PerfilTempoCadastro | null>(null);
  const [paraExcluir, setParaExcluir] = useState<PerfilTempoCadastro | null>(null);
  const [processando, setProcessando] = useState(false);

  const aplicar = useCallback(
    (resposta: Awaited<ReturnType<typeof listarPerfisTempo>>) => {
      if (!resposta.ok) onFeedback("danger", "Perfis de tempo", resposta.message ?? "Não foi possível carregar.");
      setPerfis(resposta.data ?? []);
    },
    [onFeedback]
  );

  useEffect(() => {
    void listarPerfisTempo().then(aplicar);
  }, [aplicar]);

  function substituir(perfil: PerfilTempoCadastro) {
    setPerfis((atual) => {
      const lista = atual ?? [];
      const existe = lista.some((p) => p.id === perfil.id);
      return (existe ? lista.map((p) => (p.id === perfil.id ? perfil : p)) : [...lista, perfil]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    });
  }

  async function mudarAtivo(perfil: PerfilTempoCadastro, ativo: boolean) {
    setProcessando(true);
    const resposta = await atualizarPerfilTempo(perfil.id, { ativo });
    setProcessando(false);
    setParaAtivar(null);
    if (!resposta.ok || !resposta.data) {
      onFeedback("danger", "Perfil não alterado", resposta.message ?? "Tente de novo.");
      return;
    }
    substituir(resposta.data);
    onFeedback("success", ativo ? "Perfil ativado" : "Perfil desativado", perfil.nome);
  }

  async function excluir(perfil: PerfilTempoCadastro) {
    setProcessando(true);
    const resposta = await excluirPerfilTempo(perfil.id);
    setProcessando(false);
    setParaExcluir(null);
    if (!resposta.ok) {
      onFeedback("danger", "Perfil não excluído", resposta.message ?? "Tente de novo.");
      return;
    }
    setPerfis((atual) => (atual ?? []).filter((p) => p.id !== perfil.id));
    onFeedback("success", "Perfil excluído", perfil.nome);
  }

  return (
    <Card
      title="Perfis de cálculo"
      description="Parâmetros do cálculo automático de tempo. Só perfil ativo aparece no Roteiro de Fabricação, para as máquinas ligadas a ele."
      actions={
        <Button onClick={() => setEmEdicao({ id: null, nome: "", metodo: "corte_cnc", observacao: null, parametros: null })}>
          <Plus size={15} /> Novo perfil
        </Button>
      }
    >
      {perfis === null ? (
        <Loader />
      ) : perfis.length === 0 ? (
        <EmptyState icon={<Timer />} title="Nenhum perfil" description="Crie um perfil para começar." />
      ) : (
        <Table minWidth={900}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Perfil</TableHeaderCell>
              <TableHeaderCell>Método</TableHeaderCell>
              <TableHeaderCell>Máquinas</TableHeaderCell>
              <TableHeaderCell>Ativo</TableHeaderCell>
              <TableHeaderCell>Atualizado</TableHeaderCell>
              <TableHeaderCell align="right">Ações</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {perfis.map((perfil) => (
              <TableRow key={perfil.id}>
                <TableCell>
                  <Stack gap={2}>
                    <strong>{perfil.nome}</strong>
                    <span className={styles.textoFraco}>{resumoParametros(perfil)}</span>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Badge variant={perfil.metodo === "corte_cnc" ? "info" : "neutral"}>{ROTULO_METODO[perfil.metodo]}</Badge>
                </TableCell>
                <TableCell>
                  {perfil.maquinas.length ? perfil.maquinas.map((m) => m.codRecurso).join(", ") : <span className={styles.textoFraco}>Nenhuma</span>}
                </TableCell>
                <TableCell>
                  <Switch
                    compact
                    label={perfil.ativo ? "Ativo" : "Inativo"}
                    checked={perfil.ativo}
                    disabled={processando}
                    onChange={(e) => (e.target.checked ? setParaAtivar(perfil) : void mudarAtivo(perfil, false))}
                  />
                </TableCell>
                <TableCell>
                  <Stack gap={2}>
                    <span>{formatarData(perfil.atualizadoEm)}</span>
                    {perfil.atualizadoPor && <span className={styles.textoFraco}>{perfil.atualizadoPor}</span>}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <div className={styles.acoes}>
                    <IconButton
                      icon={<Pencil size={15} />}
                      label="Editar"
                      onClick={() => setEmEdicao({ id: perfil.id, nome: perfil.nome, metodo: perfil.metodo, observacao: perfil.observacao, parametros: perfil.parametros })}
                    />
                    <IconButton
                      icon={<Copy size={15} />}
                      label="Duplicar"
                      onClick={() =>
                        setEmEdicao({ id: null, nome: `Cópia de ${perfil.nome}`.slice(0, 150), metodo: perfil.metodo, observacao: perfil.observacao, parametros: perfil.parametros })
                      }
                    />
                    <IconButton icon={<Trash2 size={15} />} label="Excluir" variant="danger" onClick={() => setParaExcluir(perfil)} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {emEdicao && (
        <PerfilTempoEditor
          inicial={emEdicao}
          onClose={() => setEmEdicao(null)}
          onSalvo={(perfil) => {
            substituir(perfil);
            setEmEdicao(null);
            onFeedback("success", emEdicao.id ? "Perfil salvo" : "Perfil criado (inativo)", perfil.nome);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(paraAtivar)}
        title="Ativar perfil"
        variant="warning"
        confirmLabel="Ativar"
        loading={processando}
        message={
          paraAtivar && (
            <>
              Com <strong>{paraAtivar.nome}</strong> ativo, o Roteiro de Fabricação passa a oferecer o cálculo automático de tempo para{" "}
              {paraAtivar.maquinas.length ? <strong>{paraAtivar.maquinas.map((m) => m.codRecurso).join(", ")}</strong> : "as máquinas que forem ligadas a ele"}. Ative só
              com os valores conferidos para a máquina.
            </>
          )
        }
        onConfirm={() => (paraAtivar ? mudarAtivo(paraAtivar, true) : undefined)}
        onClose={() => setParaAtivar(null)}
      />

      <ConfirmDialog
        open={Boolean(paraExcluir)}
        title="Excluir perfil"
        variant="danger"
        confirmLabel="Excluir"
        loading={processando}
        message={
          paraExcluir && (
            <>
              Excluir <strong>{paraExcluir.nome}</strong>? Os parâmetros se perdem (para guardar, desative em vez de excluir).
            </>
          )
        }
        onConfirm={() => (paraExcluir ? excluir(paraExcluir) : undefined)}
        onClose={() => setParaExcluir(null)}
      />
    </Card>
  );
}
