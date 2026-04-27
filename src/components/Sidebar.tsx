"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FolderCheck,
  Home,
  Network,
  Download,
} from "lucide-react";
import AppLink from "./AppLink";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  open: boolean;
  setOpen: (value: boolean) => void;
};

const menu = [
  {
    name: "Início",
    path: "/",
    icon: Home,
  },
  {
    name: "Liberação de Projeto",
    path: "/liberacao-projeto",
    icon: FolderCheck,
  },
  {
    name: "Consulta Estrutura",
    path: "/consulta-estrutura",
    icon: Network,
  },
  {
    name: "Dashboard BI",
    path: "/bi",
    icon: BarChart3,
  },
  {
    name: "Downloads",
    path: "/downloads",
    icon: Download,
  },
];

export default function Sidebar({ open, setOpen }: SidebarProps) {
  const pathname = usePathname();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSidebarClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!open && e.target === e.currentTarget) {
      setOpen(true);
    }
  };

  const handleMouseEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const handleMouseLeave = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
    }

    closeTimer.current = setTimeout(() => {
      setOpen(false);
    }, 220);
  };

  return (
    <aside
      className={`${styles.sidebar} ${open ? styles.open : styles.closed}`}
      onClick={handleSidebarClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={styles.topArea}>
        <AppLink
          href="/"
          className={styles.brand}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.brandMark}>HT</div>

          {open && (
            <div className={styles.brandText}>
              <strong className={styles.brandTitle}>Triel-HT</strong>
              <span className={styles.brandSubtitle}>Engenharia</span>
            </div>
          )}
        </AppLink>

        <button
          type="button"
          className={styles.toggleButton}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          aria-label={open ? "Recolher menu" : "Expandir menu"}
          title={open ? "Recolher menu" : "Expandir menu"}
        >
          {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <div className={styles.sectionLabel}>{open ? "Navegação" : "⋯"}</div>

      <nav className={styles.menu} onClick={(e) => e.stopPropagation()}>
        {menu.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.path;

          return (
            <AppLink
              key={item.path}
              href={item.path}
              className={`${styles.menuItem} ${active ? styles.active : ""}`}
              title={item.name}
            >
              <span className={styles.menuIcon}>
                <Icon size={18} />
              </span>

              {open && <span className={styles.menuText}>{item.name}</span>}
            </AppLink>
          );
        })}
      </nav>

      <div className={styles.bottomArea} onClick={(e) => e.stopPropagation()}>
        {open ? (
          <div className={styles.welcomeCard}>
            <span className={styles.welcomeMini}>Bem-vindo</span>
            <strong className={styles.welcomeTitle}>Portal da Engenharia</strong>
            <p className={styles.welcomeText}>
              Utilize o menu para acessar os módulos disponíveis.
            </p>
          </div>
        ) : (
          <div className={styles.collapsedDot} title="Portal da Engenharia" />
        )}
      </div>
    </aside>
  );
}