"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Download, History, LayoutGrid, LifeBuoy, Megaphone, User, Zap } from "lucide-react";

import AppLink from "@/components/AppLink";
import { Card } from "@/components/ui/Card";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { resolverIcone } from "@/lib/icons/icon-registry";
import { aplicarTemaComTransicao } from "@/lib/tema/aplicar-tema";
import { OPCOES_TEMA } from "@/lib/tema/opcoes-tema";
import { LoginModal } from "@/modules/auth/components/LoginModal";
import { atualizarTemaUsuario } from "@/modules/minha-conta/services/minhaConta.service";
import type { TemaPreferencia } from "@/modules/minha-conta/types/minhaConta.types";
import type { ResumoAcessoModulo } from "@/lib/auth/acesso-modulo";
import type { ModuloPermitido, SetorComModulos } from "@/lib/auth/autorizacao";
import styles from "@/app/home.module.css";

import { CatalogoModulosModal } from "./CatalogoModulosModal";

interface HomeContentProps {
  usuario: { nomeExibicao: string } | null;
  setores: SetorComModulos[];
  resumoAcessos?: ResumoAcessoModulo[];
  abrirLoginInicial?: boolean;
}

/*
 * `dataIso` vem de SYSDATETIME() (SQL Server) — hora local do
 * servidor, sem timezone, igual a todo o resto do app (ver
 * formatarData em MinhaContaPage.tsx). Por isso `new Date(...)`
 * aqui NÃO leva "Z": tratar como UTC deslocaria o cálculo pelo
 * fuso do servidor (ex: "há 3h" para um acesso que acabou de
 * acontecer).
 */
function formatarTempoRelativo(dataIso: string): string {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const diffMinutos = Math.floor(diffMs / 60000);

  if (diffMinutos < 1) return "agora há pouco";
  if (diffMinutos < 60) return `há ${diffMinutos} min`;

  const diffHoras = Math.floor(diffMinutos / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias === 1) return "ontem";
  if (diffDias < 30) return `há ${diffDias} dias`;

  return new Date(dataIso).toLocaleDateString("pt-BR");
}

export function HomeContent({
  usuario,
  setores,
  resumoAcessos = [],
  abrirLoginInicial = false,
}: HomeContentProps) {
  const [loginAberto, setLoginAberto] = useState(abrirLoginInicial);
  const [catalogoAberto, setCatalogoAberto] = useState(false);

  /*
   * O tema já vem resolvido do servidor no atributo data-theme do
   * <html> (ver src/app/layout.tsx) — lido aqui só pra inicializar o
   * estado visual deste atalho, sem precisar buscar a preferência de
   * novo. Ausência do atributo (usuário com preferência "sistema")
   * só é lida depois do mount pra evitar mismatch de hidratação.
   */
  const [tema, setTema] = useState<TemaPreferencia>("sistema");
  const [salvandoTema, setSalvandoTema] = useState(false);
  const ultimoCliqueTemaRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    /*
     * document não existe durante o SSR, então o estado inicial
     * precisa ser um valor fixo ("sistema") pra bater com a marcação
     * gerada pelo servidor — só depois de montado é seguro ler o
     * data-theme real (já setado por src/app/layout.tsx) sem causar
     * mismatch de hidratação.
     */
    const atributo = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTema(atributo === "dark" ? "escuro" : atributo === "light" ? "claro" : "sistema");
  }, []);

  async function handleAlterarTema(novoTema: TemaPreferencia, origem: { x: number; y: number }) {
    const temaAnterior = tema;

    setTema(novoTema);
    aplicarTemaComTransicao(novoTema, origem);
    setSalvandoTema(true);

    const resultado = await atualizarTemaUsuario(novoTema);

    setSalvandoTema(false);

    if (!resultado.ok) {
      setTema(temaAnterior);
      aplicarTemaComTransicao(temaAnterior, origem);
    }
  }

  const totalModulos = setores.reduce(
    (total, setor) => total + setor.modulos.length,
    0
  );

  const primeiroModulo = setores.find((setor) => setor.modulos.length > 0)
    ?.modulos[0];

  const modulosPermitidosPorId = useMemo(() => {
    const mapa = new Map<string, ModuloPermitido>();
    for (const setor of setores) {
      for (const modulo of setor.modulos) {
        mapa.set(modulo.id, modulo);
      }
    }
    return mapa;
  }, [setores]);

  const acessosValidos = resumoAcessos.filter((item) =>
    modulosPermitidosPorId.has(item.moduloId)
  );

  const recentes = [...acessosValidos]
    .sort(
      (a, b) =>
        new Date(b.ultimoAcesso).getTime() - new Date(a.ultimoAcesso).getTime()
    )
    .slice(0, 5)
    .map((item) => ({
      modulo: modulosPermitidosPorId.get(item.moduloId)!,
      ultimoAcesso: item.ultimoAcesso,
    }));

  const maisAcessadoItem = [...acessosValidos].sort(
    (a, b) => b.totalAcessos - a.totalAcessos
  )[0];

  const moduloDestaque = maisAcessadoItem
    ? modulosPermitidosPorId.get(maisAcessadoItem.moduloId)
    : primeiroModulo;

  /*
   * Antes cada setor virava um bloco cheio (título + grade) empilhado
   * um embaixo do outro — um setor com 1 módulo só ocupava uma linha
   * inteira à toa, e muitos setores exigiam bastante scroll. Agora é
   * navegação lateral: só o setor selecionado mostra sua grade.
   * Estado guarda só o id escolhido explicitamente; o efetivo cai pro
   * primeiro setor com módulos enquanto nada foi clicado ainda, sem
   * precisar de useEffect pra sincronizar um valor inicial.
   */
  const setoresComModulos = setores.filter((setor) => setor.modulos.length > 0);
  const [setorSelecionadoId, setSetorSelecionadoId] = useState<string | null>(null);
  const setorAtivo =
    setoresComModulos.find((setor) => setor.id === setorSelecionadoId) ??
    setoresComModulos[0] ??
    null;

  /*
   * "Suas ferramentas" (o motivo real de abrir o portal), Recentes e
   * Acesso rápido viravam seções empilhadas demais — consolidadas em
   * abas (mesmo SegmentedTabs de Monitoramento/Configurações) pra
   * ocupar o espaço de uma seção só, com Ferramentas sempre em
   * primeiro (aba padrão). Suporte fica de fora, fixo, por baixo —
   * é o tipo de coisa que devia estar sempre visível, não escondida
   * atrás de um clique de aba. Lista montada dinamicamente: um
   * visitante anônimo só vê "Ferramentas do portal" — nesse caso a
   * barra de abas nem aparece (não faz sentido abas com uma opção
   * só), só o conteúdo direto.
   */
  const abasSecundarias = [
    {
      valor: "ferramentas" as const,
      label: usuario ? "Suas ferramentas" : "Ferramentas do portal",
      icon: LayoutGrid,
    },
    ...(usuario && recentes.length > 0
      ? [{ valor: "recentes" as const, label: "Recentes", icon: History }]
      : []),
    ...(usuario
      ? [{ valor: "acesso-rapido" as const, label: "Acesso rápido", icon: Zap }]
      : []),
  ];

  type AbaSecundaria = (typeof abasSecundarias)[number]["valor"];

  const [abaSecundaria, setAbaSecundaria] = useState<AbaSecundaria>(
    abasSecundarias[0].valor
  );

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>Portal Grupo Triel-HT</span>

          <h1 className={styles.title}>
            {usuario
              ? `Bem-vindo de volta, ${usuario.nomeExibicao.split(" ")[0]}`
              : "Bem-vindo ao portal de ferramentas do Grupo Triel-HT"}
          </h1>

          <p className={styles.description}>
            Este ambiente centraliza as ferramentas internas de todos os
            setores da empresa em uma interface única, organizada por
            departamento e com acesso controlado por login corporativo. Cada
            pessoa vê apenas os módulos liberados para o seu perfil.
          </p>

          <div className={styles.heroActions}>
            {usuario ? (
              moduloDestaque && (
                <AppLink
                  href={moduloDestaque.path}
                  className={styles.primaryButton}
                >
                  Acessar {moduloDestaque.nome}
                </AppLink>
              )
            ) : (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setLoginAberto(true)}
              >
                Entrar com usuário corporativo
              </button>
            )}

            <AppLink href="/atualizacoes" className={styles.secondaryButton}>
              Ver atualizações do portal
            </AppLink>
          </div>
        </div>

        <aside className={styles.heroPanel}>
          <div className={styles.panelCard}>
            <h2 className={styles.panelTitle}>Mensagem de boas-vindas</h2>
            <p className={styles.panelText}>
              {usuario
                ? "Utilize o menu lateral para navegar entre os setores e ferramentas liberados para o seu usuário."
                : "Faça login com o seu usuário de rede para ver as ferramentas liberadas para o seu setor."}
            </p>
          </div>

          <div className={styles.statsGrid}>
            {usuario ? (
              <button
                type="button"
                className={`${styles.statCard} ${styles.statCardClicavel}`}
                onClick={() => setCatalogoAberto(true)}
              >
                <span className={styles.statLabel}>Ferramentas liberadas</span>
                <strong className={styles.statValue}>
                  {String(totalModulos).padStart(2, "0")}
                </strong>
              </button>
            ) : (
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Ferramentas públicas</span>
                <strong className={styles.statValue}>
                  {String(totalModulos).padStart(2, "0")}
                </strong>
              </div>
            )}

            {usuario ? (
              <button
                type="button"
                className={`${styles.statCard} ${styles.statCardClicavel}`}
                onClick={() => setCatalogoAberto(true)}
              >
                <span className={styles.statLabel}>Setores liberados</span>
                <strong className={styles.statValue}>
                  {String(setores.length).padStart(2, "0")}
                </strong>
              </button>
            ) : (
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Setores visíveis</span>
                <strong className={styles.statValue}>
                  {String(setores.length).padStart(2, "0")}
                </strong>
              </div>
            )}

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Autenticação</span>
              <strong className={styles.statValue}>
                Active Directory
              </strong>
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
        {abasSecundarias.length > 1 && (
          <SegmentedTabs
            itens={abasSecundarias.map((aba) => ({
              valor: aba.valor,
              label: aba.label,
              icon: <aba.icon size={15} />,
            }))}
            ativo={abaSecundaria}
            onSelecionar={(valor) => setAbaSecundaria(valor as AbaSecundaria)}
          />
        )}

        <div className={abasSecundarias.length > 1 ? styles.abaSecundariaConteudo : undefined}>
          {abaSecundaria === "ferramentas" && (
            totalModulos > 0 && setorAtivo ? (
              <div className={styles.ferramentasLayout}>
                <nav className={styles.setoresNav}>
                  {setoresComModulos.map((setor) => {
                    const SetorIcon = resolverIcone(setor.icone);
                    const ativo = setor.id === setorAtivo.id;

                    return (
                      <button
                        key={setor.id}
                        type="button"
                        className={`${styles.setoresNavItem} ${ativo ? styles.setoresNavItemAtivo : ""}`}
                        onClick={() => setSetorSelecionadoId(setor.id)}
                      >
                        <span className={styles.setoresNavIcon}>
                          <SetorIcon size={16} />
                        </span>
                        <span className={styles.setoresNavNome}>{setor.nome}</span>
                        <span className={styles.setoresNavContagem}>
                          {setor.modulos.length}
                        </span>
                      </button>
                    );
                  })}
                </nav>

                <div className={styles.moduleGrid}>
                  {setorAtivo.modulos.map((modulo) => {
                    const ModuloIcon = resolverIcone(modulo.icone);

                    return (
                      <AppLink
                        key={modulo.id}
                        href={modulo.path}
                        className={styles.moduleCard}
                      >
                        <span className={styles.moduleCardIcon}>
                          <ModuloIcon size={20} />
                        </span>

                        <span className={styles.moduleCardBody}>
                          <span className={styles.moduleCardTitle}>
                            {modulo.nome}
                            {modulo.emDesenvolvimento && (
                              <span
                                className={styles.devBadge}
                                title="Em desenvolvimento — só administradores veem"
                              >
                                DEV
                              </span>
                            )}
                          </span>
                          <span className={styles.moduleCardLink}>
                            Abrir módulo
                          </span>
                        </span>
                      </AppLink>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={styles.infoCard}>
                <h3 className={styles.infoTitle}>
                  {usuario
                    ? "Nenhuma ferramenta liberada ainda"
                    : "Faça login para ver suas ferramentas"}
                </h3>
                <p className={styles.infoText}>
                  {usuario
                    ? "Fale com um administrador do portal para solicitar acesso às ferramentas do seu setor."
                    : "Depois de entrar com o seu usuário corporativo, os módulos liberados para você aparecem aqui."}
                </p>
              </div>
            )
          )}

          {abaSecundaria === "recentes" && usuario && recentes.length > 0 && (
            <div className={styles.recentesCard}>
              {recentes.map(({ modulo, ultimoAcesso }) => {
                const ModuloIcon = resolverIcone(modulo.icone);

                return (
                  <AppLink
                    key={modulo.id}
                    href={modulo.path}
                    className={styles.recentesItem}
                  >
                    <span className={styles.recentesItemIcon}>
                      <ModuloIcon size={17} />
                    </span>

                    <span className={styles.recentesItemNome}>
                      {modulo.nome}
                    </span>

                    <span className={styles.recentesItemTempo}>
                      <History size={13} />
                      {formatarTempoRelativo(ultimoAcesso)}
                    </span>
                  </AppLink>
                );
              })}
            </div>
          )}

          {abaSecundaria === "acesso-rapido" && usuario && (
            <div className={styles.quickAccessStack}>
              <Card
                title="Tema"
                description="Escolha como o portal aparece pra você — vale em qualquer dispositivo."
              >
                <div
                  onClickCapture={(event) => {
                    ultimoCliqueTemaRef.current = { x: event.clientX, y: event.clientY };
                  }}
                >
                  <RadioGroup
                    name="tema-home"
                    orientation="horizontal"
                    options={OPCOES_TEMA}
                    value={tema}
                    disabled={salvandoTema}
                    onValueChange={(valor) =>
                      handleAlterarTema(valor as TemaPreferencia, ultimoCliqueTemaRef.current)
                    }
                  />
                </div>
              </Card>

              <div className={styles.moduleGrid}>
                <AppLink href="/minha-conta" className={styles.moduleCard}>
                  <span className={styles.moduleCardIcon}>
                    <User size={20} />
                  </span>
                  <span className={styles.moduleCardBody}>
                    <span className={styles.moduleCardTitle}>Minha conta</span>
                    <span className={styles.moduleCardLink}>Perfil e preferências</span>
                  </span>
                </AppLink>

                <AppLink href="/wiki" className={styles.moduleCard}>
                  <span className={styles.moduleCardIcon}>
                    <BookOpen size={20} />
                  </span>
                  <span className={styles.moduleCardBody}>
                    <span className={styles.moduleCardTitle}>Wiki</span>
                    <span className={styles.moduleCardLink}>Abrir módulo</span>
                  </span>
                </AppLink>

                <AppLink href="/downloads" className={styles.moduleCard}>
                  <span className={styles.moduleCardIcon}>
                    <Download size={20} />
                  </span>
                  <span className={styles.moduleCardBody}>
                    <span className={styles.moduleCardTitle}>Downloads</span>
                    <span className={styles.moduleCardLink}>Abrir módulo</span>
                  </span>
                </AppLink>

                <AppLink href="/atualizacoes" className={styles.moduleCard}>
                  <span className={styles.moduleCardIcon}>
                    <Megaphone size={20} />
                  </span>
                  <span className={styles.moduleCardBody}>
                    <span className={styles.moduleCardTitle}>Atualizações</span>
                    <span className={styles.moduleCardLink}>Abrir módulo</span>
                  </span>
                </AppLink>
              </div>
            </div>
          )}

        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.suporteBanner}>
          <span className={styles.suporteBannerIcone}>
            <LifeBuoy size={26} />
          </span>

          <div className={styles.suporteBannerTexto}>
            <h2 className={styles.suporteBannerTitulo}>Precisa de ajuda?</h2>
            <p className={styles.suporteBannerDescricao}>
              Encontrou um problema, tem uma dúvida ou precisa de suporte de
              algum setor? Abra um chamado — não é preciso login para
              registrar, e você acompanha o andamento pelo número recebido.
            </p>
          </div>

          <div className={styles.suporteBannerAcoes}>
            <AppLink href="/chamados" className={styles.primaryButton}>
              Abrir chamado
            </AppLink>
            <AppLink href="/chamados/consultar" className={styles.secondaryButton}>
              Consultar chamado
            </AppLink>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <h3 className={styles.infoTitle}>Objetivo da plataforma</h3>
            <p className={styles.infoText}>
              Centralizar ferramentas internas de todos os setores da
              empresa em um único portal, com login corporativo e permissões
              individuais por ferramenta.
            </p>
          </div>

          <div className={styles.infoCard}>
            <h3 className={styles.infoTitle}>Estrutura em crescimento</h3>
            <p className={styles.infoText}>
              O portal nasceu na Engenharia e está se expandindo para os
              demais setores da empresa, cada um organizado como um grupo
              próprio no menu lateral.
            </p>
          </div>

          <div className={styles.infoCard}>
            <h3 className={styles.infoTitle}>Acesso controlado</h3>
            <p className={styles.infoText}>
              Cada ferramenta pode ser pública para qualquer pessoa
              autenticada ou restrita, liberada individualmente por um
              administrador do portal.
            </p>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <LoginModal open={loginAberto} onClose={() => setLoginAberto(false)} />
      </Suspense>

      <CatalogoModulosModal
        open={catalogoAberto}
        onClose={() => setCatalogoAberto(false)}
      />
    </main>
  );
}
