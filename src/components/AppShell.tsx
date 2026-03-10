"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { RouteLoadingProvider } from "@/components/RouteLoadingProvider";
import styles from "@/app/layout.module.css";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <RouteLoadingProvider>
      <div className={styles.app}>
        <Sidebar open={menuOpen} setOpen={setMenuOpen} />

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