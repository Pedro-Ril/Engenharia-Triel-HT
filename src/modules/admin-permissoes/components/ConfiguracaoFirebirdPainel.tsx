"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";

import {
  salvarConfiguracaoFirebird,
  testarConexaoFirebird,
} from "../services/adminPermissoes.service";
import type { ConfiguracaoFirebird } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface ConfiguracaoFirebirdPainelProps {
  configuracaoFirebird: ConfiguracaoFirebird | null;
  onConfiguracaoAtualizada: (configuracao: ConfiguracaoFirebird) => void;
  onFeedback: FeedbackHandler;
}

function formularioInicial(configuracaoFirebird: ConfiguracaoFirebird | null) {
  return {
    host: configuracaoFirebird?.host ?? "",
    port: configuracaoFirebird ? String(configuracaoFirebird.port) : "3050",
    database: configuracaoFirebird?.database ?? "",
    user: configuracaoFirebird?.user ?? "",
    senha: "",
    charset: configuracaoFirebird?.charset ?? "UTF8",
    role: configuracaoFirebird?.role ?? "",
    poolMin: configuracaoFirebird ? String(configuracaoFirebird.poolMin) : "1",
    poolMax: configuracaoFirebird ? String(configuracaoFirebird.poolMax) : "10",
  };
}

export function ConfiguracaoFirebirdPainel({
  configuracaoFirebird,
  onConfiguracaoAtualizada,
  onFeedback,
}: ConfiguracaoFirebirdPainelProps) {
  const [formulario, setFormulario] = useState(formularioInicial(configuracaoFirebird));
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<{
    sucesso: boolean;
    mensagem: string;
  } | null>(null);

  const camposObrigatoriosPreenchidos =
    !!formulario.host &&
    !!formulario.database &&
    !!formulario.user &&
    (!!formulario.senha || !!configuracaoFirebird?.senhaConfigurada);

  function montarDadosFormulario() {
    return {
      host: formulario.host,
      port: Number(formulario.port) || 3050,
      database: formulario.database,
      user: formulario.user,
      senha: formulario.senha.trim() || null,
      charset: formulario.charset.trim() || "UTF8",
      role: formulario.role.trim(),
      poolMin: Number(formulario.poolMin) || 0,
      poolMax: Number(formulario.poolMax) || 10,
    };
  }

  async function handleTestar() {
    setErro(null);
    setResultadoTeste(null);
    setTestando(true);

    try {
      const resultado = await testarConexaoFirebird(montarDadosFormulario());

      if (resultado.ok && resultado.data) {
        setResultadoTeste(
          resultado.data.conectou
            ? { sucesso: true, mensagem: "Conexão com o Firebird bem-sucedida." }
            : { sucesso: false, mensagem: resultado.data.mensagemErro ?? "Não foi possível conectar." }
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
      const resultado = await salvarConfiguracaoFirebird(montarDadosFormulario());

      if (resultado.ok && resultado.data) {
        onConfiguracaoAtualizada(resultado.data);
        setFormulario((atual) => ({ ...atual, senha: "" }));
        onFeedback(
          "success",
          "Configuração salva",
          resultado.message ?? "As próximas consultas ao Firebird já usam os novos valores."
        );
      } else {
        setErro(resultado.message ?? "Não foi possível salvar a configuração.");
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card
      title="Firebird — ERP/RH (.env)"
      description="Conexão só leitura com o Syspro (ERP/RH), usada pelo módulo de Aprovações pra buscar colaborador, depto/setor e salário. Vem do .env do servidor — salvar aqui grava no arquivo e recicla só esta conexão (não afeta o resto do portal nem exige reiniciar o processo)."
    >
      <Stack gap={16}>
        <FormGrid columns={2}>
          <Field label="Host" hint='ex: "192.168.0.192"'>
            <Input
              value={formulario.host}
              onChange={(event) => setFormulario((atual) => ({ ...atual, host: event.target.value }))}
            />
          </Field>

          <Field label="Porta">
            <NumberInput
              value={formulario.port}
              onChange={(event) => setFormulario((atual) => ({ ...atual, port: event.target.value }))}
            />
          </Field>
        </FormGrid>

        <Field label="Caminho do banco" hint='ex: "/syspro/bd/sysdb.fbd"'>
          <Input
            value={formulario.database}
            onChange={(event) => setFormulario((atual) => ({ ...atual, database: event.target.value }))}
          />
        </Field>

        <FormGrid columns={2}>
          <Field label="Usuário">
            <Input
              value={formulario.user}
              onChange={(event) => setFormulario((atual) => ({ ...atual, user: event.target.value }))}
            />
          </Field>

          <Field
            label="Senha"
            hint={
              configuracaoFirebird?.senhaConfigurada
                ? "deixe em branco para manter a senha já configurada"
                : "obrigatória na primeira configuração"
            }
          >
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={configuracaoFirebird?.senhaConfigurada ? "••••••••" : ""}
              value={formulario.senha}
              onChange={(event) => setFormulario((atual) => ({ ...atual, senha: event.target.value }))}
            />
          </Field>
        </FormGrid>

        <FormGrid columns={2}>
          <Field label="Charset" hint='ex: "UTF8"'>
            <Input
              value={formulario.charset}
              onChange={(event) => setFormulario((atual) => ({ ...atual, charset: event.target.value }))}
            />
          </Field>

          <Field label="Role" hint='ex: "RLCONSULTA" — deixe em branco se não usar role'>
            <Input
              value={formulario.role}
              onChange={(event) => setFormulario((atual) => ({ ...atual, role: event.target.value }))}
            />
          </Field>
        </FormGrid>

        <FormGrid columns={2}>
          <Field label="Pool mínimo">
            <NumberInput
              value={formulario.poolMin}
              min={0}
              onChange={(event) => setFormulario((atual) => ({ ...atual, poolMin: event.target.value }))}
            />
          </Field>

          <Field label="Pool máximo">
            <NumberInput
              value={formulario.poolMax}
              min={1}
              onChange={(event) => setFormulario((atual) => ({ ...atual, poolMax: event.target.value }))}
            />
          </Field>
        </FormGrid>

        {erro && <Alert variant="danger">{erro}</Alert>}

        {resultadoTeste && (
          <Alert variant={resultadoTeste.sucesso ? "success" : "danger"}>
            {resultadoTeste.mensagem}
          </Alert>
        )}

        <Stack direction="row" justify="end" gap={10}>
          <Button
            variant="secondary"
            onClick={handleTestar}
            loading={testando}
            disabled={!camposObrigatoriosPreenchidos}
          >
            Testar conexão
          </Button>

          <Button onClick={handleSalvar} loading={salvando} disabled={!camposObrigatoriosPreenchidos}>
            Salvar configuração
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
