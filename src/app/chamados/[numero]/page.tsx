import { notFound } from "next/navigation";
import Link from "next/link";
import { Home, LifeBuoy, LogIn, ShieldAlert } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { listarAtendentesDisponiveisParaSetor } from "@/lib/chamados/atendentes";
import { verificarAcessoChamado } from "@/lib/chamados/autorizacao-chamados";
import {
  buscarChamadoPorNumero,
  listarCopiaDoChamado,
  listarSetoresParaChamado,
} from "@/lib/chamados/chamados";
import { listarNotificacoesEmailChamados } from "@/lib/chamados/notificacoes-email";
import { ChamadoDetalhePage } from "@/modules/chamados/components/ChamadoDetalhePage";

interface PageProps {
  params: Promise<{ numero: string }>;
  searchParams: Promise<{ nome?: string }>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const [{ numero: numeroParam }, { nome }] = await Promise.all([params, searchParams]);
  const numero = Number(numeroParam);

  if (!Number.isInteger(numero) || numero <= 0) {
    notFound();
  }

  const [usuario, chamado] = await Promise.all([
    getUsuarioAutenticado(),
    buscarChamadoPorNumero(numero),
  ]);

  if (!chamado) {
    notFound();
  }

  const nomeConfirmado = nome ?? null;
  const { podeVer, ehAtendente, ehDono, ehEmCopia, bloqueadoPorTentativas } =
    await verificarAcessoChamado(chamado, usuario, nomeConfirmado);

  /*
   * Chamado marcado como público (ver atualizarPublico) pode ser
   * visto por qualquer um, mesmo sem sessão/nome — mas só em modo
   * leitura: `podeVer` continua com o significado original (dono
   * por sessão, nome confirmado ou atendente do setor) e é isso
   * que controla se a pessoa pode responder/agir sobre o chamado,
   * não `chamado.publico`.
   */
  if (!podeVer && !chamado.publico) {
    const proximoDestino = `/chamados/${numero}${nome ? `?nome=${encodeURIComponent(nome)}` : ""}`;

    return (
      <PageContainer>
        <Breadcrumb
          items={[
            { label: "Início", href: "/", icon: <Home size={14} /> },
            { label: "Chamados", href: "/chamados", icon: <LifeBuoy size={14} /> },
            { label: `Nº ${numero}`, current: true },
          ]}
        />

        <Card>
          {bloqueadoPorTentativas ? (
            <Alert variant="danger" icon={<ShieldAlert />} title="Muitas tentativas">
              Foram feitas muitas tentativas com nome incorreto para este chamado.
              Aguarde alguns minutos e tente novamente.
            </Alert>
          ) : !usuario ? (
            /*
             * Sem sessão, "sem acesso" ainda não é definitivo -- a
             * pessoa pode muito bem ter conta (solicitante, atendente
             * do setor ou alguém em cópia) e só não estar logada
             * neste navegador (ex: abriu o link do e-mail). Sugere
             * login antes de dar a mensagem final de negado.
             */
            <EmptyState
              icon={<LogIn size={28} />}
              title="Entre para verificar seu acesso"
              description='Este chamado pode estar vinculado à sua conta, como solicitante, atendente do setor ou pessoa em cópia. Se foi aberto sem login, use "Consultar chamado" com o número e o nome informados na abertura.'
              action={
                <Link href={`/login?next=${encodeURIComponent(proximoDestino)}`}>
                  <Button>Entrar</Button>
                </Link>
              }
            />
          ) : (
            <Alert variant="danger" icon={<ShieldAlert />} title="Sem acesso a este chamado">
              Confira se o número e o nome informados estão corretos, ou use{" "}
              <Link href="/chamados/consultar">Consultar chamado</Link> novamente.
            </Alert>
          )}
        </Card>
      </PageContainer>
    );
  }

  const mensagensVisiveis = ehAtendente
    ? chamado.mensagens
    : chamado.mensagens.filter((mensagem) => !mensagem.interno);

  const [atendentesDoSetor, setoresParaTransferir] = ehAtendente
    ? await Promise.all([
        listarAtendentesDisponiveisParaSetor(chamado.setorId),
        listarSetoresParaChamado(),
      ])
    : [[], []];

  const [copiaAtual, notificacoesComFalha] = await Promise.all([
    listarCopiaDoChamado(chamado.id),
    listarNotificacoesEmailChamados({ chamadoNumero: numero, sucesso: false, pagina: 1, porPagina: 1 }),
  ]);

  return (
    <ChamadoDetalhePage
      chamado={{ ...chamado, mensagens: mensagensVisiveis, ehAtendente, ehDono, ehEmCopia }}
      nomeConfirmado={nomeConfirmado}
      atendentesDoSetor={atendentesDoSetor}
      setoresParaTransferir={setoresParaTransferir}
      podeResponder={podeVer}
      ehAdministrador={usuario?.ehAdministrador ?? false}
      copiaAtual={copiaAtual}
      temNotificacaoFalha={notificacoesComFalha.total > 0}
    />
  );
}
