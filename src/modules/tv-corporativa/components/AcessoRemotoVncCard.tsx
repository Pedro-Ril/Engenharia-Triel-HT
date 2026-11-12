"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { desligarVncTv, salvarSenhaVncTv } from "../services/tvCorporativa.service";

interface AcessoRemotoVncCardProps {
  senhaDefinida: boolean;
  onFeedback: FeedbackHandler;
}

/*
 * Senha do x11vnc dos terminais Linux (uma só para todos). A senha nunca
 * volta do servidor -- aqui só se define uma nova ou se desliga. O
 * agente aplica no próximo ciclo de configuração (até 5 min) -- ver
 * tv-agente/agente.mjs, iniciarProcessoVnc.
 */
export function AcessoRemotoVncCard({ senhaDefinida, onFeedback }: AcessoRemotoVncCardProps) {
  const [ligado, setLigado] = useState(senhaDefinida);
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmandoDesligar, setConfirmandoDesligar] = useState(false);
  const [desligando, setDesligando] = useState(false);

  const senhaValida = senha.length >= 6 && senha.length <= 8;

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarSenhaVncTv(senha);

      if (resultado.ok) {
        setLigado(true);
        setSenha("");
        onFeedback(
          "success",
          "Senha do acesso remoto salva",
          "Os terminais Linux aplicam em até 5 minutos."
        );
      } else {
        onFeedback("danger", "Não foi possível salvar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleDesligar() {
    setDesligando(true);

    try {
      const resultado = await desligarVncTv();

      if (resultado.ok) {
        setLigado(false);
        setConfirmandoDesligar(false);
        onFeedback("success", "Acesso remoto desligado", "Os terminais Linux desligam o VNC em até 5 minutos.");
      } else {
        onFeedback("danger", "Não foi possível desligar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setDesligando(false);
    }
  }

  return (
    <Card
      title="Acesso remoto (VNC)"
      description="Para ver e mexer na tela de um terminal Linux à distância, com o VNC Viewer. Uma senha só para todos os terminais."
      actions={<Badge variant={ligado ? "success" : "neutral"}>{ligado ? "Ligado" : "Desligado"}</Badge>}
    >
      <Stack gap={16}>
        <Field
          label={ligado ? "Trocar a senha" : "Senha"}
          htmlFor="tv-vnc-senha"
          hint={`${senha.length}/8 caracteres · de 6 a 8, sem espaço nem acento (o VNC só usa os 8 primeiros)`}
        >
          <Input
            id="tv-vnc-senha"
            type="password"
            autoComplete="new-password"
            maxLength={8}
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            placeholder={ligado ? "Nova senha" : "Defina uma senha para ligar"}
          />
        </Field>

        <Alert variant="info">
          No VNC Viewer, conecte no <strong>IP do terminal</strong> (nos detalhes do agente, em Dispositivos), porta
          padrão 5900, e use esta senha. Só funciona na rede interna. Terminais instalados antes desta opção precisam,
          uma vez, de <code>sudo apt-get install -y x11vnc</code> via SSH.
        </Alert>

        <Stack direction="row" justify="end" gap={10}>
          {ligado && (
            <Button variant="secondary" onClick={() => setConfirmandoDesligar(true)}>
              Desligar acesso remoto
            </Button>
          )}

          <Button onClick={handleSalvar} loading={salvando} disabled={!senhaValida}>
            {ligado ? "Trocar senha" : "Ligar acesso remoto"}
          </Button>
        </Stack>
      </Stack>

      <ConfirmDialog
        open={confirmandoDesligar}
        title="Desligar o acesso remoto?"
        message="O VNC é desligado em todos os terminais Linux (em até 5 minutos), e quem estiver conectado cai."
        confirmLabel="Desligar"
        variant="warning"
        loading={desligando}
        onConfirm={handleDesligar}
        onClose={() => setConfirmandoDesligar(false)}
      />
    </Card>
  );
}
