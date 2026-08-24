"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";

import { salvarConfiguracaoAd, testarConexaoAd } from "../services/adminPermissoes.service";
import type { ConfiguracaoAd } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface ConfiguracaoAdPainelProps {
  configuracaoAd: ConfiguracaoAd | null;
  onConfiguracaoAtualizada: (configuracao: ConfiguracaoAd) => void;
  onFeedback: FeedbackHandler;
}

function formularioInicial(configuracaoAd: ConfiguracaoAd | null) {
  return {
    url: configuracaoAd?.url ?? "",
    baseDn: configuracaoAd?.baseDn ?? "",
    usuarioServico: configuracaoAd?.usuarioServico ?? "",
    senhaServico: "",
    grupoAdminDn: configuracaoAd?.grupoAdminDn ?? "",
    grupoUsuariosDn: configuracaoAd?.grupoUsuariosDn ?? "",
  };
}

export function ConfiguracaoAdPainel({
  configuracaoAd,
  onConfiguracaoAtualizada,
  onFeedback,
}: ConfiguracaoAdPainelProps) {
  const [formulario, setFormulario] = useState(formularioInicial(configuracaoAd));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{
    sucesso: boolean;
    mensagem: string;
  } | null>(null);

  async function handleTestar() {
    setErro(null);
    setResultadoTeste(null);
    setTestando(true);

    try {
      const resultado = await testarConexaoAd({
        url: formulario.url,
        usuarioServico: formulario.usuarioServico,
        senhaServico: formulario.senhaServico.trim() || null,
        grupoAdminDn: formulario.grupoAdminDn,
        grupoUsuariosDn: formulario.grupoUsuariosDn.trim() || null,
      });

      if (resultado.ok && resultado.data) {
        setResultadoTeste(
          resultado.data.conectou
            ? { sucesso: true, mensagem: "Conexão com o Active Directory bem-sucedida." }
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
      const resultado = await salvarConfiguracaoAd({
        url: formulario.url,
        baseDn: formulario.baseDn,
        usuarioServico: formulario.usuarioServico,
        senhaServico: formulario.senhaServico.trim() || null,
        grupoAdminDn: formulario.grupoAdminDn,
        grupoUsuariosDn: formulario.grupoUsuariosDn.trim() || null,
      });

      if (resultado.ok && resultado.data) {
        onConfiguracaoAtualizada(resultado.data);
        setFormulario((atual) => ({ ...atual, senhaServico: "" }));
        onFeedback(
          "success",
          "Configuração salva",
          "A conexão com o Active Directory foi atualizada."
        );
      } else {
        setErro(
          resultado.message ?? "Não foi possível salvar a configuração."
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Stack gap={20}>
      <Card
        title="Conexão com o Active Directory"
        description="Usada para autenticar o login corporativo (LDAP) e definir quem é administrador do portal."
      >
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field
              label="URL do servidor"
              hint='ex: "ldap://192.168.0.248:389"'
            >
              <Input
                value={formulario.url}
                onChange={(event) =>
                  setFormulario((atual) => ({ ...atual, url: event.target.value }))
                }
              />
            </Field>

            <Field
              label="Base DN"
              hint='ex: "DC=trielht,DC=ad"'
            >
              <Input
                value={formulario.baseDn}
                onChange={(event) =>
                  setFormulario((atual) => ({ ...atual, baseDn: event.target.value }))
                }
              />
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field
              label="Usuário de serviço"
              hint="conta técnica usada pelo backend para consultar o AD"
            >
              <Input
                value={formulario.usuarioServico}
                onChange={(event) =>
                  setFormulario((atual) => ({
                    ...atual,
                    usuarioServico: event.target.value,
                  }))
                }
              />
            </Field>

            <Field
              label="Senha de serviço"
              hint={
                configuracaoAd
                  ? "deixe em branco para manter a senha já cadastrada"
                  : "obrigatória na primeira configuração"
              }
            >
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={configuracaoAd ? "••••••••" : ""}
                value={formulario.senhaServico}
                onChange={(event) =>
                  setFormulario((atual) => ({
                    ...atual,
                    senhaServico: event.target.value,
                  }))
                }
              />
            </Field>
          </FormGrid>

          <Field
            label="Grupo de administradores (DN)"
            hint="quem estiver neste grupo do AD vira administrador do portal"
          >
            <Input
              value={formulario.grupoAdminDn}
              onChange={(event) =>
                setFormulario((atual) => ({
                  ...atual,
                  grupoAdminDn: event.target.value,
                }))
              }
            />
          </Field>

          <Field
            label="Grupo de usuários (DN)"
            hint='opcional — quem estiver neste grupo do AD pode ser importado antes do primeiro login, na aba "Usuários"'
          >
            <Input
              value={formulario.grupoUsuariosDn}
              onChange={(event) =>
                setFormulario((atual) => ({
                  ...atual,
                  grupoUsuariosDn: event.target.value,
                }))
              }
            />
          </Field>

          {erro && <Alert variant="danger">{erro}</Alert>}

          {resultadoTeste && (
            <Alert variant={resultadoTeste.sucesso ? "success" : "danger"}>
              {resultadoTeste.mensagem}
            </Alert>
          )}

          {configuracaoAd?.atualizadoEm && (
            <p>
              Última atualização em{" "}
              {new Date(configuracaoAd.atualizadoEm).toLocaleString("pt-BR")}
              {configuracaoAd.atualizadoPor
                ? ` por ${configuracaoAd.atualizadoPor}`
                : ""}
              .
            </p>
          )}

          <Stack direction="row" justify="end" gap={10}>
            <Button
              variant="secondary"
              onClick={handleTestar}
              loading={testando}
              disabled={
                !formulario.url ||
                !formulario.usuarioServico ||
                !formulario.grupoAdminDn ||
                (!configuracaoAd && !formulario.senhaServico)
              }
            >
              Testar conexão
            </Button>

            <Button
              onClick={handleSalvar}
              loading={salvando}
              disabled={
                !formulario.url ||
                !formulario.baseDn ||
                !formulario.usuarioServico ||
                !formulario.grupoAdminDn ||
                (!configuracaoAd && !formulario.senhaServico)
              }
            >
              Salvar configuração
            </Button>
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
