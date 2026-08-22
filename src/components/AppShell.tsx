"use client";

import { Suspense, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import type { UsuarioLogado } from "@/components/Sidebar";
import { RouteLoadingProvider } from "@/components/RouteLoadingProvider";
import type { SetorComModulos } from "@/lib/auth/autorizacao";
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
