"use client";

import { useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import { buscarResumoMaquinas, listarEventos } from "../services/workstationsNvidia.service";
import type { MaquinaNvidia, PaginaEventosNvidia } from "../types/workstationsNvidia.types";
import { formatarDataHora, TIPO_EVENTO } from "../utils/exibicao";
import styles from "./WorkstationsNvidia.module.css";

export function HistoricoNvidiaPainel() {
  const [maquinas, setMaquinas] = useState<MaquinaNvidia[]>([]);
  const [maquinaId, setMaquinaId] = useState("");
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState<PaginaEventosNvidia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    let cancelado = false;
    buscarResumoMaquinas().then((resposta) => {
      if (!cancelado && resposta.ok && resposta.data) setMaquinas(resposta.data.maquinas);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;

    listarEventos({ maquinaId: maquinaId || null, pagina }).then((resposta) => {
      if (cancelado) return;
      setResultado(resposta.ok && resposta.data ? resposta.data : null);
      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [maquinaId, pagina, recarregar]);

  const totalPaginas = resultado ? Math.max(1, Math.ceil(resultado.total / resultado.tamanhoPagina)) : 1;

  const opcoesMaquina = [
    { value: "", label: "Todas as máquinas" },
    ...maquinas.map((maquina) => ({ value: maquina.id, label: maquina.computador })),
  ];

  return (
    <Card
      title="Histórico"
      description="Eventos registrados pelo portal ao comparar cada coleta com a anterior."
      actions={
        <Stack direction="row" gap={8} align="center">
          <div style={{ width: 220 }}>
            <Dropdown
              value={maquinaId}
              options={opcoesMaquina}
              onValueChange={(valor) => {
                setMaquinaId(valor);
                setPagina(1);
              }}
            />
          </div>
          <Button variant="secondary" onClick={() => setRecarregar((valor) => valor + 1)}>
            <RefreshCw size={15} />
            Atualizar
          </Button>
        </Stack>
      }
    >
      {carregando ? (
        <Loader label="Carregando histórico..." />
      ) : !resultado || resultado.eventos.length === 0 ? (
        <EmptyState
          icon={<History size={26} />}
          title="Nenhum evento ainda"
          description="Os eventos aparecem aqui quando o driver muda, o perfil é reaplicado, uma máquina fica sem contato ou o perfil oficial é publicado."
        />
      ) : (
        <Stack gap={16}>
          <Table minWidth={820}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Quando</TableHeaderCell>
                <TableHeaderCell>Máquina</TableHeaderCell>
                <TableHeaderCell>Evento</TableHeaderCell>
                <TableHeaderCell>Detalhes</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {resultado.eventos.map((evento) => (
                <TableRow key={evento.id}>
                  <TableCell style={{ whiteSpace: "nowrap" }}>{formatarDataHora(evento.ocorridoEm)}</TableCell>
                  <TableCell>{evento.computador ?? <span className={styles.textoSecundario}>geral</span>}</TableCell>
                  <TableCell>
                    <Badge variant={TIPO_EVENTO[evento.tipo]?.variante ?? "neutral"}>
                      {TIPO_EVENTO[evento.tipo]?.label ?? evento.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={styles.descricaoEvento}>{evento.descricao}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPaginas > 1 && (
            <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
          )}
        </Stack>
      )}
    </Card>
  );
}
