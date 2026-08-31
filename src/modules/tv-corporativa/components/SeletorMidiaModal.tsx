"use client";

import { useState } from "react";
import { Eye, FileText, Images } from "lucide-react";

import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import type { MidiaTv, TipoMidiaTv } from "../types/tvCorporativa.types";
import styles from "./SeletorMidiaModal.module.css";

interface SeletorMidiaModalProps {
  open: boolean;
  tipo: TipoMidiaTv;
  midias: MidiaTv[];
  onClose: () => void;
  onSelecionar: (midiaId: string) => void;
}

/*
 * Biblioteca de mídia navegável pra escolher o item de uma playlist —
 * substitui o dropdown de texto puro por uma grade de miniaturas.
 * Clicar numa miniatura já seleciona na hora (fecha o modal) — o
 * preview é uma ação separada e opcional (ícone de olho em cada
 * miniatura), não um passo obrigatório antes de escolher.
 */
export function SeletorMidiaModal({
  open,
  tipo,
  midias,
  onClose,
  onSelecionar,
}: SeletorMidiaModalProps) {
  const [pastaFiltro, setPastaFiltro] = useState("");
  const [midiaEmPreview, setMidiaEmPreview] = useState<MidiaTv | null>(null);

  function fechar() {
    setPastaFiltro("");
    setMidiaEmPreview(null);
    onClose();
  }

  function selecionar(midiaId: string) {
    setPastaFiltro("");
    setMidiaEmPreview(null);
    onSelecionar(midiaId);
  }

  const midiasDoTipo = midias.filter((midia) => midia.tipo === tipo);
  const pastas = Array.from(
    new Set(midiasDoTipo.map((midia) => midia.pastaNome).filter((nome): nome is string => !!nome))
  );
  const midiasFiltradas = pastaFiltro
    ? midiasDoTipo.filter((midia) => midia.pastaNome === pastaFiltro)
    : midiasDoTipo;

  return (
    <Modal open={open} onClose={fechar} title="Escolher mídia" size="large">
      <Stack gap={16}>
        {pastas.length > 0 && (
          <div className={styles.filtroPasta}>
            <Dropdown
              value={pastaFiltro}
              options={[
                { value: "", label: "Todas as pastas" },
                ...pastas.map((pasta) => ({ value: pasta, label: pasta })),
              ]}
              onValueChange={setPastaFiltro}
            />
          </div>
        )}

        {midiasFiltradas.length === 0 ? (
          <EmptyState
            icon={<Images size={26} />}
            title="Nenhuma mídia encontrada"
            description="Envie arquivos desse tipo na aba Mídias primeiro."
          />
        ) : (
          <div className={styles.grade}>
            {midiasFiltradas.map((midia) => (
              <div key={midia.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.itemThumbBotao}
                  onClick={() => selecionar(midia.id)}
                >
                  <div className={styles.itemThumb}>
                    {tipo === "foto" && (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura de mídia vinda de disco
                      <img src={`/api/tv/midias/${midia.id}/arquivo`} alt="" />
                    )}
                    {tipo === "video" && (
                      <video src={`/api/tv/midias/${midia.id}/arquivo`} muted preload="metadata" />
                    )}
                    {tipo === "documento" && <FileText size={28} />}
                  </div>
                </button>
                <IconButton
                  icon={<Eye size={13} />}
                  label="Visualizar"
                  size="small"
                  variant="neutral"
                  className={styles.itemBotaoPreview}
                  onClick={() => setMidiaEmPreview(midia)}
                />
                <span className={styles.itemNome}>{midia.nomeOriginal}</span>
              </div>
            ))}
          </div>
        )}
      </Stack>

      <Modal
        open={midiaEmPreview !== null}
        onClose={() => setMidiaEmPreview(null)}
        title={midiaEmPreview?.nomeOriginal ?? "Pré-visualização"}
      >
        {midiaEmPreview && (
          <div className={styles.previewGrande}>
            {tipo === "foto" && (
              // eslint-disable-next-line @next/next/no-img-element -- preview de mídia vinda de disco
              <img
                src={`/api/tv/midias/${midiaEmPreview.id}/arquivo`}
                alt=""
                style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8 }}
              />
            )}
            {tipo === "video" && (
              <video
                src={`/api/tv/midias/${midiaEmPreview.id}/arquivo`}
                controls
                autoPlay
                style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8 }}
              />
            )}
            {tipo === "documento" && (
              <iframe
                src={`/api/tv/midias/${midiaEmPreview.id}/arquivo`}
                title="Documento"
                style={{ width: "100%", height: 260, border: "none", borderRadius: 8 }}
              />
            )}
          </div>
        )}
      </Modal>
    </Modal>
  );
}
