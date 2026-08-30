"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Folder, FolderPlus, Image as ImageIcon, Trash2, Upload, Video } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
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

import {
  criarPastaMidia,
  enviarMidia,
  excluirMidia,
  excluirPastaMidia,
  listarMidias,
  listarPastasMidia,
  moverMidiaParaPasta,
} from "../services/tvCorporativa.service";
import type { MidiaTv, PastaMidia } from "../types/tvCorporativa.types";

interface MidiasTvPainelProps {
  onFeedback: FeedbackHandler;
}

const ICONE_TIPO: Record<MidiaTv["tipo"], typeof Video> = {
  video: Video,
  foto: ImageIcon,
  documento: FileText,
};

const OPCOES_TIPO = [
  { value: "video", label: "Vídeo" },
  { value: "foto", label: "Foto" },
  { value: "documento", label: "Documento" },
];

const VALOR_SEM_PASTA = "__sem_pasta__";
const VALOR_TODAS_PASTAS = "__todas__";

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MidiasTvPainel({ onFeedback }: MidiasTvPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [midias, setMidias] = useState<MidiaTv[]>([]);
  const [pastas, setPastas] = useState<PastaMidia[]>([]);
  const [tipoSelecionado, setTipoSelecionado] = useState<MidiaTv["tipo"]>("foto");
  const [pastaUpload, setPastaUpload] = useState("");
  const [filtroPasta, setFiltroPasta] = useState(VALOR_TODAS_PASTAS);
  const [enviando, setEnviando] = useState(false);
  const [midiaParaExcluir, setMidiaParaExcluir] = useState<MidiaTv | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [movendoId, setMovendoId] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const [pastasAberto, setPastasAberto] = useState(false);
  const [nomeNovaPasta, setNomeNovaPasta] = useState("");
  const [criandoPasta, setCriandoPasta] = useState(false);
  const [excluindoPastaId, setExcluindoPastaId] = useState<string | null>(null);

  async function carregar() {
    const [listaMidias, listaPastas] = await Promise.all([listarMidias(), listarPastasMidia()]);
    setMidias(listaMidias);
    setPastas(listaPastas);
  }

  useEffect(() => {
    let cancelado = false;

    async function inicial() {
      setCarregando(true);
      await carregar();
      if (!cancelado) setCarregando(false);
    }

    inicial();

    return () => {
      cancelado = true;
    };
  }, []);

  async function handleArquivoSelecionado(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo) return;

    setEnviando(true);

    try {
      const resultado = await enviarMidia(arquivo, tipoSelecionado, pastaUpload || null);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Mídia enviada" : "Não foi possível enviar",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) await carregar();
    } finally {
      setEnviando(false);
    }
  }

  async function handleExcluir() {
    if (!midiaParaExcluir) return;
    setExcluindo(true);

    try {
      const resultado = await excluirMidia(midiaParaExcluir.id);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Mídia excluída" : "Não foi possível excluir",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) await carregar();
    } finally {
      setExcluindo(false);
      setMidiaParaExcluir(null);
    }
  }

  async function handleMoverMidia(midia: MidiaTv, valor: string) {
    setMovendoId(midia.id);

    try {
      const resultado = await moverMidiaParaPasta(midia.id, valor === VALOR_SEM_PASTA ? null : valor);

      if (resultado.ok) {
        await carregar();
      } else {
        onFeedback(
          "danger",
          "Não foi possível mover a mídia",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setMovendoId(null);
    }
  }

  async function handleCriarPasta() {
    setCriandoPasta(true);

    try {
      const resultado = await criarPastaMidia(nomeNovaPasta.trim());

      if (resultado.ok) {
        onFeedback("success", "Pasta criada", resultado.message ?? "Pasta criada.");
        setNomeNovaPasta("");
        await carregar();
      } else {
        onFeedback(
          "danger",
          "Não foi possível criar a pasta",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setCriandoPasta(false);
    }
  }

  async function handleExcluirPasta(pasta: PastaMidia) {
    setExcluindoPastaId(pasta.id);

    try {
      const resultado = await excluirPastaMidia(pasta.id);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Pasta excluída" : "Não foi possível excluir",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) {
        if (filtroPasta === pasta.id) setFiltroPasta(VALOR_TODAS_PASTAS);
        await carregar();
      }
    } finally {
      setExcluindoPastaId(null);
    }
  }

  if (carregando) {
    return <Loader label="Carregando mídias..." />;
  }

  const opcoesPastaComSemPasta = [
    { value: VALOR_SEM_PASTA, label: "Sem pasta" },
    ...pastas.map((pasta) => ({ value: pasta.id, label: pasta.nome })),
  ];

  const opcoesFiltroPasta = [
    { value: VALOR_TODAS_PASTAS, label: "Todas as pastas" },
    ...opcoesPastaComSemPasta,
  ];

  const midiasFiltradas =
    filtroPasta === VALOR_TODAS_PASTAS
      ? midias
      : midias.filter((midia) =>
          filtroPasta === VALOR_SEM_PASTA ? !midia.pastaId : midia.pastaId === filtroPasta
        );

  return (
    <Card
      title="Mídias"
      description="Vídeos, fotos e documentos disponíveis pra usar na grade de programação."
      actions={
        <Stack direction="row" gap={8} align="center">
          <div style={{ width: 160 }}>
            <Dropdown
              value={filtroPasta}
              options={opcoesFiltroPasta}
              onValueChange={setFiltroPasta}
            />
          </div>
          <Button variant="secondary" onClick={() => setPastasAberto(true)}>
            <FolderPlus size={15} />
            Pastas
          </Button>
          <div style={{ width: 140 }}>
            <Dropdown
              value={tipoSelecionado}
              options={OPCOES_TIPO}
              onValueChange={(valor) => setTipoSelecionado(valor as MidiaTv["tipo"])}
            />
          </div>
          <div style={{ width: 160 }}>
            <Dropdown
              value={pastaUpload}
              placeholder="Sem pasta"
              options={opcoesPastaComSemPasta.filter((opcao) => opcao.value !== VALOR_SEM_PASTA)}
              onValueChange={setPastaUpload}
            />
          </div>
          <Button onClick={() => inputArquivoRef.current?.click()} loading={enviando}>
            <Upload size={15} />
            Enviar arquivo
          </Button>
          <input
            ref={inputArquivoRef}
            type="file"
            hidden
            onChange={handleArquivoSelecionado}
          />
        </Stack>
      }
    >
      {midiasFiltradas.length === 0 ? (
        <EmptyState
          icon={<Upload size={26} />}
          title={midias.length === 0 ? "Nenhuma mídia enviada ainda" : "Nenhuma mídia nessa pasta"}
          description="Escolha o tipo e a pasta ao lado e envie um arquivo pra começar a montar a grade de programação."
        />
      ) : (
        <Table minWidth={800}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Nome</TableHeaderCell>
              <TableHeaderCell align="center">Tipo</TableHeaderCell>
              <TableHeaderCell>Pasta</TableHeaderCell>
              <TableHeaderCell align="center">Tamanho</TableHeaderCell>
              <TableHeaderCell align="center">Em uso</TableHeaderCell>
              <TableHeaderCell align="center">Ações</TableHeaderCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {midiasFiltradas.map((midia) => {
              const Icon = ICONE_TIPO[midia.tipo];

              return (
                <TableRow key={midia.id}>
                  <TableCell>
                    <Stack direction="row" gap={8} align="center">
                      <Icon size={16} />
                      {midia.nomeOriginal}
                    </Stack>
                  </TableCell>
                  <TableCell align="center">{midia.tipo}</TableCell>
                  <TableCell>
                    <Dropdown
                      value={midia.pastaId ?? VALOR_SEM_PASTA}
                      options={opcoesPastaComSemPasta}
                      onValueChange={(valor) => handleMoverMidia(midia, valor)}
                      disabled={movendoId === midia.id}
                    />
                  </TableCell>
                  <TableCell align="center">{formatarTamanho(midia.tamanhoBytes)}</TableCell>
                  <TableCell align="center">
                    <Badge variant={midia.emUso > 0 ? "info" : "neutral"}>
                      {midia.emUso} {midia.emUso === 1 ? "item" : "itens"}
                    </Badge>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      icon={<Trash2 size={15} />}
                      label="Excluir mídia"
                      size="small"
                      variant="danger"
                      onClick={() => setMidiaParaExcluir(midia)}
                      disabled={midia.emUso > 0}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={midiaParaExcluir !== null}
        title="Excluir mídia?"
        message={`O arquivo "${midiaParaExcluir?.nomeOriginal}" será apagado permanentemente do disco. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onClose={() => setMidiaParaExcluir(null)}
        onConfirm={handleExcluir}
      />

      <Modal
        open={pastasAberto}
        onClose={() => setPastasAberto(false)}
        title="Pastas de mídia"
        description="Organize os arquivos em pastas — não afeta a grade de programação, só a lista aqui."
      >
        <Stack gap={16}>
          <Stack direction="row" gap={8} align="end">
            <div style={{ flex: 1 }}>
              <Field label="Nova pasta" htmlFor="tv-nova-pasta-midia">
                <Input
                  id="tv-nova-pasta-midia"
                  value={nomeNovaPasta}
                  onChange={(event) => setNomeNovaPasta(event.target.value)}
                  placeholder="Ex: Recepção, Promoções"
                />
              </Field>
            </div>
            <Button onClick={handleCriarPasta} loading={criandoPasta} disabled={!nomeNovaPasta.trim()}>
              Criar
            </Button>
          </Stack>

          {pastas.length === 0 ? (
            <EmptyState
              icon={<Folder size={24} />}
              title="Nenhuma pasta criada ainda"
              description="Crie uma pasta acima pra organizar as mídias enviadas."
            />
          ) : (
            <Stack gap={8}>
              {pastas.map((pasta) => (
                <Stack key={pasta.id} direction="row" justify="between" align="center" gap={8}>
                  <Stack direction="row" gap={8} align="center">
                    <Folder size={15} />
                    <span>{pasta.nome}</span>
                    <Badge variant="neutral">
                      {pasta.totalMidias} {pasta.totalMidias === 1 ? "mídia" : "mídias"}
                    </Badge>
                  </Stack>
                  <IconButton
                    icon={<Trash2 size={15} />}
                    label={`Excluir pasta ${pasta.nome}`}
                    size="small"
                    variant="danger"
                    disabled={pasta.totalMidias > 0 || excluindoPastaId === pasta.id}
                    onClick={() => handleExcluirPasta(pasta)}
                  />
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </Modal>
    </Card>
  );
}
