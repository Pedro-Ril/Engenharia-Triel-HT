"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";

import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";
import {
  arquivarVersaoTemplateAdmin,
  criarVersaoTemplateAdmin,
  listarVersoesTemplateAdmin,
  listarVinculosTemplateAdmin,
  publicarVersaoTemplateAdmin,
} from "@/modules/admin-permissoes/services/adminPermissoes.service";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import type { Template, TemplateVersao, VinculoTemplate } from "../types/template.types";
import { TemplateVersaoEditor } from "./TemplateVersaoEditor";
import { TemplateVinculoAba } from "./TemplateVinculoAba";

interface TemplateDetalheProps {
  template: Template;
  onVoltar: () => void;
  onTemplateAtualizado: (template: Template) => void;
  onFeedback: FeedbackHandler;
}

type AbaDetalhe = "versoes" | "vinculo";

const ABAS: { valor: AbaDetalhe; label: string }[] = [
  { valor: "versoes", label: "Versões" },
  { valor: "vinculo", label: "Vínculo" },
];

const STATUS_LABEL: Record<TemplateVersao["status"], string> = {
  rascunho: "Rascunho",
  em_teste: "Em teste",
  publicado: "Publicado",
  arquivado: "Arquivado",
};

const STATUS_VARIANT: Record<TemplateVersao["status"], "neutral" | "info" | "success" | "warning"> = {
  rascunho: "neutral",
  em_teste: "warning",
  publicado: "success",
  arquivado: "neutral",
};

export function TemplateDetalhe({ template, onVoltar, onTemplateAtualizado, onFeedback }: TemplateDetalheProps) {
  const [aba, setAba] = useState<AbaDetalhe>("versoes");
  const [versoes, setVersoes] = useState<TemplateVersao[]>([]);
  const [vinculos, setVinculos] = useState<VinculoTemplate[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [versaoEditandoId, setVersaoEditandoId] = useState<string | null>(null);
  const [criandoVersao, setCriandoVersao] = useState(false);
  const [confirmandoAcao, setConfirmandoAcao] = useState<{ tipo: "publicar" | "arquivar"; versao: TemplateVersao } | null>(
    null
  );
  const [executandoAcao, setExecutandoAcao] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);

      const [listaVersoes, listaVinculos] = await Promise.all([
        listarVersoesTemplateAdmin(template.id),
        listarVinculosTemplateAdmin(template.id),
      ]);

      if (cancelado) return;

      setVersoes(listaVersoes);
      setVinculos(listaVinculos);
      setCarregando(false);
    }

    carregar();

    return () => {
      cancelado = true;
    };
  }, [template.id]);

  async function handleNovaVersao() {
    setCriandoVersao(true);

    const ultimaPublicadaOuRascunho = versoes[0];

    const resultado = await criarVersaoTemplateAdmin(
      template.id,
      ultimaPublicadaOuRascunho?.templateJson
    );

    setCriandoVersao(false);

    if (!resultado.ok || !resultado.data) {
      onFeedback("danger", "Erro ao criar versão", resultado.message ?? "Tente novamente.");
      return;
    }

    setVersoes((atual) => [resultado.data!, ...atual]);
    setVersaoEditandoId(resultado.data.id);
  }

  async function handleConfirmarAcao() {
    if (!confirmandoAcao) return;

    setExecutandoAcao(true);

    const resultado =
      confirmandoAcao.tipo === "publicar"
        ? await publicarVersaoTemplateAdmin(template.id, confirmandoAcao.versao.id)
        : await arquivarVersaoTemplateAdmin(template.id, confirmandoAcao.versao.id);

    setExecutandoAcao(false);
    setConfirmandoAcao(null);

    if (!resultado.ok || !resultado.data) {
      onFeedback("danger", "Não foi possível concluir", resultado.message ?? "Tente novamente.");
      return;
    }

    setVersoes((atual) => atual.map((item) => (item.id === resultado.data!.id ? resultado.data! : item)));

    if (confirmandoAcao.tipo === "publicar") {
      onTemplateAtualizado({ ...template, versaoPublicadaId: resultado.data.id });
      onFeedback("success", "Versão publicada", `Versão ${resultado.data.numeroVersao} está publicada.`);
    } else {
      onFeedback("success", "Versão arquivada", `Versão ${resultado.data.numeroVersao} foi arquivada.`);
    }
  }

  const versaoEditando = versoes.find((item) => item.id === versaoEditandoId) ?? null;

  if (versaoEditando) {
    return (
      <TemplateVersaoEditor
        template={template}
        versao={versaoEditando}
        onVoltar={() => setVersaoEditandoId(null)}
        onVersaoAtualizada={(atualizada) => {
          setVersoes((atual) => atual.map((item) => (item.id === atualizada.id ? atualizada : item)));
        }}
        onFeedback={onFeedback}
      />
    );
  }

  return (
    <Stack gap={20}>
      <Stack direction="row" align="center" gap={12}>
        <IconButton icon={<ArrowLeft size={16} />} label="Voltar para a lista" onClick={onVoltar} />
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{template.nome}</h2>
          <span style={{ color: "var(--text-soft)", fontSize: "0.85rem" }}>{template.codigo}</span>
        </div>
      </Stack>

      <SegmentedTabs itens={ABAS} ativo={aba} onSelecionar={setAba} />

      {carregando ? (
        <Card>
          <Loader label="Carregando..." centered />
        </Card>
      ) : aba === "versoes" ? (
        <Card
          title="Versões"
          description="Fluxo: rascunho → em teste → publicado → arquivado. Só a versão publicada é usada na geração de desenhos."
          actions={
            <Button onClick={handleNovaVersao} loading={criandoVersao}>
              <Plus size={16} />
              Nova versão
            </Button>
          }
        >
          {versoes.length === 0 ? (
            <EmptyState title="Nenhuma versão ainda" description='Use "Nova versão" para começar a editar.' />
          ) : (
            <Table minWidth={640}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Versão</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Atualizado em</TableHeaderCell>
                  <TableHeaderCell align="right">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {versoes.map((versao) => (
                  <TableRow key={versao.id}>
                    <TableCell>#{versao.numeroVersao}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[versao.status]}>{STATUS_LABEL[versao.status]}</Badge>
                    </TableCell>
                    <TableCell>{new Date(versao.atualizadoEm).toLocaleString("pt-BR")}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" gap={6} justify="end">
                        {(versao.status === "rascunho" || versao.status === "em_teste") && (
                          <Button variant="secondary" onClick={() => setVersaoEditandoId(versao.id)}>
                            Editar
                          </Button>
                        )}
                        {(versao.status === "rascunho" || versao.status === "em_teste") && (
                          <Button onClick={() => setConfirmandoAcao({ tipo: "publicar", versao })}>Publicar</Button>
                        )}
                        {versao.status !== "arquivado" && (
                          <Button
                            variant="secondary"
                            onClick={() => setConfirmandoAcao({ tipo: "arquivar", versao })}
                          >
                            Arquivar
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : (
        <TemplateVinculoAba
          templateId={template.id}
          vinculos={vinculos}
          onVinculoCriado={(vinculo) => setVinculos((atual) => [vinculo, ...atual])}
          onFeedback={onFeedback}
        />
      )}

      <ConfirmDialog
        open={confirmandoAcao !== null}
        title={confirmandoAcao?.tipo === "publicar" ? "Publicar versão" : "Arquivar versão"}
        message={
          confirmandoAcao?.tipo === "publicar"
            ? `A versão ${confirmandoAcao.versao.numeroVersao} passa a ser usada para gerar desenhos deste produto. Depois de publicada, o conteúdo fica imutável (só pode ser arquivada).`
            : `A versão ${confirmandoAcao?.versao.numeroVersao} deixa de estar disponível. Se ela estiver publicada, o template volta a não ter versão ativa.`
        }
        confirmLabel={confirmandoAcao?.tipo === "publicar" ? "Publicar" : "Arquivar"}
        variant={confirmandoAcao?.tipo === "arquivar" ? "warning" : "default"}
        loading={executandoAcao}
        onConfirm={handleConfirmarAcao}
        onClose={() => setConfirmandoAcao(null)}
      />
    </Stack>
  );
}
