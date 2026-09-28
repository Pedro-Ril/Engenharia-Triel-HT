"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";

import {
  buscarConfigAprovacoes,
  salvarConfigAprovacoes,
} from "../services/adminPermissoes.service";
import type { FeedbackHandler } from "../types/toast.types";

interface AprovacoesConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarDataHora(valorIso: string | null): string {
  if (!valorIso) return "";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/*
 * Destino do relatório que o SOLICITANTE dispara em "Minhas
 * Solicitações" quando a direção termina de decidir a solicitação.
 * Endereço único de propósito: é o único e-mail do módulo que leva
 * nome, salário e valores no corpo, então quanto menos gente na lista,
 * melhor.
 */
export function AprovacoesConfigPainel({ onFeedback }: AprovacoesConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [email, setEmail] = useState("");
  const [urlPublica, setUrlPublica] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [atualizadoPor, setAtualizadoPor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    buscarConfigAprovacoes().then((resultado) => {
      if (resultado.ok && resultado.data) {
        setEmail(resultado.data.emailRelatorio ?? "");
        setUrlPublica(resultado.data.urlPublica ?? "");
        setAtualizadoEm(resultado.data.atualizadoEm);
        setAtualizadoPor(resultado.data.atualizadoPor);
      }
      setCarregando(false);
    });
  }, []);

  async function handleSalvar() {
    setSalvando(true);
    setErro(null);

    try {
      const resultado = await salvarConfigAprovacoes({
        emailRelatorio: email.trim() || null,
        urlPublica: urlPublica.trim() || null,
      });

      if (resultado.ok && resultado.data) {
        setAtualizadoEm(resultado.data.atualizadoEm);
        setAtualizadoPor(resultado.data.atualizadoPor);
        onFeedback(
          "success",
          "Configuração salva",
          resultado.data.emailRelatorio
            ? `Os relatórios passam a ir para ${resultado.data.emailRelatorio}.`
            : "Sem e-mail cadastrado — o envio de relatório fica indisponível."
        );
      } else {
        setErro(resultado.message ?? "Não foi possível salvar a configuração.");
      }
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <Loader label="Carregando configuração..." />;
  }

  return (
    <Card
      title="Relatório por e-mail"
      description="Para onde vai o relatório que o solicitante envia quando a solicitação termina de ser decidida."
    >
      <Stack gap={16}>
        <Alert variant="warning" title="Este e-mail recebe dado sensível">
          É o único e-mail do módulo que leva nome do colaborador, salário e valores no corpo da
          mensagem. Todos os outros avisos do centro de aprovações são genéricos de propósito. Use um
          endereço controlado (RH ou diretoria) e revise antes de salvar.
        </Alert>

        <Field
          label="E-mail de destino"
          htmlFor="emailRelatorio"
          hint="Deixe em branco para desativar o envio — o botão em Minhas Solicitações passa a avisar que não há destino configurado."
        >
          <Input
            id="emailRelatorio"
            type="email"
            value={email}
            placeholder="rh@trielht.com.br"
            disabled={salvando}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field
          label="URL pública do portal"
          htmlFor="urlPublica"
          hint="Endereço que aparece nos links dos e-mails do módulo. Sem isso, atrás do proxy o link sai como http://localhost:3000. Ex.: http://proserver.trielht.com.br"
        >
          <Input
            id="urlPublica"
            value={urlPublica}
            placeholder="http://proserver.trielht.com.br"
            disabled={salvando}
            onChange={(event) => setUrlPublica(event.target.value)}
          />
        </Field>

        {erro && <Alert variant="danger">{erro}</Alert>}

        {atualizadoEm && (
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Última alteração em {formatarDataHora(atualizadoEm)}
            {atualizadoPor ? ` por ${atualizadoPor}` : ""}.
          </span>
        )}

        <Stack direction="row" justify="end">
          <Button onClick={handleSalvar} loading={salvando}>
            <Mail size={16} />
            Salvar
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
