"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import {
  definirPerfilDaMaquina,
  listarMaquinasTempo,
  listarPerfisTempo,
  listarRecursosErp,
  type RecursoErp,
} from "../../services/temposMaquinaAdmin.service";
import type { MaquinaTempo, PerfilTempoCadastro } from "../../types/temposMaquina.types";
import styles from "./TemposMaquina.module.css";

const SEM_PERFIL = "";

function buscarTudo() {
  return Promise.all([listarRecursosErp(), listarMaquinasTempo(), listarPerfisTempo()]);
}

type Linha = { codRecurso: string; descRecurso: string | null; centro: string | null; noErp: boolean; ligacao: MaquinaTempo | null };

/* Máquinas do ERP (recursos) -> perfil de cálculo. */
export function MaquinasTempoPainel({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [recursos, setRecursos] = useState<RecursoErp[] | null>(null);
  const [erroErp, setErroErp] = useState<string | null>(null);
  const [maquinas, setMaquinas] = useState<MaquinaTempo[]>([]);
  const [perfis, setPerfis] = useState<PerfilTempoCadastro[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);

  const aplicar = useCallback(
    ([erp, ligacoes, listaPerfis]: Awaited<ReturnType<typeof buscarTudo>>) => {
      if (erp.ok) {
        setErroErp(null);
        setRecursos(erp.data);
      } else {
        setErroErp(erp.message);
        setRecursos([]);
      }
      setMaquinas(ligacoes.data ?? []);
      setPerfis(listaPerfis.data ?? []);
      if (!ligacoes.ok || !listaPerfis.ok) onFeedback("danger", "Máquinas", ligacoes.message ?? listaPerfis.message ?? "Não foi possível carregar.");
    },
    [onFeedback]
  );

  useEffect(() => {
    void buscarTudo().then(aplicar);
  }, [aplicar]);

  function recarregar() {
    setRecursos(null);
    void buscarTudo().then(aplicar);
  }

  /* As do ERP, mais as ligadas que o ERP não devolveu (inativas lá ou ERP fora do ar). */
  const linhas = useMemo<Linha[]>(() => {
    const porCodigo = new Map(maquinas.map((m) => [m.codRecurso.toUpperCase(), m]));
    const doErp: Linha[] = (recursos ?? []).map((r) => ({
      codRecurso: r.COD_RECURSO.trim(),
      descRecurso: r.DESC_RECURSO?.trim() || null,
      centro: r.COD_CENTRO_TRAB ? `${r.COD_CENTRO_TRAB} - ${r.DESC_CENTRO_TRAB ?? ""}`.trim() : null,
      noErp: true,
      ligacao: porCodigo.get(r.COD_RECURSO.trim().toUpperCase()) ?? null,
    }));
    const noErp = new Set(doErp.map((l) => l.codRecurso.toUpperCase()));
    const orfas: Linha[] = maquinas
      .filter((m) => !noErp.has(m.codRecurso.toUpperCase()))
      .map((m) => ({ codRecurso: m.codRecurso, descRecurso: m.descRecurso, centro: null, noErp: false, ligacao: m }));
    return [...doErp, ...orfas].sort((a, b) => (a.centro ?? "~").localeCompare(b.centro ?? "~") || a.codRecurso.localeCompare(b.codRecurso));
  }, [recursos, maquinas]);

  async function ligar(linha: Linha, perfilId: string) {
    setSalvando(linha.codRecurso);
    const resposta = await definirPerfilDaMaquina({ codRecurso: linha.codRecurso, descRecurso: linha.descRecurso, perfilId: perfilId || null });
    setSalvando(null);
    if (!resposta.ok) {
      onFeedback("danger", "Máquina não alterada", resposta.message ?? "Tente de novo.");
      return;
    }
    setMaquinas(resposta.data ?? []);
    onFeedback("success", resposta.message ?? "Máquina salva", linha.codRecurso);
  }

  const opcoes = [
    { value: SEM_PERFIL, label: "Sem cálculo automático" },
    ...perfis.map((p) => ({ value: p.id, label: p.ativo ? p.nome : `${p.nome} (inativo)` })),
  ];

  return (
    <Card
      title="Máquinas do ERP"
      description="Ligue cada máquina (recurso do ERP) ao perfil que calcula o tempo dela. Um perfil pode servir várias máquinas."
      actions={
        <Button variant="secondary" onClick={recarregar}>
          <RefreshCw size={15} /> Atualizar
        </Button>
      }
    >
      <Stack gap={16}>
        {erroErp && (
          <Alert variant="warning" title="ERP fora do ar">
            {erroErp} Aparecem só as máquinas já ligadas.
          </Alert>
        )}

        {recursos === null ? (
          <Loader />
        ) : (
          <Table minWidth={820}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Máquina</TableHeaderCell>
                <TableHeaderCell>Centro de trabalho</TableHeaderCell>
                <TableHeaderCell>Perfil de cálculo</TableHeaderCell>
                <TableHeaderCell>Situação</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {linhas.map((linha) => (
                <TableRow key={linha.codRecurso}>
                  <TableCell>
                    <Stack gap={2}>
                      <strong>{linha.codRecurso}</strong>
                      {linha.descRecurso && <span className={styles.textoFraco}>{linha.descRecurso}</span>}
                    </Stack>
                  </TableCell>
                  <TableCell>{linha.centro ?? <span className={styles.textoFraco}>{linha.noErp ? "—" : "Não veio do ERP"}</span>}</TableCell>
                  <TableCell>
                    <Dropdown
                      value={linha.ligacao?.perfilId ?? SEM_PERFIL}
                      options={opcoes}
                      disabled={salvando === linha.codRecurso}
                      onValueChange={(v) => void ligar(linha, v)}
                    />
                  </TableCell>
                  <TableCell>
                    {!linha.ligacao ? (
                      <span className={styles.textoFraco}>—</span>
                    ) : linha.ligacao.perfilAtivo ? (
                      <Badge variant="success">Calcula no Roteiro</Badge>
                    ) : (
                      <Badge variant="warning">Perfil inativo</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
