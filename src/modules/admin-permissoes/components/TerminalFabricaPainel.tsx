"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Search, SearchX, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormGrid } from "@/components/ui/FormGrid";
import { Loader } from "@/components/ui/Loader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import { buscarBuscasTerminalFabrica } from "../services/adminPermissoes.service";
import type { BuscasTerminalFabricaData } from "../services/adminPermissoes.service";
import adminStyles from "./AdminPermissoes.module.css";

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const POR_PAGINA_BUSCAS = 25;

export function TerminalFabricaPainel() {
  const [dados, setDados] = useState<BuscasTerminalFabricaData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let cancelado = false;

    buscarBuscasTerminalFabrica({ pagina, porPagina: POR_PAGINA_BUSCAS }).then((resultado) => {
      if (cancelado) return;
      setDados(resultado);
      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [pagina]);

  function handleMudarPagina(novaPagina: number) {
    setCarregando(true);
    setPagina(novaPagina);
  }

  if (carregando || !dados) {
    return <Loader label="Carregando buscas do terminal..." />;
  }

  const { buscas, total, resumo } = dados;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_BUSCAS));

  return (
    <Card
      title="Terminal de fábrica"
      description='Buscas feitas no terminal do chão de fábrica (tela pública, sem login — ver "/terminal-fabrica"). Fica nomeada quando quem buscou já estava logado no navegador do terminal.'
    >
      <Stack gap={20}>
        <FormGrid columns={3}>
          <StatCard
            label="Total de buscas"
            value={resumo.totalBuscas}
            icon={<Search />}
          />

          <StatCard
            label="Buscas hoje"
            value={resumo.buscasHoje}
            icon={<CheckCircle2 />}
            variant="info"
          />

          <StatCard
            label="Códigos não encontrados"
            value={resumo.naoEncontrados}
            icon={<SearchX />}
            variant={resumo.naoEncontrados > 0 ? "warning" : "neutral"}
          />
        </FormGrid>

        {buscas.length === 0 ? (
          <p>Nenhuma busca registrada no terminal ainda.</p>
        ) : (
          <>
            <Table minWidth={740}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell align="center">Status</TableHeaderCell>
                  <TableHeaderCell>Código buscado</TableHeaderCell>
                  <TableHeaderCell>Usuário</TableHeaderCell>
                  <TableHeaderCell>Origem</TableHeaderCell>
                  <TableHeaderCell>Data</TableHeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {buscas.map((busca) => (
                  <TableRow key={busca.id}>
                    <TableCell align="center">
                      <div className={adminStyles.checkboxCentro}>
                        {busca.encontrado ? (
                          <CheckCircle2
                            size={18}
                            color="#16a34a"
                            aria-label="Item encontrado"
                          />
                        ) : (
                          <XCircle
                            size={18}
                            color="#c62828"
                            aria-label="Item não encontrado"
                          />
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <strong>{busca.codigoBuscado}</strong>
                    </TableCell>

                    <TableCell>
                      {busca.usuarioNome ? (
                        busca.usuarioNome
                      ) : (
                        <Badge variant="neutral">Anônimo</Badge>
                      )}
                    </TableCell>

                    <TableCell>{busca.ipOrigem ?? "—"}</TableCell>

                    <TableCell>{formatarData(busca.buscadoEm)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination page={pagina} totalPages={totalPaginas} onPageChange={handleMudarPagina} />
          </>
        )}
      </Stack>
    </Card>
  );
}
