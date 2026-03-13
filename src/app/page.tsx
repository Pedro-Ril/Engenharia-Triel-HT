import AppLink from "@/components/AppLink";
import styles from "./home.module.css";

const atalhos = [
  {
    titulo: "Liberação de Projeto",
    descricao:
      "Realize o envio automatizado das liberações de projeto com preenchimento estruturado das informações principais.",
    href: "/liberacao-projeto",
    tag: "Fluxo ativo",
  },
  {
    titulo: "Consulta Estrutura",
    descricao:
      "Consulte estruturas técnicas e prepare a base para análises, integrações e validações de engenharia.",
    href: "/consulta-estrutura",
    tag: "Fluxo ativo",
  },
  
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>Plataforma Engenharia Triel-HT</span>

          <h1 className={styles.title}>
            Bem-vindo ao portal de ferramentas da Engenharia
          </h1>

          <p className={styles.description}>
            Este ambiente foi estruturado para concentrar funcionalidades
            internas da engenharia em uma interface mais moderna, organizada e
            preparada para expansão. A proposta é reduzir etapas operacionais,
            facilitar rotinas do setor e centralizar acessos importantes em um
            único lugar.
          </p>

          <div className={styles.heroActions}>
            <AppLink href="/liberacao-projeto" className={styles.primaryButton}>
              Acessar Liberação de Projeto
            </AppLink>

            <AppLink href="/consulta-estrutura" className={styles.secondaryButton}>
              Ir para Consulta Estrutura
            </AppLink>
          </div>
        </div>

        <aside className={styles.heroPanel}>
          <div className={styles.panelCard}>
            <h2 className={styles.panelTitle}>Mensagem de boas-vindas</h2>
            <p className={styles.panelText}>
              Bem-vindo ao ambiente da Engenharia Triel-HT. Utilize o menu
              lateral para navegar entre os módulos disponíveis e acompanhe a
              evolução desta plataforma, que servirá como base para novas
              integrações e automações internas.
            </p>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Módulos disponíveis</span>
              <strong className={styles.statValue}>03</strong>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Status da plataforma</span>
              <strong className={`${styles.statValue} ${styles.statOperacional}`}>
                Operacional
              </strong>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionMiniTitle}>Acessos rápidos</span>
            <h2 className={styles.sectionTitle}>Módulos principais</h2>
          </div>

          

        </div>

        <div className={styles.cardsGrid}>
          {atalhos.map((item) => (
            <AppLink key={item.href} href={item.href} className={styles.moduleCard}>
              <div className={styles.cardTop}>
                <span className={styles.cardTag}>{item.tag}</span>
              </div>

              <h3 className={styles.cardTitle}>{item.titulo}</h3>
              <p className={styles.cardDescription}>{item.descricao}</p>

              <div className={styles.cardFooter}>
                <span className={styles.cardLink}>Abrir módulo</span>
              </div>
            </AppLink>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <h3 className={styles.infoTitle}>Objetivo da ferramenta</h3>
            <p className={styles.infoText}>
              Padronizar acessos, melhorar a experiência de uso e servir como
              base para futuras rotinas da engenharia, como consultas técnicas,
              integrações com ERP, estruturas, DXF e automações operacionais.
            </p>
          </div>

          <div className={styles.infoCard}>
            <h3 className={styles.infoTitle}>Estrutura em crescimento</h3>
            <p className={styles.infoText}>
              O sistema foi iniciado com os módulos de Liberação de Projeto e
              Consulta Estrutura, mas já está preparado para receber novas telas
              e evoluir para um hub completo da área.
            </p>
          </div>

          <div className={styles.infoCard}>
            <h3 className={styles.infoTitle}>Navegação simplificada</h3>
            <p className={styles.infoText}>
              O menu lateral foi pensado para facilitar o acesso rápido aos
              módulos. A home funciona como ponto central da plataforma e resumo
              inicial do ambiente.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}