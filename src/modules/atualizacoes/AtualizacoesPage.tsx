"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import styles from "@/app/atualizacoes/page.module.css";
import { getEstiloCorTag } from "@/lib/atualizacoes/cores-tag";
import type {
  Atualizacao,
  AtualizacaoTag,
  TipoAtualizacaoItem,
} from "@/lib/atualizacoes/atualizacoes";

interface AtualizacoesPageProps {
  atualizacoes: Atualizacao[];
}

/*
 * `publicadoEm` vem do SQL Server sem timezone (hora local do
 * servidor) — igual ao resto do app, não leva "Z" aqui (ver
 * formatarData em MinhaContaPage.tsx e o comentário em
 * formatarTempoRelativo de HomeContent.tsx).
 */
function formatarDataHora(publicadoEm: string): string {
  return new Date(publicadoEm).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const TIPO_CONFIG = {
  novo: {
    label: "Novo",
    className: styles.badgeNovo,
    bg: "rgba(15, 118, 110, 0.1)",
    texto: "#0f766e",
  },
  melhoria: {
    label: "Melhoria",
    className: styles.badgeMelhoria,
    bg: "var(--tag-red-bg)",
    texto: "var(--tag-red-text)",
  },
  correcao: {
    label: "Correção",
    className: styles.badgeCorrecao,
    bg: "rgba(146, 64, 14, 0.1)",
    texto: "#92400e",
  },
};

function TagChip({ tag }: { tag: AtualizacaoTag }) {
  const estilo = getEstiloCorTag(tag.cor);

  return (
    <span
      className={styles.badgeModulo}
      style={{ background: estilo.bg, color: estilo.texto, borderColor: estilo.borda }}
    >
      {tag.nome}
    </span>
  );
}

function TagDot({ tag }: { tag: AtualizacaoTag }) {
  const estilo = getEstiloCorTag(tag.cor);

  return (
    <span
      className={styles.sidebarDot}
      style={{ background: estilo.dot }}
      title={tag.nome}
    />
  );
}

export default function AtualizacoesPage({
  atualizacoes,
}: AtualizacoesPageProps) {
  const [selecionada, setSelecionada] = useState<Atualizacao | null>(null);
  const [ativo, setAtivo] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [tagsSelecionadas, setTagsSelecionadas] = useState<Set<string>>(
    new Set()
  );
  const [tiposSelecionados, setTiposSelecionados] = useState<
    Set<TipoAtualizacaoItem>
  >(new Set());

  const legenda = useMemo(() => {
    const mapa = new Map<string, AtualizacaoTag>();
    for (const atualizacao of atualizacoes) {
      for (const tag of atualizacao.tags) {
        mapa.set(tag.id, tag);
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.ordem - b.ordem);
  }, [atualizacoes]);

  /*
   * A lista de opções (legenda de módulos, pills de tipo) usa
   * sempre `atualizacoes` (sem filtro) — só o que é exibido na
   * timeline/sidebar usa a versão filtrada. Assim o usuário
   * sempre consegue trocar ou limpar os filtros, mesmo depois de
   * já ter reduzido o resultado a zero itens.
   */
  const atualizacoesFiltradas = useMemo(() => {
    if (tagsSelecionadas.size === 0 && tiposSelecionados.size === 0) {
      return atualizacoes;
    }

    return atualizacoes.filter((item) => {
      const passaTag =
        tagsSelecionadas.size === 0 ||
        item.tags.some((tag) => tagsSelecionadas.has(tag.id));

      const passaTipo =
        tiposSelecionados.size === 0 ||
        item.itens.some((i) => tiposSelecionados.has(i.tipo));

      return passaTag && passaTipo;
    });
  }, [atualizacoes, tagsSelecionadas, tiposSelecionados]);

  const filtrosAtivos = tagsSelecionadas.size > 0 || tiposSelecionados.size > 0;

  function alternarTag(id: string) {
    setTagsSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) {
        novo.delete(id);
      } else {
        novo.add(id);
      }
      return novo;
    });
  }

  function alternarTipo(tipo: TipoAtualizacaoItem) {
    setTiposSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(tipo)) {
        novo.delete(tipo);
      } else {
        novo.add(tipo);
      }
      return novo;
    });
  }

  function limparFiltros() {
    setTagsSelecionadas(new Set());
    setTiposSelecionados(new Set());
  }

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

  if (atualizacoes.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerInner}>
            <span className={styles.headerBadge}>Histórico</span>
            <h1 className={styles.headerTitle}>Atualizações do Portal</h1>
            <p className={styles.headerSubtitle}>
              Ainda não há nenhuma atualização publicada.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.headerBadge} style={{ marginBottom: "12px" }}>
            Histórico
          </span>

          <h1 className={styles.headerTitle}>
            Atualizações do Portal Grupo Triel-HT
          </h1>

          <p className={styles.headerSubtitle}>
            Acompanhe as melhorias, correções e novidades lançadas no portal.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          {(legenda.length > 0 || filtrosAtivos) && (
            <div className={styles.legenda}>
              <div className={styles.filtroHeader}>
                <p className={styles.legendaLabel}>Filtrar por módulo</p>

                {filtrosAtivos && (
                  <button
                    type="button"
                    className={styles.limparFiltros}
                    onClick={limparFiltros}
                  >
                    <X size={12} />
                    Limpar filtros
                  </button>
                )}
              </div>

              <div className={styles.filtroChips}>
                {legenda.map((tag) => {
                  const estilo = getEstiloCorTag(tag.cor);
                  const ativo = tagsSelecionadas.has(tag.id);

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={ativo}
                      className={styles.filtroChip}
                      style={
                        ativo
                          ? {
                              background: estilo.bg,
                              color: estilo.texto,
                              borderColor: estilo.borda,
                            }
                          : undefined
                      }
                      onClick={() => alternarTag(tag.id)}
                    >
                      <TagDot tag={tag} />
                      {tag.nome}
                    </button>
                  );
                })}
              </div>

              <p className={styles.legendaLabel} style={{ marginTop: "10px" }}>
                Filtrar por tipo
              </p>

              <div className={styles.filtroChips}>
                {(["novo", "melhoria", "correcao"] as TipoAtualizacaoItem[]).map(
                  (tipo) => {
                    const ativo = tiposSelecionados.has(tipo);
                    const config = TIPO_CONFIG[tipo];

                    return (
                      <button
                        key={tipo}
                        type="button"
                        aria-pressed={ativo}
                        className={styles.filtroChip}
                        style={
                          ativo
                            ? { background: config.bg, color: config.texto }
                            : undefined
                        }
                        onClick={() => alternarTipo(tipo)}
                      >
                        {config.label}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          )}

          <div className={styles.sidebarList}>
            <p className={styles.sidebarLabel}>
              Versões
              {filtrosAtivos && ` (${atualizacoesFiltradas.length} de ${atualizacoes.length})`}
            </p>

            {atualizacoesFiltradas.length === 0 && (
              <p className={styles.semResultado}>
                Nenhuma atualização com esses filtros.
              </p>
            )}

            {atualizacoesFiltradas.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={styles.sidebarItem}
                onClick={() => scrollTo(index)}
              >
                <div className={styles.sidebarItemLeft}>
                  <span className={styles.sidebarVersao}>{item.versao}</span>
                  <span className={styles.sidebarTitulo}>{item.titulo}</span>
                </div>

                <div className={styles.sidebarDots}>
                  {item.tags.map((tag) => (
                    <TagDot key={tag.id} tag={tag} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className={styles.container}>
          {atualizacoesFiltradas.length === 0 && (
            <div className={styles.semResultadoCard}>
              <p>Nenhuma atualização encontrada com os filtros selecionados.</p>
              <button
                type="button"
                className={styles.limparFiltros}
                onClick={limparFiltros}
              >
                <X size={12} />
                Limpar filtros
              </button>
            </div>
          )}

          <div className={styles.timeline}>
            {atualizacoesFiltradas.map((item, index) => (
              <div
                key={item.id}
                className={styles.timelineItem}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
              >
                <div className={styles.timelineSide}>
                  <div className={styles.timelineDot} />

                  {index < atualizacoesFiltradas.length - 1 && (
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
                    <span className={styles.cardData}>
                      {formatarDataHora(item.publicadoEm)}
                    </span>
                  </div>

                  <div className={styles.cardModulos}>
                    {item.tags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} />
                    ))}
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
                    {selecionada.versao} · {formatarDataHora(selecionada.publicadoEm)}
                  </span>

                  {selecionada.tags.map((tag) => (
                    <TagChip key={tag.id} tag={tag} />
                  ))}
                </div>

                <h2 className={styles.modalTitle}>{selecionada.titulo}</h2>

                <p className={styles.modalSubtitle}>{selecionada.descricao}</p>
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
                {selecionada.itens.map((item) => (
                  <li key={item.id} className={styles.itemRow}>
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
