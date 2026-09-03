"use client";

import { useState } from "react";
import { Home } from "lucide-react";
import * as XLSX from "xlsx";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Toast } from "@/components/ui/Toast";

import styles from "./ConversorTxtRhPage.module.css";

interface LinhaPlanilha {
  COD_FUNCIONARIO?: unknown;
  COD_EVENTO?: unknown;
  VALOR_EVENTO?: unknown;
}

/*
 * As duas variantes abaixo (Mores/System) são EXATAMENTE a mesma
 * lógica de conversão do arquivo original (Conversor_TXT_RH/script.js
 * — convertFile/convertFile2), só reorganizada em TypeScript: mesmas
 * 8 colunas de largura fixa, mesmo padStart em cada campo, mesma
 * regra de valor (centavos sem separador). A ÚNICA diferença real
 * entre as duas é o terminador de cada linha — "Mores" fecha com
 * ";\n", "System" só com "\n" — por isso não dá pra unificar num
 * único botão sem perder essa distinção que já existia.
 */
function montarLinha(row: LinhaPlanilha): string {
  return [
    "0",
    "0034",
    "000",
    String(row.COD_FUNCIONARIO).padStart(9, "0"),
    String(row.COD_EVENTO).padStart(4, "0"),
    "0000",
    "00000000000",
    Number(row.VALOR_EVENTO).toFixed(2).replace(".", "").padStart(11, "0"),
  ].join(";");
}

function lerPlanilha(file: File): Promise<LinhaPlanilha[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<LinhaPlanilha>(ws);

        if (!json[0]?.COD_FUNCIONARIO || !json[0]?.COD_EVENTO || !json[0]?.VALOR_EVENTO) {
          reject(
            new Error(
              "O arquivo precisa das colunas: COD_FUNCIONARIO, COD_EVENTO, VALOR_EVENTO"
            )
          );
          return;
        }

        resolve(json);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Falha ao ler o arquivo."));
      }
    };

    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsBinaryString(file);
  });
}

function baixarTxt(conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "saida.txt";
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function ConversorTxtRhPage() {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [processando, setProcessando] = useState(false);
  const [toast, setToast] = useState<{
    open: boolean;
    variant: "success" | "danger";
    titulo: string;
  }>({ open: false, variant: "success", titulo: "" });

  async function converter(separadorPorLinha: ";\n" | "\n") {
    const file = arquivos[0];

    if (!file) {
      setToast({
        open: true,
        variant: "danger",
        titulo: "Selecione um arquivo de Excel antes de converter.",
      });
      return;
    }

    setProcessando(true);

    try {
      const linhas = await lerPlanilha(file);

      let txtContent = "";
      for (const row of linhas) {
        try {
          txtContent += montarLinha(row) + separadorPorLinha;
        } catch (error) {
          console.error(`Erro ao processar linha: ${error}`);
        }
      }

      baixarTxt(txtContent);
      setToast({
        open: true,
        variant: "success",
        titulo: "Conversão completa! O arquivo saida.txt foi baixado.",
      });
    } catch (error) {
      const texto = error instanceof Error ? error.message : "Erro ao converter o arquivo.";
      setToast({ open: true, variant: "danger", titulo: texto });
    } finally {
      setProcessando(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Conversor TXT RH"
        description="Converte uma planilha de eventos de folha (COD_FUNCIONARIO, COD_EVENTO, VALOR_EVENTO) num TXT de largura fixa pronto pra importar."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home /> },
          { label: "Conversor TXT RH" },
        ]}
      />

      <Stack gap={20}>
        <Card title="1. Selecionar a planilha">
          <Stack gap={16}>
            <Field
              label="Arquivo de Excel"
              hint="Precisa ter as colunas COD_FUNCIONARIO, COD_EVENTO e VALOR_EVENTO — veja o modelo abaixo."
            >
              <FileUpload
                accept=".xls,.xlsx"
                maxSizeMB={10}
                files={arquivos}
                onFilesChange={setArquivos}
              />
            </Field>

            <Stack direction="row" gap={10} wrap>
              <a href="/conversor-txt-rh/MODELO.xlsx" download className={styles.downloadLink}>
                Baixar planilha modelo
              </a>
              <a
                href="/conversor-txt-rh/INSTRUCOES-DE-USO.txt"
                download
                className={styles.downloadLink}
              >
                Baixar instrução de uso
              </a>
            </Stack>
          </Stack>
        </Card>

        <Card title="2. Converter">
          <Stack direction="row" gap={10} wrap>
            

            <Button onClick={() => converter("\n")} loading={processando}>
              Converter para System
            </Button>

            <Button
              variant="secondary"
              onClick={() => converter(";\n")}
              loading={processando}
            >
              Converter para Mores
            </Button>
          </Stack>
        </Card>
      </Stack>

      <Toast
        open={toast.open}
        title={toast.titulo}
        variant={toast.variant}
        onClose={() => setToast((atual) => ({ ...atual, open: false }))}
      />
    </PageContainer>
  );
}
