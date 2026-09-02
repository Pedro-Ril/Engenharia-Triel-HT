"use client";

import styles from "@/modules/integra-lantek-shared/components/InfoPesquisaModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

const SQL_EXEMPLO = `AND (
       TITENS1.DESC_TECNICA LIKE '%CHAPA DE%'
    OR TITENS1.DESC_TECNICA LIKE '%BARRA CHATA%'
)
AND NVL(TDEMANDAS.QTDE,0) <> 0
AND TOPERACAO.DESCRICAO NOT LIKE '%DOBRA%'
AND TOPERACAO.DESCRICAO NOT LIKE '%CHANFRO%'
AND TOPERACAO.DESCRICAO NOT LIKE '%CALANDRAR%'
AND TCENTROS_TRAB.DESCRICAO LIKE '%CORTE%'`;

export default function InfoPesquisaModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <span className={styles.badge}>Regras da integração</span>
            <h2 className={styles.title}>Orientações da pesquisa</h2>
            <p className={styles.subtitle}>
              Consulte ordens/lotes e utilize os filtros aplicados para gerar
              apenas itens válidos para o Lantek.
            </p>
          </div>

          <button className={styles.close} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Informações importantes</h3>

            <div className={styles.grid}>
              <div className={styles.card}>
                <h4>Consulta múltipla</h4>
                <p>
                  Você pode informar várias ordens ou lotes separados por
                  vírgula no mesmo campo de busca.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Validação de DXF</h4>
                <p>
                  Após a consulta, o sistema valida automaticamente a existência
                  dos arquivos DXF vinculados aos códigos retornados. Quando o
                  DXF não é localizado pelo código do item, o sistema tenta a
                  validação novamente usando o código do desenho.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Edição da planilha</h4>
                <p>
                  Depois de adicionar ao grid, os campos de material, espessura
                  e máquina podem ser ajustados antes da exportação.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Exportação do arquivo</h4>
                <p>
                  Na exportação, o nome do item permanece com o código do item.
                  Já o caminho do DXF utiliza o código do desenho somente quando
                  ele for diferente do código do item.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Resumo final</h4>
                <p>
                  Na exportação, o sistema mostra um resumo agrupado para ajudar
                  na conferência das ordens antes do fechamento do processo.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Fluxo recomendado</h3>

            <div className={styles.flowWrapper}>
              <svg
                className={styles.flowSvg}
                width="100%"
                viewBox="0 0 680 160"
              >
                <defs>
                  <marker
                    id="flowArrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path
                      className={styles.flowArrowPath}
                      d="M2 1L8 5L2 9"
                      fill="none"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </marker>
                </defs>

                <rect
                  className={styles.flowStepActive}
                  x="20"
                  y="44"
                  width="130"
                  height="72"
                  rx="10"
                />
                <text
                  className={styles.flowStepNumber}
                  x="85"
                  y="72"
                  textAnchor="middle"
                >
                  1
                </text>
                <text
                  className={styles.flowStepLabel}
                  x="85"
                  y="90"
                  textAnchor="middle"
                >
                  Buscar
                </text>
                <text
                  className={styles.flowStepSub}
                  x="85"
                  y="108"
                  textAnchor="middle"
                >
                  ordem ou lote
                </text>

                <line
                  className={styles.flowConnector}
                  x1="150"
                  y1="80"
                  x2="182"
                  y2="80"
                  markerEnd="url(#flowArrow)"
                />

                <rect
                  className={styles.flowStep}
                  x="183"
                  y="44"
                  width="130"
                  height="72"
                  rx="10"
                />
                <text
                  className={styles.flowStepNumber}
                  x="248"
                  y="72"
                  textAnchor="middle"
                >
                  2
                </text>
                <text
                  className={styles.flowStepLabel}
                  x="248"
                  y="90"
                  textAnchor="middle"
                >
                  Validar
                </text>
                <text
                  className={styles.flowStepSub}
                  x="248"
                  y="108"
                  textAnchor="middle"
                >
                  retorno
                </text>

                <line
                  className={styles.flowConnector}
                  x1="313"
                  y1="80"
                  x2="345"
                  y2="80"
                  markerEnd="url(#flowArrow)"
                />

                <rect
                  className={styles.flowStep}
                  x="346"
                  y="44"
                  width="130"
                  height="72"
                  rx="10"
                />
                <text
                  className={styles.flowStepNumber}
                  x="411"
                  y="72"
                  textAnchor="middle"
                >
                  3
                </text>
                <text
                  className={styles.flowStepLabel}
                  x="411"
                  y="90"
                  textAnchor="middle"
                >
                  Ajustar
                </text>
                <text
                  className={styles.flowStepSub}
                  x="411"
                  y="108"
                  textAnchor="middle"
                >
                  material e espessura
                </text>

                <line
                  className={styles.flowConnector}
                  x1="476"
                  y1="80"
                  x2="508"
                  y2="80"
                  markerEnd="url(#flowArrow)"
                />

                <rect
                  className={styles.flowStep}
                  x="509"
                  y="44"
                  width="150"
                  height="72"
                  rx="10"
                />
                <text
                  className={styles.flowStepNumber}
                  x="584"
                  y="72"
                  textAnchor="middle"
                >
                  4
                </text>
                <text
                  className={styles.flowStepLabel}
                  x="584"
                  y="90"
                  textAnchor="middle"
                >
                  Exportar
                </text>
                <text
                  className={styles.flowStepSub}
                  x="584"
                  y="108"
                  textAnchor="middle"
                >
                  o XLS
                </text>
              </svg>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Regras SQL aplicadas</h3>

            <div className={styles.sqlBox}>
              <pre>{SQL_EXEMPLO}</pre>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>O que essas regras fazem</h3>

            <div className={styles.grid}>
              <div className={styles.card}>
                <h4>Somente CHAPA DE ou BARRA CHATA</h4>
                <p>
                  Considera apenas registros cuja descrição técnica contenha
                  &quot;CHAPA DE&quot; ou &quot;BARRA CHATA&quot;.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Quantidade diferente de zero</h4>
                <p>Ignora itens sem demanda ou com quantidade zerada.</p>
              </div>

              <div className={styles.card}>
                <h4>Sem dobra, chanfro ou calandra</h4>
                <p>
                  Exclui itens cuja operação esteja relacionada a dobra,
                  chanfro ou calandragem.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Somente centros de trabalho de corte</h4>
                <p>
                  Restringe o retorno para centros de trabalho com descrição
                  relacionada a corte.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.primary} onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}