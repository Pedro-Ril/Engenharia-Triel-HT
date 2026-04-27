"use client";

import { useState, useRef } from "react";
import styles from "@/app/atualizacoes/page.module.css";

type Modulo =
  | "downloads"
  | "consulta-estrutura"
  | "liberacao-projeto"
  | "bi"
  | "sistema";

type Atualizacao = {
  data: string;
  versao: string;
  titulo: string;
  modulos: Modulo[];
  descricao: string;
  itens: {
    tipo: "melhoria" | "correcao" | "novo";
    texto: string;
  }[];
};

const MODULO_CONFIG = {
  downloads: {
    label: "Downloads",
    className: styles.moduloDownloads,
    dotClass: styles.dotDownloads,
  },
  "consulta-estrutura": {
    label: "Consulta Estrutura",
    className: styles.moduloAgro,
    dotClass: styles.dotAgro,
  },
  "liberacao-projeto": {
    label: "Liberação de Projeto",
    className: styles.moduloViaturas,
    dotClass: styles.dotViaturas,
  },
  bi: {
    label: "Dashboard BI",
    className: styles.moduloBI,
    dotClass: styles.dotBI,
  },
  sistema: {
    label: "Portal Engenharia",
    className: styles.moduloSistema,
    dotClass: styles.dotSistema,
  },
};

const LEGENDA: { key: Modulo; label: string }[] = [
  { key: "downloads", label: "Downloads" },
  { key: "consulta-estrutura", label: "Consulta Estrutura" },
  { key: "liberacao-projeto", label: "Liberação de Projeto" },
  { key: "bi", label: "Dashboard BI" },
  { key: "sistema", label: "Portal Engenharia" },
];

const ATUALIZACOES: Atualizacao[] = [
  {
  data: "27/04/2026",
  versao: "V1.1.5",
  titulo: "Reorganização do menu lateral",
  modulos: ["sistema", "downloads"],
  descricao:
    "Reorganizado o menu lateral do Portal da Engenharia para melhorar a navegação e separar os módulos principais dos acessos auxiliares.",
  itens: [
    {
      tipo: "melhoria",
      texto: "Reposicionados os atalhos de Downloads e Atualizações para a área inferior do menu lateral.",
    },
    {
      tipo: "melhoria",
      texto: "Separados os módulos principais dos acessos de apoio, deixando a navegação mais limpa e objetiva.",
    },
    {
      tipo: "melhoria",
      texto: "Mantido o padrão visual do menu com destaque para a rota ativa e comportamento responsivo.",
    },
  ],
},
  {
    data: "27/04/2026",
    versao: "V1.1.4",
    titulo: "Implementação da aba de Downloads",
    modulos: ["downloads"],
    descricao:
      "Implantada a nova área de downloads no Portal da Engenharia, permitindo acesso centralizado a arquivos, instaladores e utilitários.",
    itens: [
      {
        tipo: "novo",
        texto: "Criada a página de Downloads com exibição em formato de cards para organização dos arquivos.",
      },
      {
        tipo: "melhoria",
        texto: "Adicionado acesso ao módulo de Downloads no menu lateral do portal.",
      },
      {
        tipo: "melhoria",
        texto: "Padronização visual da página conforme o layout e identidade do portal.",
      },
    ],
  },
  {
    data: "18/03/2026",
    versao: "V1.1.3",
    titulo: "Ajuste no tempo de atualização da página",
    modulos: ["sistema"],
    descricao:
      "Ajustado o comportamento de atualização da página para proporcionar maior fluidez e melhor experiência ao usuário.",
    itens: [
      {
        tipo: "melhoria",
        texto: "Refinamento do tempo e da lógica de atualização automática da interface.",
      },
    ],
  },
  {
    data: "17/03/2026",
    versao: "V1.1.2",
    titulo: "Implementação de remoção de itens inválidos",
    modulos: ["consulta-estrutura"],
    descricao:
      "Incluída funcionalidade para identificação e remoção de itens inválidos na consulta de estrutura de produto.",
    itens: [
      {
        tipo: "novo",
        texto: "Adicionado botão para remoção de itens inválidos diretamente na interface.",
      },
      {
        tipo: "novo",
        texto: "Implementada lógica para tratamento e exclusão dos registros inválidos.",
      },
    ],
  },
  {
    data: "13/03/2026",
    versao: "V1.1.1",
    titulo: "Ajustes na exibição da árvore de estrutura",
    modulos: ["consulta-estrutura"],
    descricao:
      "Realizados ajustes na visualização da estrutura de produto para melhorar a leitura e organização hierárquica.",
    itens: [
      {
        tipo: "correcao",
        texto: "Correção na formatação da árvore, garantindo exibição adequada dos níveis estruturais.",
      },
    ],
  },
  {
    data: "12/03/2026",
    versao: "V1.1.0",
    titulo: "Criação do módulo de BI",
    modulos: ["bi"],
    descricao:
      "Implantação inicial da área de Business Intelligence no portal, permitindo visualização de dados e indicadores.",
    itens: [
      {
        tipo: "novo",
        texto: "Criada a página de Dashboard BI para acompanhamento de indicadores.",
      },
    ],
  },
  {
    data: "12/03/2026",
    versao: "V1.0.1",
    titulo: "Melhorias visuais e suporte ao dark mode",
    modulos: ["consulta-estrutura", "sistema"],
    descricao:
      "Aplicados ajustes visuais no portal, incluindo melhorias na leitura e adaptação ao modo escuro.",
    itens: [
      {
        tipo: "melhoria",
        texto: "Ajuste nas cores das fontes para melhor legibilidade no dark mode.",
      },
      {
        tipo: "melhoria",
        texto: "Aprimoramento da exibição da estrutura de produto.",
      },
    ],
  },
  {
    data: "12/03/2026",
    versao: "V1.0.0",
    titulo: "Preparação para ambiente de produção",
    modulos: ["sistema"],
    descricao:
      "Realizados ajustes e validações finais para disponibilização do portal em ambiente produtivo.",
    itens: [
      {
        tipo: "melhoria",
        texto: "Adequação de configurações e comportamentos para execução estável em produção.",
      },
    ],
  },
];

const TIPO_CONFIG = {
  novo: {
    label: "Novo",
    className: styles.badgeNovo,
  },
  melhoria: {
    label: "Melhoria",
    className: styles.badgeMelhoria,
  },
  correcao: {
    label: "Correção",
    className: styles.badgeCorrecao,
  },
};

export default function AtualizacoesPage() {
  const [selecionada, setSelecionada] = useState<Atualizacao | null>(null);
  const [ativo, setAtivo] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const scrollTo = (index: number) => {
    const el = itemRefs.current[index];
    if (!el) return;

    const start = window.scrollY;
    const target = el.getBoundingClientRect().top + window.scrollY - 120;
    const distance = target - start;
    const duration = 600;
    let startTime: number | null = null;

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      window.scrollTo(0, start + distance * easeInOutCubic(progress));

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setAtivo(index);
        setTimeout(() => setAtivo(null), 1400);
      }
    };

    requestAnimationFrame(step);
  };

  const renderModulos = (modulos: Modulo[]) =>
    modulos.map((m) => (
      <span
        key={m}
        className={`${styles.badgeModulo} ${MODULO_CONFIG[m].className}`}
      >
        {MODULO_CONFIG[m].label}
      </span>
    ));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerBadge} style={{ marginBottom: "12px" }}>
            Histórico
          </span>

          <h1 className={styles.headerTitle}>
            Atualizações do Portal da Engenharia
          </h1>

          <p className={styles.headerSubtitle}>
            Acompanhe as melhorias, correções e novidades lançadas no portal.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarList}>
            <p className={styles.sidebarLabel}>Versões</p>

            {ATUALIZACOES.map((item, index) => (
              <button
                key={`${item.versao}-${index}`}
                type="button"
                className={styles.sidebarItem}
                onClick={() => scrollTo(index)}
              >
                <div className={styles.sidebarItemLeft}>
                  <span className={styles.sidebarVersao}>{item.versao}</span>
                  <span className={styles.sidebarTitulo}>{item.titulo}</span>
                </div>

                <div className={styles.sidebarDots}>
                  {item.modulos.map((m) => (
                    <span
                      key={m}
                      className={`${styles.sidebarDot} ${MODULO_CONFIG[m].dotClass}`}
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className={styles.legenda}>
            <p className={styles.legendaLabel}>Módulos</p>

            {LEGENDA.map(({ key, label }) => (
              <div key={key} className={styles.legendaItem}>
                <span
                  className={`${styles.legendaDot} ${MODULO_CONFIG[key].dotClass}`}
                />
                <span className={styles.legendaTexto}>{label}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className={styles.container}>
          <div className={styles.timeline}>
            {ATUALIZACOES.map((item, index) => (
              <div
                key={`${item.versao}-${index}`}
                className={styles.timelineItem}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
              >
                <div className={styles.timelineSide}>
                  <div className={styles.timelineDot} />

                  {index < ATUALIZACOES.length - 1 && (
                    <div className={styles.timelineLine} />
                  )}
                </div>

                <button
                  type="button"
                  className={`${styles.card} ${
                    ativo === index ? styles.cardAtivo : ""
                  }`}
                  onClick={() => setSelecionada(item)}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.cardVersao}>{item.versao}</span>
                    <span className={styles.cardData}>{item.data}</span>
                  </div>

                  <div className={styles.cardModulos}>
                    {renderModulos(item.modulos)}
                  </div>

                  <h3 className={styles.cardTitulo}>{item.titulo}</h3>

                  <p className={styles.cardDesc}>{item.descricao}</p>

                  <div className={styles.cardBadges}>
                    {Array.from(new Set(item.itens.map((i) => i.tipo))).map(
                      (tipo) => (
                        <span
                          key={tipo}
                          className={`${styles.badge} ${TIPO_CONFIG[tipo].className}`}
                        >
                          {TIPO_CONFIG[tipo].label}
                        </span>
                      )
                    )}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selecionada && (
        <div className={styles.overlay} onClick={() => setSelecionada(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalMeta}>
                  <span className={styles.headerBadge}>
                    {selecionada.versao} · {selecionada.data}
                  </span>

                  {renderModulos(selecionada.modulos)}
                </div>

                <h2 className={styles.modalTitle}>{selecionada.titulo}</h2>

                <p className={styles.modalSubtitle}>
                  {selecionada.descricao}
                </p>
              </div>

              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setSelecionada(null)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <ul className={styles.itensList}>
                {selecionada.itens.map((item, i) => (
                  <li key={i} className={styles.itemRow}>
                    <span
                      className={`${styles.badge} ${TIPO_CONFIG[item.tipo].className}`}
                    >
                      {TIPO_CONFIG[item.tipo].label}
                    </span>

                    <span className={styles.itemTexto}>{item.texto}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setSelecionada(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}