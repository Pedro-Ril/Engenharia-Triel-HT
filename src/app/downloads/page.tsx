import styles from "./downloads.module.css";

const arquivos = [
    {
        nome: "SKA Connector",
        descricao: "Instalador e atualizador do integrador SKA para SolidWorks.",
        arquivo: "/downloads/atualizador-ska-connector.zip",
        tag: "Instalador",
    },
];

export default function DownloadsPage() {
    return (
        <div className={styles.page}>
            {/* HERO */}
            <div className={styles.hero}>
                <div className={styles.heroContent}>
                    <span className={styles.badge}>Portal Engenharia</span>

                    <h1 className={styles.title}>Central de Downloads</h1>

                    <p className={styles.description}>
                        Acesse instaladores, documentos e arquivos úteis utilizados no dia a dia da engenharia.
                    </p>
                </div>

                <div className={styles.heroPanel}>
                    <div className={styles.panelCard}>
                        <h3 className={styles.panelTitle}>Arquivos disponíveis</h3>
                        <p className={styles.panelText}>
                            Mantenha sempre os arquivos atualizados diretamente pelo portal.
                        </p>
                    </div>
                </div>
            </div>

            {/* SECTION */}
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <div>
                        <span className={styles.sectionMiniTitle}>Downloads</span>
                        <h2 className={styles.sectionTitle}>Arquivos disponíveis</h2>
                    </div>
                </div>

                <div className={styles.cardsGrid}>
                    {arquivos.map((item) => (
                        <div key={item.nome} className={styles.moduleCard}>

                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>{item.nome}</h3>
                                <span className={styles.cardTag}>{item.tag}</span>
                            </div>

                            <p className={styles.cardDescription}>
                                {item.descricao}
                            </p>

                            <div className={styles.cardFooter}>
                                <a
                                    href={item.arquivo}
                                    download
                                    className={styles.primaryButton}
                                >
                                    Baixar arquivo
                                </a>
                            </div>

                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}