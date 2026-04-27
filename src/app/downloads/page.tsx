"use client";

import { useState } from "react";
import styles from "./downloads.module.css";

type ArquivoDownload = {
    nome: string;
    descricao: string;
    arquivo: string;
    tag: string;
    instrucoes: string[];
    funcionamento: string[];
};

const arquivos: ArquivoDownload[] = [
    {
        nome: "SKA Connector (Integrador)",
        descricao: "Instalador e atualizador do integrador SKA para SolidWorks.",
        arquivo: "/downloads/atualizador-ska-connector.zip",
        tag: "Instalador",
        instrucoes: [
            "Baixe o arquivo compactado utilizando o botão “Baixar arquivo”.",
            "Extraia o conteúdo do arquivo ZIP em uma pasta local do computador.",
            "Para atualização do connector, execute o arquivo “atualizador-ska-connector.bat”.",
            "Para instalação do zero, execute o arquivo “atualizador-ska-connector.bat” como administrador.",
        ],
        funcionamento: [
            "O pacote mantém os arquivos do SKA Connector atualizados na estação do usuário.",
            "A atualização substitui os arquivos necessários do integrador local.",
            "Após a instalação, o SolidWorks poderá utilizar o conector atualizado conforme configuração do ambiente.",
        ],
    }
];

export default function DownloadsPage() {
    const [selecionado, setSelecionado] = useState<ArquivoDownload | null>(null);

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div className={styles.heroContent}>
                    <span className={styles.badge}>Portal Engenharia</span>

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

                <div className={styles.cardsGrid}>
                    {arquivos.map((item) => (
                        <button
                            key={item.nome}
                            type="button"
                            className={styles.moduleCard}
                            onClick={() => setSelecionado(item)}
                        >
                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>{item.nome}</h3>
                                <span className={styles.cardTag}>{item.tag}</span>
                            </div>

                            <p className={styles.cardDescription}>{item.descricao}</p>


                            <div className={styles.cardFooter}>
                                <a
                                    href={item.arquivo}
                                    download
                                    className={styles.primaryButton}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    Baixar arquivo
                                </a>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {selecionado && (
                <div className={styles.overlay} onClick={() => setSelecionado(null)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <div className={styles.modalMeta}>
                                    <span className={styles.headerBadge}>{selecionado.tag}</span>
                                </div>

                                <h2 className={styles.modalTitle}>{selecionado.nome}</h2>

                                <p className={styles.modalSubtitle}>
                                    {selecionado.descricao}
                                </p>
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
                            <div className={styles.infoCard}>
                                <h3 className={styles.infoTitle}>Instalação</h3>

                                {selecionado.instrucoes.map((texto, index) => (
                                    <p key={index}>{texto}</p>
                                ))}
                            </div>

                            <div className={styles.infoCard}>
                                <h3 className={styles.infoTitle}>Funcionamento</h3>

                                {selecionado.funcionamento.map((texto, index) => (
                                    <p key={index}>{texto}</p>
                                ))}
                            </div>
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
                                href={selecionado.arquivo}
                                download
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