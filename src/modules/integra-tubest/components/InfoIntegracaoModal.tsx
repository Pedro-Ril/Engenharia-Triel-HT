"use client";

import styles from "@/modules/integra-lantek-shared/components/InfoPesquisaModal.module.css";

/*
 * Mesma cara do "Integração ativa" da tela do Lantek -- inclusive o CSS,
 * que é o mesmo arquivo compartilhado. Muda o conteúdo: aqui a regra é a
 * operação de corte a laser de tubos/perfis, e o arquivo conferido é o
 * STEP (com .igs de reserva), não o DXF.
 */

const REGRAS_SQL = `-- SOMENTE ESTA OPERACAO
AND TOPERACAO.DESCRICAO = 'CORTAR LASER TUBOS/PERFIS'

-- SO LINHAS COM MATERIA-PRIMA
AND NVL(TDEMANDAS.QTDE, 0) <> 0

-- ROTEIRO DA ORDEM; SEM ELE, O ROTEIRO VIGENTE DO ITEM HOJE
AND (
      TROTEIRO.ID = TORDENS_ROT.TROTEIRO_ID
   OR (
        TORDENS_ROT.TROTEIRO_ID IS NULL
        AND TROTEIRO.ITEMPR_ID = TITENS_EMPR.ID
        AND TROTEIRO.SEQ = TORDENS_ROT.SEQ
        AND SYSDATE BETWEEN TROTEIRO.DT_INICIO AND TROTEIRO.DT_FIM
      )
)

ORDER BY TITENS1.DESC_TECNICA ASC`;

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function InfoIntegracaoModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tubest-info-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <span className={styles.badge}>Regras da integração</span>
            <h2 id="tubest-info-titulo" className={styles.title}>
              Orientações da pesquisa
            </h2>
            <p className={styles.subtitle}>
              Consulte ordens/lotes e confira os arquivos antes de gerar a planilha de importação
              em lote do TuBest.
            </p>
          </div>

          <button className={styles.close} onClick={onClose} aria-label="Fechar">
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
                  Você pode informar várias ordens ou lotes separados por vírgula no mesmo campo de
                  busca. Os resultados entram na mesma lista.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Uma linha por matéria-prima</h4>
                <p>
                  A consulta devolve uma linha para cada matéria-prima consumida pela ordem — por
                  isso a mesma peça pode aparecer mais de uma vez, e a conferência marca essas
                  repetições.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Conferência do arquivo</h4>
                <p>
                  Cada código é procurado na pasta de STEP. O arquivo com o nome exato do código
                  ganha; sem ele, vale a variante com sufixo entre parênteses. Cópias do Windows
                  (&quot;(1)&quot;, &quot;(2)&quot;) são ignoradas, e o .igs entra só quando a peça
                  não tem STEP.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Nº do carro</h4>
                <p>
                  Campo opcional, ao lado do lote. Ele não filtra nem busca nada: entra no nome dos
                  arquivos (CARRO_LOTE) e no nome de cada peça dentro da planilha.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Exportação do arquivo</h4>
                <p>
                  A planilha leva três colunas: caminho do arquivo, nome da peça e quantidade. O
                  nome da peça sai como CODITEM_ORDEM_CARRO — a ordem entra porque a mesma peça
                  pode vir em mais de uma ordem do lote. Pode sair como arquivo único ou um arquivo
                  por matéria-prima, dentro de um .zip.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Peças sem arquivo</h4>
                <p>
                  Elas não travam a exportação: vão para a planilha com o caminho vazio, e o portal
                  avisa antes. Um botão copia a lista de códigos para pedir a geração dos arquivos.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Resumo final</h4>
                <p>
                  Na exportação, o sistema mostra as ordens agrupadas por matéria-prima, com cópia
                  por grupo, para imprimir as ordens de fabricação.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Fluxo recomendado</h3>

            <div className={styles.flowWrapper}>
              <svg className={styles.flowSvg} width="100%" viewBox="0 0 680 160">
                <defs>
                  <marker
                    id="flowArrowTubest"
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

                <rect className={styles.flowStepActive} x="20" y="44" width="130" height="72" rx="10" />
                <text className={styles.flowStepNumber} x="85" y="72" textAnchor="middle">
                  1
                </text>
                <text className={styles.flowStepLabel} x="85" y="90" textAnchor="middle">
                  Buscar
                </text>
                <text className={styles.flowStepSub} x="85" y="108" textAnchor="middle">
                  ordem ou lote
                </text>

                <line
                  className={styles.flowConnector}
                  x1="150"
                  y1="80"
                  x2="182"
                  y2="80"
                  markerEnd="url(#flowArrowTubest)"
                />

                <rect className={styles.flowStep} x="183" y="44" width="130" height="72" rx="10" />
                <text className={styles.flowStepNumber} x="248" y="72" textAnchor="middle">
                  2
                </text>
                <text className={styles.flowStepLabel} x="248" y="90" textAnchor="middle">
                  Conferir
                </text>
                <text className={styles.flowStepSub} x="248" y="108" textAnchor="middle">
                  arquivos STEP
                </text>

                <line
                  className={styles.flowConnector}
                  x1="313"
                  y1="80"
                  x2="345"
                  y2="80"
                  markerEnd="url(#flowArrowTubest)"
                />

                <rect className={styles.flowStep} x="346" y="44" width="130" height="72" rx="10" />
                <text className={styles.flowStepNumber} x="411" y="72" textAnchor="middle">
                  3
                </text>
                <text className={styles.flowStepLabel} x="411" y="90" textAnchor="middle">
                  Exportar
                </text>
                <text className={styles.flowStepSub} x="411" y="108" textAnchor="middle">
                  XLSX ou ZIP por MP
                </text>

                <line
                  className={styles.flowConnector}
                  x1="476"
                  y1="80"
                  x2="508"
                  y2="80"
                  markerEnd="url(#flowArrowTubest)"
                />

                <rect className={styles.flowStep} x="509" y="44" width="150" height="72" rx="10" />
                <text className={styles.flowStepNumber} x="584" y="72" textAnchor="middle">
                  4
                </text>
                <text className={styles.flowStepLabel} x="584" y="90" textAnchor="middle">
                  Imprimir
                </text>
                <text className={styles.flowStepSub} x="584" y="108" textAnchor="middle">
                  ordens por matéria-prima
                </text>
              </svg>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Regras SQL aplicadas</h3>

            <div className={styles.sqlBox}>
              <pre>{REGRAS_SQL}</pre>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>O que essas regras fazem</h3>

            <div className={styles.grid}>
              <div className={styles.card}>
                <h4>Somente corte a laser de tubos e perfis</h4>
                <p>
                  Considera apenas a operação CORTAR LASER TUBOS/PERFIS. Peça que não passa por
                  essa operação não aparece, mesmo estando na ordem.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Quantidade diferente de zero</h4>
                <p>Ignora linhas sem demanda de matéria-prima ou com quantidade zerada.</p>
              </div>

              <div className={styles.card}>
                <h4>Roteiro da ordem, com reserva</h4>
                <p>
                  Vale o roteiro amarrado à ordem. Quando ela não tem um, entra o roteiro do item
                  vigente na data de hoje — então uma ordem antiga pode refletir o roteiro atual.
                </p>
              </div>

              <div className={styles.card}>
                <h4>Campos que podem vir vazios</h4>
                <p>
                  Máquina, cliente, pedido e código do desenho são opcionais na consulta. Vir em
                  branco é resultado esperado, não falha da integração.
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
