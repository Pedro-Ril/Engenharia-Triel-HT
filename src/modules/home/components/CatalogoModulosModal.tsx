"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";

import AppLink from "@/components/AppLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
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
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!open || setores !== null) return;

    let cancelado = false;

    buscarCatalogoModulos().then((resultado) => {
      if (cancelado) return;

      if (resultado === null) {
        setErro(true);
      } else {
        setErro(false);
        setSetores(resultado);
      }
    });

    return () => {
      cancelado = true;
    };
  }, [open, setores, tentativa]);

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
      {erro ? (
        <Alert variant="danger">
          <Stack gap={12}>
            <span>Não foi possível carregar o catálogo. Tente novamente.</span>
            <Stack direction="row">
              <Button variant="secondary" onClick={() => setTentativa((atual) => atual + 1)}>
                Tentar novamente
              </Button>
            </Stack>
          </Stack>
        </Alert>
      ) : setores === null ? (
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
