"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import {
  CHAVE_MASCARA_NUMERO_SEQUENCIAL,
  OPCOES_CAMPO_MASCARA_NF,
} from "@/modules/estoque-equipamentos-usados/constants";
import {
  buscarConfigErpEstoqueUsados,
  salvarConfigErpEstoqueUsados,
  sincronizarExtratoEstoqueUsados,
} from "../services/adminPermissoes.service";
import type { ConfigErpEstoqueUsados, ResultadoSincronizacaoExtrato } from "../types/adminPermissoes.types";

const STATUS_LABEL: Record<string, string> = {
  em_estoque: "Em estoque",
  emprestado: "Emprestado",
  consignado: "Em consignação",
  em_reforma: "Em reforma/conserto",
  baixado: "Baixado",
};
import type { FeedbackHandler } from "../types/toast.types";

interface EstoqueEquipamentosUsadosConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function EstoqueEquipamentosUsadosConfigPainel({
  onFeedback,
}: EstoqueEquipamentosUsadosConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfigErpEstoqueUsados | null>(null);

  const [urlValidarItem, setUrlValidarItem] = useState("");
  const [urlValidarItemTeste, setUrlValidarItemTeste] = useState("");
  const [urlClientes, setUrlClientes] = useState("");
  const [urlClientesTeste, setUrlClientesTeste] = useState("");
  const [usarAmbienteTeste, setUsarAmbienteTeste] = useState(false);
  const [chaveApi, setChaveApi] = useState("");
  const [urlNfEntrada, setUrlNfEntrada] = useState("");
  const [urlNfEntradaTeste, setUrlNfEntradaTeste] = useState("");
  const [urlNfSaida, setUrlNfSaida] = useState("");
  const [urlNfSaidaTeste, setUrlNfSaidaTeste] = useState("");
  const [intervaloVerificacaoNf, setIntervaloVerificacaoNf] = useState("");
  const [campoMascaraChave, setCampoMascaraChave] = useState(CHAVE_MASCARA_NUMERO_SEQUENCIAL);
  const [urlExtrato, setUrlExtrato] = useState("");
  const [urlExtratoTeste, setUrlExtratoTeste] = useState("");
  const [intervaloExtrato, setIntervaloExtrato] = useState("60");
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState<"simular" | "aplicar" | null>(null);
  const [confirmandoSincronizar, setConfirmandoSincronizar] = useState(false);
  const [resultadoExtrato, setResultadoExtrato] = useState<{
    simular: boolean;
    resultados: ResultadoSincronizacaoExtrato[];
  } | null>(null);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const dados = await buscarConfigErpEstoqueUsados();
      setConfig(dados);
      setUrlValidarItem(dados?.urlValidarItem ?? "");
      setUrlValidarItemTeste(dados?.urlValidarItemTeste ?? "");
      setUrlClientes(dados?.urlClientes ?? "");
      setUrlClientesTeste(dados?.urlClientesTeste ?? "");
      setUsarAmbienteTeste(dados?.usarAmbienteTeste ?? false);
      setChaveApi(dados?.chaveApi ?? "");
      setUrlNfEntrada(dados?.urlNfEntrada ?? "");
      setUrlNfEntradaTeste(dados?.urlNfEntradaTeste ?? "");
      setUrlNfSaida(dados?.urlNfSaida ?? "");
      setUrlNfSaidaTeste(dados?.urlNfSaidaTeste ?? "");
      setIntervaloVerificacaoNf(
        dados?.intervaloVerificacaoNfMinutos ? String(dados.intervaloVerificacaoNfMinutos) : ""
      );
      setCampoMascaraChave(dados?.campoMascaraChave ?? CHAVE_MASCARA_NUMERO_SEQUENCIAL);
      setUrlExtrato(dados?.urlExtrato ?? "");
      setUrlExtratoTeste(dados?.urlExtratoTeste ?? "");
      setIntervaloExtrato(String(dados?.intervaloExtratoMinutos ?? 60));
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarConfigErpEstoqueUsados({
        urlValidarItem: urlValidarItem.trim() || null,
        urlValidarItemTeste: urlValidarItemTeste.trim() || null,
        urlClientes: urlClientes.trim() || null,
        urlClientesTeste: urlClientesTeste.trim() || null,
        usarAmbienteTeste,
        chaveApi: chaveApi.trim() || null,
        urlNfEntrada: urlNfEntrada.trim() || null,
        urlNfEntradaTeste: urlNfEntradaTeste.trim() || null,
        urlNfSaida: urlNfSaida.trim() || null,
        urlNfSaidaTeste: urlNfSaidaTeste.trim() || null,
        intervaloVerificacaoNfMinutos: intervaloVerificacaoNf.trim() ? Number(intervaloVerificacaoNf) : null,
        campoMascaraChave,
        urlExtrato: urlExtrato.trim() || null,
        urlExtratoTeste: urlExtratoTeste.trim() || null,
        intervaloExtratoMinutos: Number(intervaloExtrato) || 60,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        onFeedback("success", "Configuração salva", "O endpoint já vale para a próxima validação.");
      } else {
        onFeedback(
          "danger",
          "Não foi possível salvar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleSincronizar(simular: boolean) {
    setConfirmandoSincronizar(false);
    setSincronizando(simular ? "simular" : "aplicar");
    try {
      const resposta = await sincronizarExtratoEstoqueUsados(simular);
      if (resposta.ok && resposta.data) {
        setResultadoExtrato(resposta.data);
        onFeedback("success", simular ? "Simulação concluída" : "Sincronização concluída", resposta.message ?? "");
      } else {
        onFeedback("danger", "Não foi possível consultar o extrato", resposta.message ?? "Tente novamente.");
      }
    } finally {
      setSincronizando(null);
    }
  }

  const urlExtratoAtiva = usarAmbienteTeste ? config?.urlExtratoTeste : config?.urlExtrato;

  if (carregando) {
    return <Loader label="Carregando configuração..." />;
  }

  return (
    <Card
      title="Estoque de Equipamentos Usados"
      description="Endpoints do ERP usados nesse módulo."
    >
      <Stack gap={20}>
        <Stack
          direction="row"
          align="center"
          justify="between"
          style={{
            padding: "12px 16px",
            background: "var(--bg-surface-muted)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <Switch
            label="Usar ambiente de teste"
            checked={usarAmbienteTeste}
            onChange={(event) => setUsarAmbienteTeste(event.target.checked)}
            disabled={salvando}
          />
          <Badge variant={usarAmbienteTeste ? "warning" : "success"}>
            {usarAmbienteTeste ? "Ambiente ativo: Teste" : "Ambiente ativo: Produção"}
          </Badge>
        </Stack>

        <FormGrid columns={2}>
          <Field
            label="URL de clientes — Produção"
            htmlFor="urlClientes"
            hint="Endpoint que alimenta o autocomplete do campo Cliente na entrada de equipamento"
          >
            <Input
              id="urlClientes"
              value={urlClientes}
              onChange={(event) => setUrlClientes(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field label="URL de clientes — Teste" htmlFor="urlClientesTeste">
            <Input
              id="urlClientesTeste"
              value={urlClientesTeste}
              onChange={(event) => setUrlClientesTeste(event.target.value)}
              disabled={salvando}
            />
          </Field>
        </FormGrid>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div>
            <strong>Job automático — busca de NF de entrada</strong>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
              A cada intervalo configurado, procura equipamentos sem NF de entrada e consulta o ERP por
              empresa + cliente + o campo mapeado abaixo como &ldquo;mascara&rdquo; (número do carro).
              Preenche NF, data de entrada, código do item e ID configurado automaticamente quando
              encontra.
            </p>
          </div>

          <FormGrid columns={2}>
            <Field
              label="URL de NF de entrada — Produção"
              htmlFor="urlNfEntrada"
              hint="Ex: http://proserver.trielht.com.br:1000/api/nfentrada"
            >
              <Input
                id="urlNfEntrada"
                value={urlNfEntrada}
                onChange={(event) => setUrlNfEntrada(event.target.value)}
                disabled={salvando}
              />
            </Field>

            <Field label="URL de NF de entrada — Teste" htmlFor="urlNfEntradaTeste">
              <Input
                id="urlNfEntradaTeste"
                value={urlNfEntradaTeste}
                onChange={(event) => setUrlNfEntradaTeste(event.target.value)}
                disabled={salvando}
              />
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field
              label="Intervalo de verificação (minutos)"
              htmlFor="intervaloVerificacaoNf"
              hint="Deixe em branco para desativar o job — passa a ser preenchido só manualmente"
            >
              <NumberInput
                id="intervaloVerificacaoNf"
                min={0}
                value={intervaloVerificacaoNf}
                onChange={(event) => setIntervaloVerificacaoNf(event.target.value)}
                disabled={salvando}
              />
            </Field>

            <Field
              label='Campo usado como "mascara" (número do carro)'
              htmlFor="campoMascaraChave"
              hint="De-para: qual campo do equipamento é enviado como número do carro na consulta"
            >
              <Dropdown
                value={campoMascaraChave}
                options={OPCOES_CAMPO_MASCARA_NF.map((opcao) => ({ value: opcao.chave, label: opcao.rotulo }))}
                onValueChange={setCampoMascaraChave}
                disabled={salvando}
              />
            </Field>
          </FormGrid>

          {config?.ultimaExecucaoNfEm && (
            <p>Última verificação automática: {formatarData(config.ultimaExecucaoNfEm)}</p>
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div>
            <strong>NF de saída — empréstimo, consignação e venda</strong>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
              Sem job automático — consultado na hora em que o usuário digita/sai do campo &ldquo;Número
              da NF&rdquo; num desses três modais, preenchendo o destinatário e o valor automaticamente
              quando encontra.
            </p>
          </div>

          <FormGrid columns={2}>
            <Field
              label="URL de NF de saída — Produção"
              htmlFor="urlNfSaida"
              hint="Ex: http://proserver.trielht.com.br:1000/api/nfsaida"
            >
              <Input
                id="urlNfSaida"
                value={urlNfSaida}
                onChange={(event) => setUrlNfSaida(event.target.value)}
                disabled={salvando}
              />
            </Field>

            <Field label="URL de NF de saída — Teste" htmlFor="urlNfSaidaTeste">
              <Input
                id="urlNfSaidaTeste"
                value={urlNfSaidaTeste}
                onChange={(event) => setUrlNfSaidaTeste(event.target.value)}
                disabled={salvando}
              />
            </Field>
          </FormGrid>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div>
            <strong>Extrato do item — movimentações e status</strong>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
              Depois que a NF de entrada identifica o equipamento no ERP, o Portal lê o extrato do item a cada
              intervalo e o status passa a seguir o ERP (empréstimo, consignação, reforma, retorno, venda). Só para
              de consultar quando o equipamento é baixado. Sem URL, a sincronização fica desligada.
            </p>
          </div>

          <FormGrid columns={3}>
            <Field
              label="URL do extrato — Produção"
              htmlFor="urlExtrato"
              hint="Ex: http://proserver.trielht.com.br:1000/api/estoque-usados/extrato"
            >
              <Input id="urlExtrato" value={urlExtrato} onChange={(e) => setUrlExtrato(e.target.value)} disabled={salvando} />
            </Field>
            <Field label="URL do extrato — Teste" htmlFor="urlExtratoTeste">
              <Input
                id="urlExtratoTeste"
                value={urlExtratoTeste}
                onChange={(e) => setUrlExtratoTeste(e.target.value)}
                disabled={salvando}
              />
            </Field>
            <Field label="Intervalo (minutos)" htmlFor="intervaloExtrato" hint="De 15 a 1440. Padrão: 60.">
              <NumberInput
                id="intervaloExtrato"
                min={15}
                max={1440}
                value={intervaloExtrato}
                onChange={(e) => setIntervaloExtrato(e.target.value)}
                disabled={salvando}
              />
            </Field>
          </FormGrid>

          <Stack direction="row" justify="between" align="center" wrap>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Última sincronização automática: {formatarData(config?.ultimaExecucaoExtratoEm ?? null)}
            </span>
            <Stack direction="row" gap={8}>
              <Button
                variant="secondary"
                onClick={() => handleSincronizar(true)}
                loading={sincronizando === "simular"}
                disabled={sincronizando !== null || !urlExtratoAtiva}
              >
                Simular (não grava)
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmandoSincronizar(true)}
                loading={sincronizando === "aplicar"}
                disabled={sincronizando !== null || !urlExtratoAtiva}
              >
                Sincronizar agora
              </Button>
            </Stack>
          </Stack>

          {resultadoExtrato && (
            <Stack gap={8}>
              <strong>
                {resultadoExtrato.simular ? "Simulação — nada foi gravado" : "Resultado da sincronização"}
                {` · ${resultadoExtrato.resultados.length} equipamento(s)`}
              </strong>
              <div style={{ overflowX: "auto" }}>
                <Table minWidth={760}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Equipamento</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell align="right">Lançadas</TableHeaderCell>
                      <TableHeaderCell align="right">Confirmadas</TableHeaderCell>
                      <TableHeaderCell align="right">Canceladas</TableHeaderCell>
                      <TableHeaderCell>Observação</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resultadoExtrato.resultados.map((r) => (
                      <TableRow key={r.equipamentoId}>
                        <TableCell>{r.numero}</TableCell>
                        <TableCell>
                          {r.statusAntes === r.statusDepois ? (
                            STATUS_LABEL[r.statusAntes] ?? r.statusAntes
                          ) : (
                            <Badge variant="warning">
                              {STATUS_LABEL[r.statusAntes] ?? r.statusAntes} → {STATUS_LABEL[r.statusDepois] ?? r.statusDepois}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell align="right">{r.movimentacoesCriadas}</TableCell>
                        <TableCell align="right">{r.movimentacoesVinculadas}</TableCell>
                        <TableCell align="right">{r.movimentosErpRemovidos}</TableCell>
                        <TableCell>{r.erro ?? (r.statusAntes !== r.statusDepois ? r.motivoStatus : "")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Stack>
          )}
        </div>

        <ConfirmDialog
          open={confirmandoSincronizar}
          title="Sincronizar todos com o ERP?"
          message="O status de cada equipamento passa a ser o do ERP e as movimentações do extrato entram no histórico do Portal. Rode a simulação antes para conferir o que vai mudar."
          confirmLabel="Sincronizar"
          variant="warning"
          loading={sincronizando === "aplicar"}
          onConfirm={() => handleSincronizar(false)}
          onClose={() => setConfirmandoSincronizar(false)}
        />

        {config?.atualizadoEm && (
          <p>
            Última alteração: {formatarData(config.atualizadoEm)}
            {config.atualizadoPor && ` por ${config.atualizadoPor}`}
          </p>
        )}

        <Stack direction="row" justify="end">
          <Button onClick={handleSalvar} loading={salvando}>
            Salvar configuração
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
