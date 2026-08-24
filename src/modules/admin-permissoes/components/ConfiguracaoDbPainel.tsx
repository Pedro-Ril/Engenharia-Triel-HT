"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";

import {
  reiniciarAplicacao,
  salvarConfiguracaoDb,
  testarConexaoDb,
} from "../services/adminPermissoes.service";
import type { ConfiguracaoDb } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface ConfiguracaoDbPainelProps {
  configuracaoDb: ConfiguracaoDb | null;
  onConfiguracaoAtualizada: (configuracao: ConfiguracaoDb) => void;
  onFeedback: FeedbackHandler;
}

function formularioInicial(configuracaoDb: ConfiguracaoDb | null) {
  return {
    server: configuracaoDb?.server ?? "",
    database: configuracaoDb?.database ?? "",
    user: configuracaoDb?.user ?? "",
    senha: "",
    encrypt: configuracaoDb?.encrypt ?? true,
    trustServerCertificate: configuracaoDb?.trustServerCertificate ?? true,
  };
}

export function ConfiguracaoDbPainel({
  configuracaoDb,
  onConfiguracaoAtualizada,
  onFeedback,
}: ConfiguracaoDbPainelProps) {
  const [formulario, setFormulario] = useState(formularioInicial(configuracaoDb));
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<{
    sucesso: boolean;
    mensagem: string;
  } | null>(null);

  const [precisaReiniciar, setPrecisaReiniciar] = useState(false);
  const [confirmandoReinicio, setConfirmandoReinicio] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [reiniciado, setReiniciado] = useState(false);

  async function handleTestar() {
    setErro(null);
    setResultadoTeste(null);
    setTestando(true);

    try {
      const resultado = await testarConexaoDb({
        server: formulario.server,
        database: formulario.database,
        user: formulario.user,
        senha: formulario.senha.trim() || null,
        encrypt: formulario.encrypt,
        trustServerCertificate: formulario.trustServerCertificate,
      });

      if (resultado.ok && resultado.data) {
        setResultadoTeste(
          resultado.data.conectou
            ? { sucesso: true, mensagem: "Conexão com o banco de dados bem-sucedida." }
            : {
                sucesso: false,
                mensagem: resultado.data.mensagemErro ?? "Não foi possível conectar.",
              }
        );
      } else {
        setResultadoTeste({
          sucesso: false,
          mensagem: resultado.message ?? "Não foi possível testar a conexão.",
        });
      }
    } finally {
      setTestando(false);
    }
  }

  async function handleSalvar() {
    setErro(null);
    setResultadoTeste(null);
    setSalvando(true);

    try {
      const resultado = await salvarConfiguracaoDb({
        server: formulario.server,
        database: formulario.database,
        user: formulario.user,
        senha: formulario.senha.trim() || null,
        encrypt: formulario.encrypt,
        trustServerCertificate: formulario.trustServerCertificate,
      });

      if (resultado.ok && resultado.data) {
        onConfiguracaoAtualizada(resultado.data);
        setFormulario((atual) => ({ ...atual, senha: "" }));
        setPrecisaReiniciar(true);
        onFeedback(
          "success",
          "Configuração salva",
          "Gravado no .env — só passa a valer depois de reiniciar o processo."
        );
      } else {
        setErro(resultado.message ?? "Não foi possível salvar a configuração.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleConfirmarReinicio() {
    setReiniciando(true);

    try {
      const resultado = await reiniciarAplicacao();

      if (resultado.ok) {
        setReiniciado(true);
      } else {
        onFeedback(
          "danger",
          "Não foi possível reiniciar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setReiniciando(false);
      setConfirmandoReinicio(false);
    }
  }

  if (reiniciado) {
    return (
      <Card title="Banco de dados (.env)">
        <Alert variant="warning" icon={<AlertTriangle />} title="Processo encerrado">
          O portal está fora do ar até alguém iniciar a aplicação novamente no servidor —
          não há reinício automático configurado neste ambiente.
        </Alert>
      </Card>
    );
  }

  return (
    <Card
      title="Banco de dados (.env)"
      description="Conexão do próprio Portal com o SQL Server. Vem do arquivo .env do servidor — mudar aqui grava no arquivo, mas só passa a valer depois de reiniciar o processo."
    >
      <Stack gap={16}>
        <FormGrid columns={2}>
          <Field label="Servidor" hint='ex: "pdmserver"'>
            <Input
              value={formulario.server}
              onChange={(event) =>
                setFormulario((atual) => ({ ...atual, server: event.target.value }))
              }
            />
          </Field>

          <Field label="Banco de dados">
            <Input
              value={formulario.database}
              onChange={(event) =>
                setFormulario((atual) => ({ ...atual, database: event.target.value }))
              }
            />
          </Field>
        </FormGrid>

        <FormGrid columns={2}>
          <Field label="Usuário">
            <Input
              value={formulario.user}
              onChange={(event) =>
                setFormulario((atual) => ({ ...atual, user: event.target.value }))
              }
            />
          </Field>

          <Field
            label="Senha"
            hint={
              configuracaoDb?.senhaConfigurada
                ? "deixe em branco para manter a senha já configurada"
                : "obrigatória na primeira configuração"
            }
          >
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={configuracaoDb?.senhaConfigurada ? "••••••••" : ""}
              value={formulario.senha}
              onChange={(event) =>
                setFormulario((atual) => ({ ...atual, senha: event.target.value }))
              }
            />
          </Field>
        </FormGrid>

        <Stack direction="row" gap={24} wrap>
          <Switch
            label="Encrypt"
            checked={formulario.encrypt}
            onChange={(event) =>
              setFormulario((atual) => ({ ...atual, encrypt: event.target.checked }))
            }
          />

          <Switch
            label="Confiar no certificado do servidor"
            checked={formulario.trustServerCertificate}
            onChange={(event) =>
              setFormulario((atual) => ({
                ...atual,
                trustServerCertificate: event.target.checked,
              }))
            }
          />
        </Stack>

        {erro && <Alert variant="danger">{erro}</Alert>}

        {resultadoTeste && (
          <Alert variant={resultadoTeste.sucesso ? "success" : "danger"}>
            {resultadoTeste.mensagem}
          </Alert>
        )}

        {precisaReiniciar && (
          <Alert variant="warning" icon={<AlertTriangle />} title="Reinício necessário">
            A nova configuração foi gravada no .env, mas o processo atual continua
            conectado com os valores antigos. Sem um supervisor de processo configurado
            neste ambiente, reiniciar derruba o portal para todo mundo até alguém iniciar
            a aplicação de novo manualmente no servidor.
          </Alert>
        )}

        <Stack direction="row" justify="end" gap={10}>
          <Button
            variant="secondary"
            onClick={handleTestar}
            loading={testando}
            disabled={
              !formulario.server ||
              !formulario.database ||
              !formulario.user ||
              (!configuracaoDb?.senhaConfigurada && !formulario.senha)
            }
          >
            Testar conexão
          </Button>

          <Button
            onClick={handleSalvar}
            loading={salvando}
            disabled={
              !formulario.server ||
              !formulario.database ||
              !formulario.user ||
              (!configuracaoDb?.senhaConfigurada && !formulario.senha)
            }
          >
            Salvar configuração
          </Button>

          <Button
            variant="danger"
            onClick={() => setConfirmandoReinicio(true)}
          >
            <RefreshCw size={16} />
            Reiniciar agora
          </Button>
        </Stack>
      </Stack>

      <ConfirmDialog
        open={confirmandoReinicio}
        title="Reiniciar a aplicação?"
        variant="danger"
        message='Não há supervisor de processo configurado neste ambiente. Isto vai ENCERRAR o portal para todo mundo agora, e ele só volta quando alguém iniciar a aplicação de novo manualmente no servidor — não é um reinício automático.'
        confirmLabel="Encerrar mesmo assim"
        loading={reiniciando}
        onConfirm={handleConfirmarReinicio}
        onClose={() => setConfirmandoReinicio(false)}
      />
    </Card>
  );
}
