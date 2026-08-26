"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import type { DownloadPublico } from "../types/downloads.types";
import styles from "@/app/downloads/downloads.module.css";

interface DownloadsPageClientProps {
  downloads: DownloadPublico[];
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadsPageClient({ downloads }: DownloadsPageClientProps) {
  const [selecionado, setSelecionado] = useState<DownloadPublico | null>(null);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>Portal Grupo Triel-HT</span>

          <h1 className={styles.title}>Central de Downloads</h1>

          <p className={styles.description}>
            Acesse instaladores, documentos e utilitários utilizados no dia a dia
            da engenharia. Clique em um card para visualizar as instruções de
            instalação, funcionamento e boas práticas antes do download.
          </p>
        </div>

        <div className={styles.heroPanel}>
          <div className={styles.panelCard}>
            <h3 className={styles.panelTitle}>Arquivos disponíveis</h3>
            <p className={styles.panelText}>
              Os downloads possuem orientações detalhadas para instalação e uso,
              garantindo mais segurança e padronização no ambiente.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionMiniTitle}>Downloads</span>
            <h2 className={styles.sectionTitle}>Arquivos disponíveis</h2>
            <p className={styles.sectionText}>
              Clique no card para consultar as informações do pacote ou utilize o
              botão para baixar diretamente.
            </p>
          </div>
        </div>

        {downloads.length === 0 ? (
          <div className={styles.emptyState}>
            <Download size={32} />
            <p>Nenhum download disponível no momento.</p>
          </div>
        ) : (
          <div className={styles.cardsGrid}>
            {downloads.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.moduleCard}
                onClick={() => setSelecionado(item)}
              >
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{item.nome}</h3>
                  {item.tag && <span className={styles.cardTag}>{item.tag}</span>}
                </div>

                <p className={styles.cardDescription}>{item.descricao}</p>

                <div className={styles.cardFooter}>
                  <a
                    href={`/api/downloads/${item.id}/arquivo`}
                    className={styles.primaryButton}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Baixar arquivo ({formatarTamanho(item.tamanhoBytes)})
                  </a>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selecionado && (
        <div className={styles.overlay} onClick={() => setSelecionado(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalMeta}>
                  {selecionado.tag && (
                    <span className={styles.headerBadge}>{selecionado.tag}</span>
                  )}
                </div>

                <h2 className={styles.modalTitle}>{selecionado.nome}</h2>

                <p className={styles.modalSubtitle}>{selecionado.descricao}</p>
              </div>

              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setSelecionado(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              {selecionado.instrucoes.length > 0 && (
                <div className={styles.infoCard}>
                  <h3 className={styles.infoTitle}>Instalação</h3>

                  {selecionado.instrucoes.map((texto, index) => (
                    <p key={index}>{texto}</p>
                  ))}
                </div>
              )}

              {selecionado.funcionamento.length > 0 && (
                <div className={styles.infoCard}>
                  <h3 className={styles.infoTitle}>Funcionamento</h3>

                  {selecionado.funcionamento.map((texto, index) => (
                    <p key={index}>{texto}</p>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setSelecionado(null)}
              >
                Fechar
              </button>

              <a
                href={`/api/downloads/${selecionado.id}/arquivo`}
                className={styles.primaryButton}
              >
                Baixar arquivo
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
