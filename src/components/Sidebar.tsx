"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  LogIn,
  LogOut,
  Megaphone,
  ShieldCheck,
  User,
} from "lucide-react";

import { logout } from "@/modules/auth/services/auth.service";
import type { SetorComModulos } from "@/lib/auth/autorizacao";
import { resolverIcone } from "@/lib/icons/icon-registry";

import AppLink from "./AppLink";
import styles from "./Sidebar.module.css";

export interface UsuarioLogado {
  nomeExibicao: string;
  ehAdministrador: boolean;
}

type SidebarProps = {
  open: boolean;
  setOpen: (value: boolean) => void;
  setores: SetorComModulos[];
  usuario: UsuarioLogado | null;
};

const menuRodape = [
  {
    name: "Downloads",
    path: "/downloads",
    icon: Download,
  },
  {
    name: "Atualizações",
    path: "/atualizacoes",
    icon: Megaphone,
  },
];

export default function Sidebar({
  open,
  setOpen,
  setores,
  usuario,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Pastas começam fechadas — só abrem quando o usuário clica nelas. */
  const [setoresAbertos, setSetoresAbertos] = useState<Set<string>>(
    new Set()
  );
  const [saindo, setSaindo] = useState(false);

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

  const toggleSetor = (setorId: string) => {
    setSetoresAbertos((atual) => {
      const proximo = new Set(atual);

      if (proximo.has(setorId)) {
        proximo.delete(setorId);
      } else {
        proximo.add(setorId);
      }

      return proximo;
    });
  };

  const handleSair = async () => {
    setSaindo(true);

    try {
      await logout();
      router.push("/login");
      router.refresh();
    } finally {
      setSaindo(false);
    }
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
              <span className={styles.brandSubtitle}>Portal</span>
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
        {setores.map((setor) => {
          const SetorIcon = resolverIcone(setor.icone);
          const fechado = open && !setoresAbertos.has(setor.id);

          if (!open) {
            return (
              <div key={setor.id} className={styles.setorGrupo}>
                <button
                  type="button"
                  className={styles.menuItem}
                  title={setor.nome}
                  onClick={() => {
                    setSetoresAbertos((atual) => new Set(atual).add(setor.id));
                    setOpen(true);
                  }}
                >
                  <span className={styles.menuIcon}>
                    <SetorIcon size={18} />
                  </span>
                </button>
              </div>
            );
          }

          return (
            <div key={setor.id} className={styles.setorGrupo}>
              <button
                type="button"
                className={styles.setorHeader}
                onClick={() => toggleSetor(setor.id)}
              >
                <span className={styles.menuIcon}>
                  <SetorIcon size={16} />
                </span>

                <span className={styles.setorNome}>{setor.nome}</span>

                <ChevronDown
                  size={14}
                  className={`${styles.setorChevron} ${
                    fechado ? "" : styles.setorChevronAberto
                  }`}
                />
              </button>

              {!fechado &&
                setor.modulos.map((modulo) => {
                  const Icon = resolverIcone(modulo.icone);
                  const active = pathname === modulo.path;

                  return (
                    <AppLink
                      key={modulo.id}
                      href={modulo.path}
                      className={`${styles.menuItem} ${
                        active ? styles.active : ""
                      }`}
                      title={modulo.nome}
                    >
                      <span className={styles.menuIcon}>
                        <Icon size={18} />
                      </span>

                      {open && (
                        <span className={styles.menuText}>{modulo.nome}</span>
                      )}

                      {open && modulo.emDesenvolvimento && (
                        <span
                          className={styles.devBadge}
                          title="Em desenvolvimento — só administradores veem"
                        >
                          DEV
                        </span>
                      )}
                    </AppLink>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <div className={styles.bottomArea} onClick={(e) => e.stopPropagation()}>
        <nav className={styles.footerMenu}>
          {menuRodape.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.path || pathname?.startsWith(`${item.path}/`);

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

          {usuario?.ehAdministrador && (
            <AppLink
              href="/admin/permissoes"
              className={`${styles.menuItem} ${
                pathname === "/admin/permissoes" ? styles.active : ""
              }`}
              title="Administração"
            >
              <span className={styles.menuIcon}>
                <ShieldCheck size={18} />
              </span>

              {open && (
                <span className={styles.menuText}>Administração</span>
              )}
            </AppLink>
          )}
        </nav>

        {usuario ? (
          open ? (
            <div className={styles.welcomeCard}>
              <span className={styles.welcomeMini}>Conectado como</span>
              <strong className={styles.welcomeTitle}>
                {usuario.nomeExibicao}
              </strong>

              <div className={styles.contaAcoes}>
                <AppLink href="/minha-conta" className={styles.contaLink}>
                  <User size={14} />
                  Minha conta
                </AppLink>

                <button
                  type="button"
                  className={styles.sairButton}
                  onClick={handleSair}
                  disabled={saindo}
                >
                  <LogOut size={14} />
                  {saindo ? "Saindo..." : "Sair"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={styles.collapsedDot}
              title="Sair"
              onClick={handleSair}
              disabled={saindo}
            >
              <LogOut size={16} />
            </button>
          )
        ) : open ? (
          <AppLink href="/login" className={styles.entrarCard}>
            <LogIn size={16} />
            Entrar
          </AppLink>
        ) : (
          <AppLink
            href="/login"
            className={styles.collapsedDot}
            title="Entrar"
          >
            <LogIn size={16} />
          </AppLink>
        )}
      </div>
    </aside>
  );
}
