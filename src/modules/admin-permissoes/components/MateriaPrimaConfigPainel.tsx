"use client";

import { useEffect, useState } from "react";
import { Eye, RefreshCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
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

import {
  buscarConfigMateriaPrima,
  cancelarSincronizacaoMateriaPrimaAdmin,
  listarEmpresasComCatalogoMateriaPrima,
  listarItensMateriaPrimaCacheAdmin,
  listarLogsSincronizacaoMateriaPrima,
  salvarConfigMateriaPrima,
  sincronizarCatalogoMateriaPrimaAdmin,
} from "../services/adminPermissoes.service";
import type {
  ConfigMateriaPrima,
  EmpresaComCatalogo,
  ItemMateriaPrimaCache,
  LogSincronizacaoMateriaPrima,
} from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarDuracao(iniciadoEm: string, finalizadoEm: string | null): string {
  if (!finalizadoEm) return "—";

  const ms = new Date(finalizadoEm).getTime() - new Date(iniciadoEm).getTime();
  if (ms < 1000) return "< 1s";

  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `${segundos}s`;

  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${minutos}min ${resto}s`;
}

const STATUS_BADGE: Record<
  LogSincronizacaoMateriaPrima["status"],
  "success" | "danger" | "info" | "neutral"
> = {
  sucesso: "success",
  erro: "danger",
  em_andamento: "info",
  cancelado: "neutral",
};

const STATUS_LABEL: Record<LogSincronizacaoMateriaPrima["status"], string> = {
  sucesso: "Sucesso",
  erro: "Erro",
  em_andamento: "Em andamento",
  cancelado: "Cancelado",
};

interface MateriaPrimaConfigPainelProps {
  onFeedback: FeedbackHandler;
}

export function MateriaPrimaConfigPainel({ onFeedback }: MateriaPrimaConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);

  const [config, setConfig] = useState<ConfigMateriaPrima | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [intervaloMinutos, setIntervaloMinutos] = useState("");
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const [empresas, setEmpresas] = useState<EmpresaComCatalogo[]>([]);
  const [sincronizandoEmpresa, setSincronizandoEmpresa] = useState<string | null>(null);
  const [novoCodEmpresa, setNovoCodEmpresa] = useState("");

  const [logs, setLogs] = useState<LogSincronizacaoMateriaPrima[]>([]);
  const [cancelandoLogId, setCancelandoLogId] = useState<string | null>(null);

  const [empresaVisualizada, setEmpresaVisualizada] = useState<string | null>(null);
  const [itensModal, setItensModal] = useState<ItemMateriaPrimaCache[]>([]);
  const [carregandoItensModal, setCarregandoItensModal] = useState(false);
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [paginaItensModal, setPaginaItensModal] = useState(1);
  const [totalPaginasModal, setTotalPaginasModal] = useState(1);
  const [totalRegistrosModal, setTotalRegistrosModal] = useState(0);

  async function carregarTudo() {
    const [configData, empresasData, logsData] = await Promise.all([
      buscarConfigMateriaPrima(),
      listarEmpresasComCatalogoMateriaPrima(),
      listarLogsSincronizacaoMateriaPrima(),
    ]);

    setConfig(configData);
    setApiBaseUrl(configData?.apiBaseUrl ?? "");
    setIntervaloMinutos(
      configData?.intervaloSincronizacaoMinutos
        ? String(configData.intervaloSincronizacaoMinutos)
        : ""
    );
    setEmpresas(empresasData);
    setLogs(logsData);
  }

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      await carregarTudo();
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvarConfig() {
    setSalvandoConfig(true);

    try {
      const resultado = await salvarConfigMateriaPrima({
        apiBaseUrl,
        intervaloSincronizacaoMinutos: intervaloMinutos.trim()
          ? Number(intervaloMinutos)
          : null,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        onFeedback("success", "Configuração salva", "As alterações já valem para a próxima sincronização.");
      } else {
        onFeedback(
          "danger",
          "Não foi possível salvar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function handleSincronizar(codEmpresa: string) {
    setSincronizandoEmpresa(codEmpresa);

    try {
      const resultado = await sincronizarCatalogoMateriaPrimaAdmin(codEmpresa);

      if (resultado.ok) {
        onFeedback(
          "success",
          "Sincronização concluída",
          resultado.message ?? "Catálogo atualizado."
        );
        setNovoCodEmpresa("");
        await carregarTudo();
      } else {
        onFeedback(
          "danger",
          "Não foi possível sincronizar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSincronizandoEmpresa(null);
    }
  }

  function handleSincronizarNovaEmpresa() {
    const codigo = novoCodEmpresa.trim();
    if (!codigo) return;
    handleSincronizar(codigo);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      setBuscaAplicada(buscaDigitada);
      setPaginaItensModal(1);
    }, 400);

    return () => clearTimeout(timeout);
  }, [buscaDigitada]);

  useEffect(() => {
    if (!empresaVisualizada) return;

    let cancelado = false;

    async function carregarItensModal() {
      setCarregandoItensModal(true);

      const resultado = await listarItensMateriaPrimaCacheAdmin({
        codEmpresa: empresaVisualizada as string,
        pagina: paginaItensModal,
        busca: buscaAplicada,
      });

      if (cancelado) return;

      if (resultado.ok && resultado.data) {
        setItensModal(resultado.data.itens);
        setTotalPaginasModal(resultado.data.totalPaginas);
        setTotalRegistrosModal(resultado.data.totalRegistros);
      } else {
        onFeedback(
          "danger",
          "Não foi possível carregar os itens",
          resultado.message ?? "Tente novamente em instantes."
        );
      }

      setCarregandoItensModal(false);
    }

    carregarItensModal();

    return () => {
      cancelado = true;
    };
  }, [empresaVisualizada, paginaItensModal, buscaAplicada, onFeedback]);

  function handleVerItens(codEmpresa: string) {
    setEmpresaVisualizada(codEmpresa);
    setBuscaDigitada("");
    setBuscaAplicada("");
    setPaginaItensModal(1);
  }

  function handleFecharModalItens() {
    setEmpresaVisualizada(null);
    setItensModal([]);
  }

  async function handleCancelar(log: LogSincronizacaoMateriaPrima) {
    setCancelandoLogId(log.id);

    try {
      const resultado = await cancelarSincronizacaoMateriaPrimaAdmin(log.codEmpresa);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Cancelamento solicitado" : "Não foi possível cancelar",
        resultado.message ?? "Tente novamente em instantes."
      );

      await carregarTudo();
    } finally {
      setCancelandoLogId(null);
    }
  }

  if (carregando) {
    return <Loader label="Carregando configuração de matéria-prima..." />;
  }

  return (
    <Stack gap={20}>
      <Card
        title="Configuração da API do ERP"
        description="Usada pela busca de matérias-primas (De-Para de MP, Engenharia de Manufatura)."
      >
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field
              label="URL base da API"
              htmlFor="apiBaseUrl"
              hint="Ex: http://proserver.trielht.com.br:1000"
            >
              <Input
                id="apiBaseUrl"
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                disabled={salvandoConfig}
              />
            </Field>

            <Field
              label="Sincronização automática (minutos)"
              htmlFor="intervaloMinutos"
              hint="Deixe em branco para desativar — a sincronização passa a ser só manual"
            >
              <NumberInput
                id="intervaloMinutos"
                min={0}
                value={intervaloMinutos}
                onChange={(event) => setIntervaloMinutos(event.target.value)}
                disabled={salvandoConfig}
              />
            </Field>
          </FormGrid>

          {config?.atualizadoEm && (
            <p>
              Última alteração: {formatarData(config.atualizadoEm)}
              {config.atualizadoPor && ` por ${config.atualizadoPor}`}
            </p>
          )}

          <Stack direction="row" justify="end">
            <Button onClick={handleSalvarConfig} loading={salvandoConfig}>
              Salvar configuração
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card
        title="Empresas sincronizadas"
        description="Só aparecem aqui empresas que já foram sincronizadas ao menos uma vez. Para uma empresa nova, informe o código dela abaixo."
      >
        <Stack gap={16}>
          <Field label="Sincronizar uma empresa" htmlFor="novoCodEmpresa" hint="Código da empresa (cod_emp no ERP)">
            <Stack direction="row" gap={10}>
              <Input
                id="novoCodEmpresa"
                value={novoCodEmpresa}
                onChange={(event) => setNovoCodEmpresa(event.target.value)}
                placeholder="Ex: 2"
                disabled={sincronizandoEmpresa !== null}
              />

              <Button
                onClick={handleSincronizarNovaEmpresa}
                loading={sincronizandoEmpresa === novoCodEmpresa.trim() && novoCodEmpresa.trim() !== ""}
                disabled={sincronizandoEmpresa !== null || !novoCodEmpresa.trim()}
              >
                Sincronizar
              </Button>
            </Stack>
          </Field>

          {empresas.length === 0 ? (
            <p>Nenhuma empresa sincronizada ainda.</p>
          ) : (
          <Table minWidth={600}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Código da empresa</TableHeaderCell>
                <TableHeaderCell align="center">Itens no catálogo</TableHeaderCell>
                <TableHeaderCell>Última sincronização</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {empresas.map((empresa) => (
                <TableRow key={empresa.codEmpresa}>
                  <TableCell>
                    <strong>{empresa.codEmpresa}</strong>
                  </TableCell>
                  <TableCell align="center">{empresa.totalItens}</TableCell>
                  <TableCell>{formatarData(empresa.ultimaSincronizacao)}</TableCell>
                  <TableCell align="center">
                    <Stack direction="row" justify="center">
                      <IconButton
                        icon={<RefreshCw size={15} />}
                        label="Sincronizar agora"
                        size="small"
                        onClick={() => handleSincronizar(empresa.codEmpresa)}
                        disabled={sincronizandoEmpresa !== null}
                        loading={sincronizandoEmpresa === empresa.codEmpresa}
                      />
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </Stack>
      </Card>

      <Card title="Logs de sincronização" description="Últimas 50 execuções (manuais e automáticas).">
        {logs.length === 0 ? (
          <p>Nenhuma sincronização registrada ainda.</p>
        ) : (
          <Table minWidth={950}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Empresa</TableHeaderCell>
                <TableHeaderCell>Início</TableHeaderCell>
                <TableHeaderCell>Duração</TableHeaderCell>
                <TableHeaderCell align="center">Tipo</TableHeaderCell>
                <TableHeaderCell align="center">Status</TableHeaderCell>
                <TableHeaderCell align="center">Itens</TableHeaderCell>
                <TableHeaderCell>Disparado por</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{log.codEmpresa}</TableCell>
                  <TableCell>{formatarData(log.iniciadoEm)}</TableCell>
                  <TableCell>{formatarDuracao(log.iniciadoEm, log.finalizadoEm)}</TableCell>
                  <TableCell align="center">
                    <Badge variant={log.disparadoPor ? "primary" : "neutral"}>
                      {log.disparadoPor ? "Manual" : "Automático"}
                    </Badge>
                  </TableCell>
                  <TableCell align="center">
                    <Badge variant={STATUS_BADGE[log.status]}>{STATUS_LABEL[log.status]}</Badge>
                  </TableCell>
                  <TableCell align="center">{log.totalItens ?? "—"}</TableCell>
                  <TableCell>{log.disparadoPor ?? "—"}</TableCell>
                  <TableCell align="center">
                    <Stack direction="row" justify="center" gap={6}>
                      {log.status === "sucesso" && (
                        <IconButton
                          icon={<Eye size={15} />}
                          label="Ver itens sincronizados"
                          size="small"
                          onClick={() => handleVerItens(log.codEmpresa)}
                        />
                      )}

                      {log.status === "em_andamento" && (
                        <IconButton
                          icon={<XCircle size={15} />}
                          label="Cancelar sincronização"
                          size="small"
                          variant="danger"
                          onClick={() => handleCancelar(log)}
                          loading={cancelandoLogId === log.id}
                          disabled={cancelandoLogId !== null}
                        />
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        open={empresaVisualizada !== null}
        title={`Itens sincronizados — empresa ${empresaVisualizada ?? ""}`}
        description="Reflete o catálogo espelhado atual dessa empresa. Se ela foi sincronizada de novo depois deste log, a lista mostra o resultado mais recente, não uma foto exata daquela execução."
        size="large"
        onClose={handleFecharModalItens}
      >
        <Stack gap={16}>
          <Input
            value={buscaDigitada}
            onChange={(event) => setBuscaDigitada(event.target.value)}
            placeholder="Buscar por código ou descrição"
          />

          {carregandoItensModal ? (
            <Loader label="Carregando itens..." />
          ) : itensModal.length === 0 ? (
            <p>Nenhum item encontrado.</p>
          ) : (
            <>
              <p>{totalRegistrosModal} item(ns) no total.</p>

              <Table minWidth={650}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Código</TableHeaderCell>
                    <TableHeaderCell>Descrição</TableHeaderCell>
                    <TableHeaderCell>Unidade</TableHeaderCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {itensModal.map((item) => (
                    <TableRow key={item.codigo}>
                      <TableCell>
                        <strong>{item.codigo}</strong>
                      </TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell>{item.unidadeMedida ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination
                page={paginaItensModal}
                totalPages={totalPaginasModal}
                onPageChange={setPaginaItensModal}
              />
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
