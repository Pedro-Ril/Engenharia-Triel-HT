"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";

import {
  salvarConfiguracaoSmtp,
  testarConfiguracaoSmtp,
} from "../services/adminPermissoes.service";
import type { ConfiguracaoSmtp, CriptografiaSmtp } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface ConfiguracaoSmtpPainelProps {
  configuracaoSmtp: ConfiguracaoSmtp | null;
  onConfiguracaoAtualizada: (configuracao: ConfiguracaoSmtp) => void;
  onFeedback: FeedbackHandler;
  emailUsuarioLogado: string | null;
}

const opcoesCriptografia: { value: CriptografiaSmtp; label: string }[] = [
  { value: "tls", label: "STARTTLS (recomendado — porta 587)" },
  { value: "ssl", label: "SSL/TLS implícito (porta 465)" },
  { value: "nenhuma", label: "Nenhuma (rede interna confiável)" },
];

function formularioInicial(configuracaoSmtp: ConfiguracaoSmtp | null) {
  return {
    host: configuracaoSmtp?.host ?? "",
    porta: configuracaoSmtp ? String(configuracaoSmtp.porta) : "587",
    criptografia: configuracaoSmtp?.criptografia ?? "tls",
    autenticacaoAtiva: configuracaoSmtp?.autenticacaoAtiva ?? true,
    usuario: configuracaoSmtp?.usuario ?? "",
    senha: "",
    remetenteNome: configuracaoSmtp?.remetenteNome ?? "",
    remetenteEmail: configuracaoSmtp?.remetenteEmail ?? "",
  };
}

export function ConfiguracaoSmtpPainel({
  configuracaoSmtp,
  onConfiguracaoAtualizada,
  onFeedback,
  emailUsuarioLogado,
}: ConfiguracaoSmtpPainelProps) {
  const [formulario, setFormulario] = useState(formularioInicial(configuracaoSmtp));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{
    sucesso: boolean;
    mensagem: string;
  } | null>(null);

  const porta = Number(formulario.porta);
  const camposObrigatoriosPreenchidos =
    !!formulario.host &&
    Number.isInteger(porta) &&
    porta > 0 &&
    !!formulario.remetenteEmail &&
    (!formulario.autenticacaoAtiva ||
      (!!formulario.usuario && (!!formulario.senha || !!configuracaoSmtp)));

  function montarDadosFormulario() {
    return {
      host: formulario.host,
      porta,
      criptografia: formulario.criptografia,
      autenticacaoAtiva: formulario.autenticacaoAtiva,
      usuario: formulario.autenticacaoAtiva ? formulario.usuario.trim() || null : null,
      senha: formulario.senha.trim() || null,
      remetenteNome: formulario.remetenteNome.trim() || null,
      remetenteEmail: formulario.remetenteEmail,
    };
  }

  async function handleTestar() {
    setErro(null);
    setResultadoTeste(null);
    setTestando(true);

    try {
      const resultado = await testarConfiguracaoSmtp(montarDadosFormulario());

      setResultadoTeste({
        sucesso: resultado.ok,
        mensagem:
          resultado.message ??
          (resultado.ok ? "E-mail de teste enviado." : "Não foi possível enviar o e-mail de teste."),
      });
    } finally {
      setTestando(false);
    }
  }

  async function handleSalvar() {
    setErro(null);
    setResultadoTeste(null);
    setSalvando(true);

    try {
      const resultado = await salvarConfiguracaoSmtp(montarDadosFormulario());

      if (resultado.ok && resultado.data) {
        onConfiguracaoAtualizada(resultado.data);
        setFormulario((atual) => ({ ...atual, senha: "" }));
        onFeedback("success", "Configuração salva", "A configuração de SMTP foi atualizada.");
      } else {
        setErro(resultado.message ?? "Não foi possível salvar a configuração.");
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Stack gap={20}>
      <Card
        title="Servidor de e-mail (SMTP)"
        description="Usado para o portal enviar e-mails (ex: notificações). O teste é sempre enviado para o seu próprio e-mail cadastrado no Active Directory."
      >
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field label="Servidor" hint='ex: "smtp.office365.com"'>
              <Input
                value={formulario.host}
                onChange={(event) =>
                  setFormulario((atual) => ({ ...atual, host: event.target.value }))
                }
              />
            </Field>

            <Field label="Porta">
              <NumberInput
                value={formulario.porta}
                onChange={(event) =>
                  setFormulario((atual) => ({ ...atual, porta: event.target.value }))
                }
              />
            </Field>
          </FormGrid>

          <Field label="Criptografia">
            <Dropdown
              value={formulario.criptografia}
              options={opcoesCriptografia}
              onValueChange={(value) =>
                setFormulario((atual) => ({
                  ...atual,
                  criptografia: value as CriptografiaSmtp,
                }))
              }
            />
          </Field>

          <Switch
            label="Servidor exige autenticação"
            checked={formulario.autenticacaoAtiva}
            onChange={(event) =>
              setFormulario((atual) => ({
                ...atual,
                autenticacaoAtiva: event.target.checked,
              }))
            }
          />

          {formulario.autenticacaoAtiva && (
            <FormGrid columns={2}>
              <Field label="Usuário">
                <Input
                  value={formulario.usuario}
                  onChange={(event) =>
                    setFormulario((atual) => ({ ...atual, usuario: event.target.value }))
                  }
                />
              </Field>

              <Field
                label="Senha"
                hint={
                  configuracaoSmtp
                    ? "deixe em branco para manter a senha já cadastrada"
                    : "obrigatória na primeira configuração"
                }
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={configuracaoSmtp ? "••••••••" : ""}
                  value={formulario.senha}
                  onChange={(event) =>
                    setFormulario((atual) => ({ ...atual, senha: event.target.value }))
                  }
                />
              </Field>
            </FormGrid>
          )}

          <FormGrid columns={2}>
            <Field label="Nome do remetente" hint='opcional — ex: "Portal Triel-HT"'>
              <Input
                value={formulario.remetenteNome}
                onChange={(event) =>
                  setFormulario((atual) => ({ ...atual, remetenteNome: event.target.value }))
                }
              />
            </Field>

            <Field label="E-mail do remetente">
              <Input
                type="email"
                value={formulario.remetenteEmail}
                onChange={(event) =>
                  setFormulario((atual) => ({ ...atual, remetenteEmail: event.target.value }))
                }
              />
            </Field>
          </FormGrid>

          {!emailUsuarioLogado && (
            <Alert variant="warning">
              Seu usuário não tem e-mail cadastrado no Active Directory — não será possível
              enviar um e-mail de teste até que isso seja corrigido.
            </Alert>
          )}

          {erro && <Alert variant="danger">{erro}</Alert>}

          {resultadoTeste && (
            <Alert variant={resultadoTeste.sucesso ? "success" : "danger"}>
              {resultadoTeste.mensagem}
            </Alert>
          )}

          {configuracaoSmtp?.atualizadoEm && (
            <p>
              Última atualização em{" "}
              {new Date(configuracaoSmtp.atualizadoEm).toLocaleString("pt-BR")}
              {configuracaoSmtp.atualizadoPor ? ` por ${configuracaoSmtp.atualizadoPor}` : ""}.
            </p>
          )}

          <Stack direction="row" justify="end" gap={10}>
            <Button
              variant="secondary"
              onClick={handleTestar}
              loading={testando}
              disabled={!camposObrigatoriosPreenchidos || !emailUsuarioLogado}
            >
              Enviar e-mail de teste
            </Button>

            <Button onClick={handleSalvar} loading={salvando} disabled={!camposObrigatoriosPreenchidos}>
              Salvar configuração
            </Button>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
