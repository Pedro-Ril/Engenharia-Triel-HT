"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";

import type { EvidenciaEquipamento } from "../types/estoque.types";
import styles from "./EvidenciasGaleria.module.css";

interface EvidenciasGaleriaProps {
  evidencias: EvidenciaEquipamento[];
  onExcluir?: (id: string) => void;
  excluindo?: string | null;
}

function ehImagem(tipoMime: string): boolean {
  return tipoMime.startsWith("image/");
}

type TipoDocumento = "pdf" | "word" | "excel" | "outro";

function tipoDocumentoDoMime(tipoMime: string): TipoDocumento {
  if (tipoMime === "application/pdf") return "pdf";
  if (tipoMime === "application/msword" || tipoMime.includes("wordprocessingml")) return "word";
  if (tipoMime === "application/vnd.ms-excel" || tipoMime.includes("spreadsheetml")) return "excel";
  return "outro";
}

function extensaoArquivo(nomeArquivo: string): string {
  const partes = nomeArquivo.split(".");
  return partes.length > 1 ? partes[partes.length - 1].toUpperCase() : "ARQ";
}

const CLASSE_POR_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  pdf: styles.docPdf,
  word: styles.docWord,
  excel: styles.docExcel,
  outro: styles.docOutro,
};

export function EvidenciasGaleria({ evidencias, onExcluir, excluindo }: EvidenciasGaleriaProps) {
  const [ampliada, setAmpliada] = useState<EvidenciaEquipamento | null>(null);

  if (evidencias.length === 0) {
    return <p className={styles.vazio}>Nenhuma evidência anexada neste bloco.</p>;
  }

  return (
    <>
      <div className={styles.grid}>
        {evidencias.map((evidencia) => (
          <div key={evidencia.id} className={styles.item}>
            {ehImagem(evidencia.tipoMime) ? (
              <button
                type="button"
                className={styles.thumbButton}
                onClick={() => setAmpliada(evidencia)}
              >
                <img
                  className={styles.thumb}
                  src={`/api/estoque-equipamentos-usados/evidencias/${evidencia.id}`}
                  alt={evidencia.nomeArquivo}
                />
              </button>
            ) : (
              <a
                className={`${styles.thumbButton} ${styles.documentoTile}`}
                href={`/api/estoque-equipamentos-usados/evidencias/${evidencia.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title={evidencia.nomeArquivo}
              >
                <FileText
                  size={24}
                  className={CLASSE_POR_TIPO_DOCUMENTO[tipoDocumentoDoMime(evidencia.tipoMime)]}
                  aria-hidden="true"
                />
                <span
                  className={`${styles.documentoExtensao} ${CLASSE_POR_TIPO_DOCUMENTO[tipoDocumentoDoMime(evidencia.tipoMime)]}`}
                >
                  {extensaoArquivo(evidencia.nomeArquivo)}
                </span>
                <span className={styles.documentoNome}>{evidencia.nomeArquivo}</span>
              </a>
            )}

            {onExcluir && (
              <IconButton
                className={styles.excluirBotao}
                size="small"
                variant="danger"
                icon={<Trash2 size={13} />}
                label="Excluir evidência"
                onClick={() => onExcluir(evidencia.id)}
                disabled={excluindo === evidencia.id}
              />
            )}
          </div>
        ))}
      </div>

      <Modal
        open={ampliada !== null}
        title={ampliada?.nomeArquivo ?? ""}
        size="large"
        onClose={() => setAmpliada(null)}
      >
        {ampliada && (
          <img
            className={styles.imagemAmpliada}
            src={`/api/estoque-equipamentos-usados/evidencias/${ampliada.id}`}
            alt={ampliada.nomeArquivo}
          />
        )}
      </Modal>
    </>
  );
}
