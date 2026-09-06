import { Calendar, Clock, Download, FileWarning, Package, User } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { buscarPorTokenParaExibicao } from "@/lib/transferencia/transferencias";

import styles from "./Pagina.module.css";

export const dynamic = "force-dynamic";

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function estaExpirada(expiraEmIso: string): boolean {
  return new Date(expiraEmIso).getTime() <= Date.now();
}

/*
 * Snapshot calculado na hora da requisição — a página já é
 * `force-dynamic` (renderiza de novo a cada acesso), então não precisa
 * de contagem regressiva ao vivo no cliente pra ficar correta.
 */
function formatarTempoRestante(expiraEmIso: string): string {
  const diffMs = new Date(expiraEmIso).getTime() - Date.now();

  const minutos = Math.round(diffMs / 60_000);
  if (minutos < 60) return `em ${minutos} minuto${minutos === 1 ? "" : "s"}`;

  const horas = Math.round(diffMs / 3_600_000);
  if (horas < 24) return `em ${horas} hora${horas === 1 ? "" : "s"}`;

  const dias = Math.round(diffMs / 86_400_000);
  return `em ${dias} dia${dias === 1 ? "" : "s"}`;
}

interface PageProps {
  params: Promise<{ token: string }>;
}

/*
 * Página pública de propósito — quem recebe o link pode não ter (nem
 * precisar ter) login no portal. A única proteção é o token opaco na
 * URL. `buscarPorTokenParaExibicao` devolve o registro mesmo depois de
 * vencido (só some quando o agendador de limpeza já apagou a linha) —
 * assim dá pra mostrar quem enviou/quando expirou mesmo num link
 * morto, em vez de só "não existe".
 */
export default async function DownloadTransferenciaPage({ params }: PageProps) {
  const { token } = await params;
  const transferencia = await buscarPorTokenParaExibicao(token);
  const expirada = transferencia ? estaExpirada(transferencia.expiraEm) : false;

  return (
    <PageContainer>
      <PageHeader
        title="Transferência de Arquivos"
        description="Portal Triel-HT"
      />

      <Card>
        {!transferencia ? (
          <EmptyState
            icon={<FileWarning size={28} />}
            title="Link expirado ou inválido"
            description="Este link não existe mais ou já passou do prazo definido por quem enviou o arquivo."
          />
        ) : (
          <Stack gap={20}>
            <div>
              <div className={styles.arquivoNome}>
                {transferencia.arquivos.length === 1
                  ? transferencia.arquivos[0].nomeOriginal
                  : `${transferencia.arquivos.length} arquivos`}
              </div>
              <div className={styles.arquivoTamanho}>
                {formatarTamanho(transferencia.tamanhoTotalBytes)}
              </div>
            </div>

            <div className={styles.metadados}>
              {transferencia.enviadoPorNome && (
                <div className={styles.linhaMetadado}>
                  <User size={15} />
                  Enviado por <strong>{transferencia.enviadoPorNome}</strong>
                </div>
              )}

              <div className={styles.linhaMetadado}>
                <Calendar size={15} />
                Enviado em <strong>{formatarData(transferencia.criadoEm)}</strong>
              </div>

              <div className={styles.linhaMetadado}>
                <Clock size={15} />
                {expirada ? (
                  <>
                    Expirou em <strong>{formatarData(transferencia.expiraEm)}</strong>
                  </>
                ) : (
                  <>
                    Expira <strong>{formatarTempoRestante(transferencia.expiraEm)}</strong> (
                    {formatarData(transferencia.expiraEm)})
                  </>
                )}
              </div>
            </div>

            {transferencia.mensagem && <p className={styles.citacao}>{transferencia.mensagem}</p>}

            {expirada ? (
              <Alert variant="warning">
                Este link expirou e {transferencia.arquivos.length === 1 ? "o arquivo não está" : "os arquivos não estão"} mais disponíveis para download.
              </Alert>
            ) : transferencia.arquivos.length === 1 ? (
              <Stack direction="row">
                <a
                  href={`/api/baixar/${token}/arquivo/${transferencia.arquivos[0].id}`}
                  className={styles.botao}
                >
                  <Download size={16} />
                  Baixar arquivo
                </a>
              </Stack>
            ) : (
              <Stack gap={14}>
                <div className={styles.listaArquivos}>
                  {transferencia.arquivos.map((arquivo) => (
                    <div key={arquivo.id} className={styles.itemArquivo}>
                      <div className={styles.itemArquivoInfo}>
                        <span className={styles.itemArquivoNome}>{arquivo.nomeOriginal}</span>
                        <span className={styles.itemArquivoTamanho}>
                          {formatarTamanho(arquivo.tamanhoBytes)}
                        </span>
                      </div>
                      <a
                        href={`/api/baixar/${token}/arquivo/${arquivo.id}`}
                        className={styles.botaoIcone}
                        aria-label={`Baixar ${arquivo.nomeOriginal}`}
                      >
                        <Download size={16} />
                      </a>
                    </div>
                  ))}
                </div>

                <Stack direction="row">
                  <a href={`/api/baixar/${token}/zip`} className={styles.botao}>
                    <Package size={16} />
                    Baixar tudo (.zip)
                  </a>
                </Stack>
              </Stack>
            )}
          </Stack>
        )}
      </Card>
    </PageContainer>
  );
}
