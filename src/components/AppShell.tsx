"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import type { UsuarioLogado } from "@/components/Sidebar";
import { RouteLoadingProvider } from "@/components/RouteLoadingProvider";
import type { SetorComModulos } from "@/lib/auth/autorizacao";
import { persistirTemaEmCookie } from "@/lib/tema/aplicar-tema";
import styles from "@/app/layout.module.css";

interface AppShellProps {
  children: React.ReactNode;
  setores: SetorComModulos[];
  usuario: UsuarioLogado | null;
}

interface PainelPortalProps extends AppShellProps {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}

/*
 * Rotas que aceitam rodar em tela cheia, sem o menu lateral/
 * topo do portal, quando acessadas com "?fullscreen=1" na URL
 * — pensado para o terminal de chão de fábrica (ver
 * src/app/terminal-fabrica), configurado assim só no terminal
 * físico. Sem o parâmetro, a rota funciona normalmente, com o
 * menu lateral como qualquer outra página.
 */
const ROTAS_COM_TELA_CHEIA = ["/terminal-fabrica", "/chamados/dashboard"];

function PainelPortal({
  children,
  setores,
  usuario,
  menuOpen,
  setMenuOpen,
}: PainelPortalProps) {
  return (
    <div className={styles.app}>
      <Sidebar
        open={menuOpen}
        setOpen={setMenuOpen}
        setores={setores}
        usuario={usuario}
      />

      <button
        type="button"
        className={styles.menuGatilhoMobile}
        onClick={() => setMenuOpen(true)}
        aria-label="Abrir menu"
        hidden={menuOpen}
      >
        <Menu size={20} />
      </button>

      <div
        className={`${styles.menuBackdrop} ${menuOpen ? styles.aberto : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <main
        className={`${styles.content} ${
          menuOpen ? styles.contentOpen : styles.contentClosed
        }`}
      >
        {children}
      </main>
    </div>
  );
}

function AppShellConteudo(props: PainelPortalProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const suportaTelaCheia = ROTAS_COM_TELA_CHEIA.some(
    (prefixo) => pathname === prefixo || pathname?.startsWith(`${prefixo}/`)
  );
  const telaCheiaAtiva =
    suportaTelaCheia && searchParams.get("fullscreen") === "1";

  if (telaCheiaAtiva) {
    return <>{props.children}</>;
  }

  return <PainelPortal {...props} />;
}

export default function AppShell(props: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const { usuario } = props;

  /*
   * Mantém o cookie de tema (ver persistirTemaEmCookie) sempre
   * alinhado com o que o servidor resolveu pra este login — cobre
   * quem nunca trocou de tema manualmente NESTE navegador (ex: já
   * tinha "escuro" salvo no banco de outro dispositivo). Sem isso, o
   * cookie só existiria depois de um toggle manual, e a preferência
   * se perderia (voltando pro padrão "claro") assim que a sessão
   * expirasse antes disso acontecer.
   */
  useEffect(() => {
    if (!usuario) return;

    const atributo = document.documentElement.getAttribute("data-theme");
    const temaAtual = atributo === "dark" ? "escuro" : atributo === "light" ? "claro" : "sistema";
    persistirTemaEmCookie(temaAtual);
  }, [usuario]);

  /*
   * O layout raiz (setores/módulos liberados) só é buscado de
   * novo em navegação client-side com router.refresh() — sem
   * isso, se um admin mudar as permissões de alguém no meio da
   * sessão, o menu lateral continua mostrando o acesso antigo
   * até um reload completo. Atualizar ao voltar para a aba
   * reduz essa janela de desatualização.
   */
  useEffect(() => {
    function aoFicarVisivel() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    document.addEventListener("visibilitychange", aoFicarVisivel);
    return () => document.removeEventListener("visibilitychange", aoFicarVisivel);
  }, [router]);

  /*
   * Sair em uma aba grava isso no localStorage — o evento
   * "storage" só dispara nas OUTRAS abas do mesmo navegador,
   * nunca na que fez a mudança. router.refresh() faz cada
   * página reavaliar sua própria checagem de sessão no servidor.
   */
  useEffect(() => {
    function aoDeslogarEmOutraAba(event: StorageEvent) {
      if (event.key === "portal-logout-em") {
        router.refresh();
      }
    }

    window.addEventListener("storage", aoDeslogarEmOutraAba);
    return () => window.removeEventListener("storage", aoDeslogarEmOutraAba);
  }, [router]);

  return (
    <RouteLoadingProvider>
      <Suspense
        fallback={
          <PainelPortal
            {...props}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
          />
        }
      >
        <AppShellConteudo
          {...props}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
        />
      </Suspense>
    </RouteLoadingProvider>
  );
}
