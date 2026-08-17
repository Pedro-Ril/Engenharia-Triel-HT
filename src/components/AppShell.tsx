"use client";

import { useState } from "react";
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

export default function AppShell({
  children,
  setores,
  usuario,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <RouteLoadingProvider>
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
    </RouteLoadingProvider>
  );
}
