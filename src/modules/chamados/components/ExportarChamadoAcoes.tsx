"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Stack } from "@/components/ui/Stack";
import { Toast } from "@/components/ui/Toast";

import type { Chamado } from "../types/chamados.types";
import {
  carregarChamadoParaExportar,
  exportarChamadoExcel,
  exportarChamadoPdf,
} from "../utils/exportarChamado";
import styles from "./ExportarChamadoAcoes.module.css";

type Formato = "pdf" | "excel";

interface ExportarChamadoAcoesProps {
  numero: number;
  /* Já carregado (tela do chamado) -- sem ele, busca pelo número (listas). */
  chamado?: Chamado;
  /* "icones": menu ⋮ na coluna "Ações" das tabelas; "botoes": botão "Exportar" no card de ações do chamado. */
  aparencia?: "icones" | "botoes";
}

export function ExportarChamadoAcoes({ numero, chamado, aparencia = "icones" }: ExportarChamadoAcoesProps) {
  const [gerando, setGerando] = useState<Formato | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function exportar(formato: Formato) {
    setGerando(formato);
    setErro(null);

    try {
      const completo = chamado ?? (await carregarChamadoParaExportar(numero));
      if (formato === "pdf") exportarChamadoPdf(completo);
      else exportarChamadoExcel(completo);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível gerar o arquivo.");
    } finally {
      setGerando(null);
    }
  }

  const aviso = (
    <Toast
      open={erro !== null}
      variant="danger"
      title={`Não foi possível exportar o chamado nº ${numero}`}
      description={erro ?? undefined}
      onClose={() => setErro(null)}
    />
  );

  const itens = [
    {
      value: "pdf",
      label: "PDF",
      icon: <FileText size={15} />,
      onSelect: () => void exportar("pdf"),
    },
    {
      value: "excel",
      label: "Excel",
      icon: <FileSpreadsheet size={15} />,
      onSelect: () => void exportar("excel"),
    },
  ];

  /* Card "Ações" do chamado: botão "Exportar" que abre PDF / Excel. */
  if (aparencia === "botoes") {
    return (
      <>
        {gerando ? (
          <Button variant="secondary" loading loadingLabel="Gerando...">
            Exportar
          </Button>
        ) : (
          <DropdownMenu
            label={`Exportar chamado nº ${numero}`}
            align="start"
            triggerText="Exportar"
            triggerIcon={<Download aria-hidden="true" />}
            items={itens}
          />
        )}
        {aviso}
      </>
    );
  }

  /*
   * Coluna "Ações" das listas: um botão só, que abre o menu para escolher.
   * Dentro de linha clicável (fila): o clique não pode abrir o chamado --
   * vale também para os itens do menu, que mesmo desenhados fora da tabela
   * (portal) sobem o evento pela árvore do React até aqui.
   */
  return (
    <>
      <Stack direction="row" justify="center" onClick={(event) => event.stopPropagation()}>
        {gerando ? (
          <span className={styles.gerando} aria-live="polite">
            <Loader2 size={15} className={styles.girando} /> Gerando...
          </span>
        ) : (
          <DropdownMenu
            label={`Ações do chamado nº ${numero}`}
            items={itens.map((item) => ({ ...item, label: `Exportar ${item.label}` }))}
          />
        )}
      </Stack>
      {aviso}
    </>
  );
}
