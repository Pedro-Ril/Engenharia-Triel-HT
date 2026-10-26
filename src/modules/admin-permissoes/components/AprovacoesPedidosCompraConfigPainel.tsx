"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, PlugZap, Save } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { EMPRESAS_PEDIDO_COMPRA } from "@/lib/aprovacoes/empresas-pedido-compra";

import {
  buscarConfigPedidosCompra,
  gerarChavePedidosCompra,
  revogarChavePedidosCompra,
  salvarConfigPedidosCompra,
  testarErpPedidosCompra,
} from "../services/adminPermissoes.service";
import type { ConfigPedidosCompra, ResultadoTesteErpPedido } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface AprovacoesPedidosCompraConfigPainelProps {
  onFeedback: FeedbackHandler;
}

const OPCOES_EMPRESA = EMPRESAS_PEDIDO_COMPRA.map((empresa) => ({
  value: String(empresa.codigo),
  label: `${empresa.codigo} — ${empresa.nome}`,
}));

function formatarDataHora(valorIso: string | null): string {
  if (!valorIso) return "";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/*
 * Configurações → Pedidos de Compra: de onde vem o pedido (URL do ERP
 * para buscar fornecedor, itens e valores) e a chave com que o
 * SupriConnect chama o portal.
 */
export function AprovacoesPedidosCompraConfigPainel({ onFeedback }: AprovacoesPedidosCompraConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfigPedidosCompra | null>(null);
  const [urlPedido, setUrlPedido] = useState("");
  const [urlPedidoTeste, setUrlPedidoTeste] = useState("");
  const [usarAmbienteTeste, setUsarAmbienteTeste] = useState(false);
  const [chaveApiErp, setChaveApiErp] = useState("");
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [erroConfig, setErroConfig] = useState<string | null>(null);

  const [empresaTeste, setEmpresaTeste] = useState(OPCOES_EMPRESA[0].value);
  const [numeroTeste, setNumeroTeste] = useState("");
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<ResultadoTesteErpPedido | null>(null);
  const [erroTeste, setErroTeste] = useState<string | null>(null);

  const [confirmarGerar, setConfirmarGerar] = useState(false);
  const [confirmarRevogar, setConfirmarRevogar] = useState(false);
  const [alterandoChave, setAlterandoChave] = useState(false);
  const [chaveGerada, setChaveGerada] = useState<string | null>(null);

  function aplicarConfig(dados: ConfigPedidosCompra) {
    setConfig(dados);
    setUrlPedido(dados.urlPedido ?? "");
    setUrlPedidoTeste(dados.urlPedidoTeste ?? "");
    setUsarAmbienteTeste(dados.usarAmbienteTeste);
    setChaveApiErp(dados.chaveApiErp ?? "");
  }

  useEffect(() => {
    buscarConfigPedidosCompra().then((resultado) => {
      if (resultado.ok && resultado.data) aplicarConfig(resultado.data);
      setCarregando(false);
    });
  }, []);

  async function handleSalvarConfig() {
    setSalvandoConfig(true);
    setErroConfig(null);

    try {
      const resultado = await salvarConfigPedidosCompra({
        urlPedido: urlPedido.trim() || null,
        urlPedidoTeste: urlPedidoTeste.trim() || null,
        usarAmbienteTeste,
        chaveApiErp: chaveApiErp.trim() || null,
      });

      if (resultado.ok && resultado.data) {
        aplicarConfig(resultado.data);
        onFeedback("success", "Integração salva", "As consultas de pedido passam a usar estes endereços.");
      } else {
        setErroConfig(resultado.message ?? "Não foi possível salvar a integração.");
      }
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function handleTestar() {
    setTestando(true);
    setErroTeste(null);
    setResultadoTeste(null);

    try {
      const resultado = await testarErpPedidosCompra({
        empresa: Number(empresaTeste),
        numero: Number(numeroTeste),
      });

      if (resultado.ok && resultado.data) {
        setResultadoTeste(resultado.data);
      } else {
        setErroTeste(resultado.message ?? "Não foi possível testar a consulta.");
      }
    } finally {
      setTestando(false);
    }
  }

  async function handleGerarChave() {
    setAlterandoChave(true);

    try {
      const resultado = await gerarChavePedidosCompra();

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data.config);
        setChaveGerada(resultado.data.chave);
        setConfirmarGerar(false);
      } else {
        onFeedback("danger", "Não foi possível gerar a chave", resultado.message ?? "Tente novamente.");
      }
    } finally {
      setAlterandoChave(false);
    }
  }

  async function handleRevogarChave() {
    setAlterandoChave(true);

    try {
      const resultado = await revogarChavePedidosCompra();

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        setConfirmarRevogar(false);
        onFeedback("success", "Chave revogada", "O SupriConnect não consegue mais enviar nem consultar pedidos.");
      } else {
        onFeedback("danger", "Não foi possível revogar a chave", resultado.message ?? "Tente novamente.");
      }
    } finally {
      setAlterandoChave(false);
    }
  }

  async function copiarChave() {
    if (!chaveGerada) return;

    try {
      await navigator.clipboard.writeText(chaveGerada);
      onFeedback("success", "Chave copiada", "Cole no .env do SupriConnect (PORTAL_TRIEL_API_KEY).");
    } catch {
      onFeedback("danger", "Não deu para copiar", "Selecione o texto da chave e copie manualmente.");
    }
  }

  if (carregando) {
    return <Loader label="Carregando integração..." />;
  }

  const testeOk = resultadoTeste !== null && resultadoTeste.status !== null && resultadoTeste.status < 400;

  return (
    <Stack gap={20}>
      <Card
        title="Integração com o ERP"
        description="Onde o portal busca os dados do pedido (fornecedor, itens, valores) no Focco."
      >
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field
              label="URL de produção"
              htmlFor="urlPedido"
              hint="Base da rota de pedido de compra; o portal acrescenta /empresa/número."
            >
              <Input
                id="urlPedido"
                value={urlPedido}
                placeholder="http://proserver.trielht.com.br:1000/api/pedido-compra"
                disabled={salvandoConfig}
                onChange={(evento) => setUrlPedido(evento.target.value)}
              />
            </Field>

            <Field
              label="URL de teste"
              htmlFor="urlPedidoTeste"
              hint="Normalmente a mesma base com ?ambiente=teste (banco de teste do Focco)."
            >
              <Input
                id="urlPedidoTeste"
                value={urlPedidoTeste}
                placeholder="http://proserver.trielht.com.br:1000/api/pedido-compra?ambiente=teste"
                disabled={salvandoConfig}
                onChange={(evento) => setUrlPedidoTeste(evento.target.value)}
              />
            </Field>

            <Field
              label="Chave de API do ERP"
              htmlFor="chaveApiErp"
              hint="Enviada como Bearer. Deixe em branco se a rota não exige."
            >
              <Input
                id="chaveApiErp"
                type="password"
                autoComplete="off"
                value={chaveApiErp}
                disabled={salvandoConfig}
                onChange={(evento) => setChaveApiErp(evento.target.value)}
              />
            </Field>

            <Switch
              label="Usar o ambiente de teste"
              hint="Com isso ligado, o portal consulta a URL de teste."
              checked={usarAmbienteTeste}
              disabled={salvandoConfig}
              onChange={(evento) => setUsarAmbienteTeste(evento.target.checked)}
            />
          </FormGrid>

          {erroConfig && <Alert variant="danger">{erroConfig}</Alert>}

          <Stack direction="row" justify="between" align="center" wrap>
            <span className={styles.usuarioSub}>
              {config?.atualizadoEm
                ? `Última alteração em ${formatarDataHora(config.atualizadoEm)}${
                    config.atualizadoPor ? ` por ${config.atualizadoPor}` : ""
                  }.`
                : "Ainda não configurada."}
            </span>

            <Button onClick={handleSalvarConfig} loading={salvandoConfig}>
              <Save size={16} />
              Salvar integração
            </Button>
          </Stack>

          <div className={styles.testeErp}>
            <Stack gap={12}>
              <strong>Testar consulta</strong>
              <p className={styles.usuarioSub}>
                Busca um pedido real com a URL salva ({usarAmbienteTeste ? "teste" : "produção"}) e mostra o
                que o ERP respondeu.
              </p>

              <div className={styles.testeErpLinha}>
                <Field label="Empresa" className={styles.testeErpEmpresa}>
                  <Dropdown value={empresaTeste} options={OPCOES_EMPRESA} onValueChange={setEmpresaTeste} />
                </Field>

                <Field label="Número do pedido" htmlFor="numeroTeste" className={styles.testeErpNumero}>
                  <Input
                    id="numeroTeste"
                    inputMode="numeric"
                    value={numeroTeste}
                    placeholder="Ex.: 123456"
                    onChange={(evento) => setNumeroTeste(evento.target.value.replace(/\D/g, ""))}
                    onKeyDown={(evento) => {
                      if (evento.key === "Enter" && numeroTeste && !testando) void handleTestar();
                    }}
                  />
                </Field>

                <Button
                  variant="secondary"
                  className={styles.testeErpBotao}
                  disabled={!numeroTeste}
                  loading={testando}
                  loadingLabel="Consultando…"
                  onClick={() => void handleTestar()}
                >
                  <PlugZap size={16} />
                  Testar
                </Button>
              </div>

              {erroTeste && <Alert variant="danger">{erroTeste}</Alert>}

              {resultadoTeste && (
                <Stack gap={8}>
                  <Stack direction="row" gap={8} align="center" wrap>
                    <Badge variant={testeOk ? "success" : "danger"}>
                      {resultadoTeste.status === null ? "Sem resposta" : `HTTP ${resultadoTeste.status}`}
                    </Badge>
                    <span className={styles.usuarioSub}>
                      {resultadoTeste.duracaoMs} ms · {resultadoTeste.url}
                    </span>
                  </Stack>
                  <pre className={styles.testeErpResposta}>{resultadoTeste.corpo || "(resposta vazia)"}</pre>
                </Stack>
              )}
            </Stack>
          </div>
        </Stack>
      </Card>

      <Card
        title="Acesso do SupriConnect"
        description="Chave que o SupriConnect manda no cabeçalho X-Api-Key para enviar e consultar pedidos."
      >
        <Stack gap={16}>
          {config?.chaveExternaConfigurada ? (
            <Stack direction="row" gap={8} align="center" wrap>
              <Badge variant="success">Ativa</Badge>
              <span className={styles.usuarioSub}>
                Termina em <strong>…{config.chaveExternaFinal}</strong>, gerada em{" "}
                {formatarDataHora(config.chaveExternaGeradaEm)}
                {config.chaveExternaGeradaPor ? ` por ${config.chaveExternaGeradaPor}` : ""}.
              </span>
            </Stack>
          ) : (
            <Alert variant="warning" title="Integração desligada">
              Nenhuma chave gerada: o SupriConnect recebe &quot;integração não configurada&quot; em toda
              chamada. Gere uma chave e coloque-a no .env do backend do SupriConnect.
            </Alert>
          )}

          <Stack direction="row" justify="end" gap={8}>
            {config?.chaveExternaConfigurada && (
              <Button variant="danger" onClick={() => setConfirmarRevogar(true)}>
                Revogar
              </Button>
            )}

            <Button
              onClick={() => (config?.chaveExternaConfigurada ? setConfirmarGerar(true) : void handleGerarChave())}
              loading={alterandoChave && !confirmarGerar && !confirmarRevogar}
            >
              <KeyRound size={16} />
              {config?.chaveExternaConfigurada ? "Gerar nova chave" : "Gerar chave"}
            </Button>
          </Stack>
        </Stack>
      </Card>

      <ConfirmDialog
        open={confirmarGerar}
        title="Gerar nova chave?"
        variant="warning"
        message="A chave atual para de funcionar na hora. O SupriConnect só volta a enviar pedidos depois que a nova for colocada no .env dele."
        confirmLabel="Gerar nova chave"
        loading={alterandoChave}
        onConfirm={handleGerarChave}
        onClose={() => setConfirmarGerar(false)}
      />

      <ConfirmDialog
        open={confirmarRevogar}
        title="Revogar a chave do SupriConnect?"
        variant="danger"
        message="O SupriConnect deixa de conseguir enviar pedidos para aprovação e de consultar as decisões até uma nova chave ser gerada."
        confirmLabel="Revogar"
        loading={alterandoChave}
        onConfirm={handleRevogarChave}
        onClose={() => setConfirmarRevogar(false)}
      />

      <Modal
        open={chaveGerada !== null}
        title="Chave do SupriConnect"
        description="Esta é a única vez que a chave aparece. Copie agora."
        closeOnOverlay={false}
        onClose={() => setChaveGerada(null)}
        footer={
          <Stack direction="row" justify="end" gap={8}>
            <Button variant="secondary" onClick={() => setChaveGerada(null)}>
              Já copiei
            </Button>
            <Button onClick={() => void copiarChave()}>
              <Copy size={16} />
              Copiar
            </Button>
          </Stack>
        }
      >
        <Stack gap={12}>
          <code className={styles.chaveGerada}>{chaveGerada}</code>
          <Alert variant="warning">
            No portal fica guardado só um resumo (hash) da chave — se ela se perder, é preciso gerar outra.
            Cole no .env do backend do SupriConnect, em PORTAL_TRIEL_API_KEY.
          </Alert>
        </Stack>
      </Modal>
    </Stack>
  );
}
