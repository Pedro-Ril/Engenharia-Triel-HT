"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import styles from "./ColunasModal.module.css";
import {
  COLUNAS,
  COLUNAS_PADRAO,
  type ChaveColuna,
  type GrupoColuna,
} from "../constants/colunas";

/*
 * Escolha das colunas da tabela. As fixas (peça, descrição, ações)
 * aparecem marcadas e travadas, para ficar claro que existem e que não
 * saem -- esconder a opção só geraria a dúvida de onde ela foi parar.
 */

interface ColunasModalProps {
  open: boolean;
  colunas: ChaveColuna[];
  onAplicar: (colunas: ChaveColuna[]) => void;
  onClose: () => void;
}

/*
 * Montado só enquanto aberto (ver a página): assim a seleção começa
 * sempre do que está valendo, sem precisar de efeito para sincronizar.
 */
export function ColunasModal({ open, colunas, onAplicar, onClose }: ColunasModalProps) {
  const [selecao, setSelecao] = useState<ChaveColuna[]>(colunas);

  const grupos = useMemo(() => {
    const mapa = new Map<GrupoColuna, typeof COLUNAS>();

    for (const coluna of COLUNAS) {
      const atual = mapa.get(coluna.grupo) ?? [];
      atual.push(coluna);
      mapa.set(coluna.grupo, atual);
    }

    return [...mapa.entries()];
  }, []);

  function alternar(chave: ChaveColuna) {
    setSelecao((anterior) =>
      anterior.includes(chave)
        ? anterior.filter((item) => item !== chave)
        : [...anterior, chave]
    );
  }

  const totalVisiveis = COLUNAS.filter(
    (coluna) => coluna.fixa || selecao.includes(coluna.chave)
  ).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="large"
      title="Colunas da tabela"
      description="Escolha o que aparece na lista de peças. A escolha fica guardada para você."
      footer={
        <>
          <Button variant="secondary" onClick={() => setSelecao(COLUNAS_PADRAO)}>
            <RotateCcw size={15} />
            Restaurar padrão
          </Button>

          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>

          <Button onClick={() => onAplicar(selecao)}>Aplicar ({totalVisiveis} colunas)</Button>
        </>
      }
    >
      <div className={styles.grupos}>
        {grupos.map(([grupo, colunasDoGrupo]) => (
          <section key={grupo} className={styles.grupo}>
            <h3 className={styles.titulo}>{grupo}</h3>

            <Stack gap={8}>
              {colunasDoGrupo.map((coluna) => (
                <Checkbox
                  key={coluna.chave}
                  label={coluna.label}
                  hint={coluna.fixa ? "sempre visível" : undefined}
                  checked={coluna.fixa || selecao.includes(coluna.chave)}
                  disabled={coluna.fixa}
                  onChange={() => alternar(coluna.chave)}
                />
              ))}
            </Stack>
          </section>
        ))}
      </div>
    </Modal>
  );
}
