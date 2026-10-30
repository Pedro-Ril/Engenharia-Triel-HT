"use client";

import { useCallback, useState } from "react";
import { Braces } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";

import styles from "./EngenhariaVersatil.module.css";

export interface AvisoErp {
  variante: "success" | "danger" | "warning";
  titulo: string;
  descricao: string;
  /* O que vai no JSON: enviado + resposta de cada chamada ao ERP. */
  retorno: unknown;
}

/*
 * Aviso flutuante depois de falar com o ERP -- certo ou errado -- com o
 * atalho para o retorno completo (JSON do que foi enviado e do que o ERP
 * respondeu), no mesmo espírito do "Retorno do ERP" do Roteiro de
 * Fabricação.
 */
export function RetornoErpAviso({ aviso, onFechar }: { aviso: AvisoErp | null; onFechar: () => void }) {
  const [retornoAberto, setRetornoAberto] = useState<unknown>(null);
  const fechar = useCallback(() => onFechar(), [onFechar]);

  return (
    <>
      <Toast
        open={aviso !== null}
        variant={aviso?.variante ?? "info"}
        title={aviso?.titulo ?? ""}
        duration={aviso?.variante === "success" ? 10000 : 0}
        onClose={fechar}
        description={
          aviso ? (
            <span className={styles.avisoErp}>
              {aviso.descricao}
              <button
                type="button"
                className={styles.linkJson}
                onClick={() => {
                  setRetornoAberto(aviso.retorno);
                  fechar();
                }}
              >
                Ver retorno completo do ERP
              </button>
            </span>
          ) : undefined
        }
      />

      <Modal
        open={retornoAberto !== null}
        title="Retorno do ERP"
        description="Tudo o que foi enviado ao ERP e o que ele respondeu, chamada a chamada."
        size="large"
        onClose={() => setRetornoAberto(null)}
        footer={
          <Button variant="secondary" onClick={() => setRetornoAberto(null)}>
            Fechar
          </Button>
        }
      >
        <pre className={styles.json}>
          <Braces size={14} aria-hidden="true" className={styles.jsonIcone} />
          {JSON.stringify(retornoAberto, null, 2)}
        </pre>
      </Modal>
    </>
  );
}
