"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, RefreshCw, SlidersHorizontal } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { buscarPerfilOficial, publicarPerfilOficial } from "../services/workstationsNvidia.service";
import type { PerfilOficialNvidia } from "../types/workstationsNvidia.types";
import { descreverValorConfiguracao, formatarDataHora } from "../utils/exibicao";
import styles from "./WorkstationsNvidia.module.css";

interface PerfilNvidiaPainelProps {
  onFeedback: FeedbackHandler;
}

export function PerfilNvidiaPainel({ onFeedback }: PerfilNvidiaPainelProps) {
  const [perfil, setPerfil] = useState<PerfilOficialNvidia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [publicando, setPublicando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  async function recarregar() {
    const resposta = await buscarPerfilOficial();
    if (resposta.ok && resposta.data) {
      setPerfil(resposta.data);
    } else {
      onFeedback("danger", "Não foi possível ler o perfil", resposta.message ?? "Tente novamente.");
    }
  }

  useEffect(() => {
    let cancelado = false;
    buscarPerfilOficial().then((resposta) => {
      if (cancelado) return;
      if (resposta.ok && resposta.data) setPerfil(resposta.data);
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  async function handlePublicar() {
    if (!arquivoSelecionado) return;
    setPublicando(true);
    try {
      const resposta = await publicarPerfilOficial(arquivoSelecionado);
      if (resposta.ok && resposta.data) {
        setPerfil(resposta.data);
        onFeedback("success", "Perfil oficial publicado", resposta.message ?? "Pronto.");
      } else {
        onFeedback("danger", "Não foi possível publicar", resposta.message ?? "Confira o arquivo.");
      }
    } finally {
      setPublicando(false);
      setArquivoSelecionado(null);
      if (inputArquivo.current) inputArquivo.current.value = "";
    }
  }

  if (carregando) return <Loader label="Lendo o perfil oficial..." />;

  return (
    <Card
      title="Perfil oficial"
      description="O que deve estar aplicado em todas as workstations. O GPO copia este arquivo para as máquinas e o script reaplica quando algo diverge."
      actions={
        <Stack direction="row" gap={8}>
          <Button variant="secondary" onClick={recarregar}>
            <RefreshCw size={15} />
            Atualizar
          </Button>
          <Button onClick={() => inputArquivo.current?.click()} disabled={!perfil?.configurado}>
            <FileUp size={15} />
            Enviar novo perfil
          </Button>
          <input
            ref={inputArquivo}
            type="file"
            accept=".nip"
            className={styles.inputArquivo}
            onChange={(event) => setArquivoSelecionado(event.target.files?.[0] ?? null)}
          />
        </Stack>
      }
    >
      <Stack gap={16}>
        {!perfil?.configurado ? (
          <Alert variant="warning" title="Pasta central não configurada">
            Informe a pasta central do perfil na aba Configurações (ex: um compartilhamento na NETLOGON).
            É de lá que o GPO copia o perfil para as workstations.
          </Alert>
        ) : (
          <>
            {perfil.erro && <Alert variant="warning">{perfil.erro}</Alert>}

            <div className={styles.detalhes}>
              <span className={styles.rotulo}>Arquivo</span>
              <span className={styles.valor}>
                <code>{perfil.caminho}</code>
              </span>

              <span className={styles.rotulo}>Hash (SHA-256)</span>
              <span className={styles.valor}>
                {perfil.hash ? <code>{perfil.hash}</code> : "—"}
              </span>

              <span className={styles.rotulo}>Modificado em</span>
              <span className={styles.valor}>{formatarDataHora(perfil.modificadoEm)}</span>
            </div>

            {perfil.configuracoes.length === 0 ? (
              !perfil.erro && (
                <EmptyState
                  icon={<SlidersHorizontal size={26} />}
                  title="O perfil não tem configurações"
                  description="Envie um .nip exportado com -exportCustomized de uma máquina já configurada."
                />
              )
            ) : (
              <Table minWidth={720}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Perfil</TableHeaderCell>
                    <TableHeaderCell>Programas</TableHeaderCell>
                    <TableHeaderCell>Configuração</TableHeaderCell>
                    <TableHeaderCell>Valor</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {perfil.configuracoes.map((cfg) => (
                    <TableRow key={`${cfg.perfil}-${cfg.configuracaoId}`}>
                      <TableCell>{cfg.perfil}</TableCell>
                      <TableCell>
                        {cfg.executaveis.length > 0 ? (
                          <span className={styles.mono}>{cfg.executaveis.join(", ")}</span>
                        ) : (
                          <span className={styles.textoSecundario}>global</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {cfg.configuracao || cfg.configuracaoId}
                        <span className={styles.textoSecundario}> · ID {cfg.configuracaoId}</span>
                      </TableCell>
                      <TableCell>{descreverValorConfiguracao(cfg.configuracaoId, cfg.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </Stack>

      <ConfirmDialog
        open={arquivoSelecionado !== null}
        title="Publicar novo perfil oficial"
        message={
          <>
            O arquivo <strong>{arquivoSelecionado?.name}</strong> vai substituir o perfil oficial em
            <code> {perfil?.caminho}</code>. Na próxima atualização do GPO as workstations recebem o
            perfil novo e o script passa a garantir as configurações dele (as que não estiverem no
            perfil não são mexidas). Configurações gerenciadas pelo próprio driver (como a lista de
            IDs da GPU) são removidas automaticamente.
          </>
        }
        confirmLabel="Publicar"
        variant="warning"
        loading={publicando}
        onConfirm={handlePublicar}
        onClose={() => {
          setArquivoSelecionado(null);
          if (inputArquivo.current) inputArquivo.current.value = "";
        }}
      />
    </Card>
  );
}
