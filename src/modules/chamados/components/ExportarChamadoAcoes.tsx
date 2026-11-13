"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Stack } from "@/components/ui/Stack";
import { Toast } from "@/components/ui/Toast";

import type { Chamado } from "../types/chamados.types";
import {
  carregarChamadoParaExportar,
  exportarChamadoExcel,
  exportarChamadoPdf,
} from "../utils/exportarChamado";

type Formato = "pdf" | "excel";

interface ExportarChamadoAcoesProps {
  numero: number;
  /* Já carregado (tela do chamado) -- sem ele, busca pelo número (listas). */
  chamado?: Chamado;
  /* "icones" na coluna de ação das tabelas; "botoes" no topo do chamado. */
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

  if (aparencia === "botoes") {
    return (
      <>
        <Stack direction="row" gap={8}>
          <Button variant="secondary" onClick={() => exportar("pdf")} loading={gerando === "pdf"} loadingLabel="Gerando...">
            <FileText size={16} />
            PDF
          </Button>
          <Button variant="secondary" onClick={() => exportar("excel")} loading={gerando === "excel"} loadingLabel="Gerando...">
            <FileSpreadsheet size={16} />
            Excel
          </Button>
        </Stack>
        {aviso}
      </>
    );
  }

  /* Dentro de linha clicável (fila): o clique no botão não pode abrir o chamado. */
  return (
    <>
      <Stack direction="row" gap={4} onClick={(event) => event.stopPropagation()}>
        <IconButton
          icon={<FileText size={15} />}
          label={`Exportar chamado nº ${numero} em PDF`}
          size="small"
          loading={gerando === "pdf"}
          disabled={gerando !== null}
          onClick={() => exportar("pdf")}
        />
        <IconButton
          icon={<FileSpreadsheet size={15} />}
          label={`Exportar chamado nº ${numero} em Excel`}
          size="small"
          loading={gerando === "excel"}
          disabled={gerando !== null}
          onClick={() => exportar("excel")}
        />
      </Stack>
      {aviso}
    </>
  );
}
