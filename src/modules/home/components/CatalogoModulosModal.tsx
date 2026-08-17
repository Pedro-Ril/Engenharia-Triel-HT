"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";

import AppLink from "@/components/AppLink";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { resolverIcone } from "@/lib/icons/icon-registry";
import type { SetorComStatusAcesso } from "@/lib/auth/autorizacao";
import styles from "@/app/home.module.css";

import { buscarCatalogoModulos } from "../services/home.service";

interface CatalogoModulosModalProps {
  open: boolean;
  onClose: () => void;
}

export function CatalogoModulosModal({
  open,
  onClose,
}: CatalogoModulosModalProps) {
  const [setores, setSetores] = useState<SetorComStatusAcesso[] | null>(null);

  useEffect(() => {
    if (!open || setores !== null) return;

    buscarCatalogoModulos().then(setSetores);
  }, [open, setores]);

  const totalModulos = setores?.reduce(
    (total, setor) => total + setor.modulos.length,
    0
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Catálogo de ferramentas"
      description="Todos os setores e módulos do portal — veja o que já está liberado para o seu usuário."
      size="large"
    >
      {setores === null ? (
        <Loader label="Carregando catálogo..." />
      ) : totalModulos === 0 ? (
        <p>Nenhum módulo cadastrado ainda.</p>
      ) : (
        <div className={styles.catalogoLista}>
          {setores
            .filter((setor) => setor.modulos.length > 0)
            .map((setor) => {
              const SetorIcon = resolverIcone(setor.icone);

              return (
                <div key={setor.id} className={styles.catalogoSetor}>
                  <div className={styles.setorSectionHeader}>
                    <span className={styles.setorSectionIcon}>
                      <SetorIcon size={17} />
                    </span>

                    <h3 className={styles.setorSectionTitle}>{setor.nome}</h3>
                  </div>

                  <div className={styles.catalogoModulosLista}>
                    {setor.modulos.map((modulo) => {
                      const ModuloIcon = resolverIcone(modulo.icone);
                      const conteudo = (
                        <>
                          <span className={styles.recentesItemIcon}>
                            <ModuloIcon size={17} />
                          </span>

                          <span className={styles.recentesItemNome}>
                            {modulo.nome}
                          </span>

                          {modulo.temAcesso ? (
                            <span className={styles.catalogoStatusLiberado}>
                              <CheckCircle2 size={14} />
                              Liberado
                            </span>
                          ) : (
                            <span className={styles.catalogoStatusBloqueado}>
                              <Lock size={13} />
                              Sem acesso
                            </span>
                          )}
                        </>
                      );

                      return modulo.temAcesso ? (
                        <AppLink
                          key={modulo.id}
                          href={modulo.path}
                          className={styles.recentesItem}
                          onClick={onClose}
                        >
                          {conteudo}
                        </AppLink>
                      ) : (
                        <div
                          key={modulo.id}
                          className={`${styles.recentesItem} ${styles.catalogoItemBloqueado}`}
                        >
                          {conteudo}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </Modal>
  );
}
