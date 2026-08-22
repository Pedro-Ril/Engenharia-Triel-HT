"use client";

import { useState } from "react";
import { Home, LifeBuoy } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";

export function ConsultarChamadoForm() {
  const router = useRouter();

  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function handleConsultar() {
    setErro(null);

    const numeroLimpo = numero.trim().replace(/\D/g, "");

    if (!numeroLimpo) {
      setErro("Informe o número do chamado.");
      return;
    }

    if (!nome.trim()) {
      setErro("Informe o nome usado na abertura do chamado.");
      return;
    }

    router.push(`/chamados/${numeroLimpo}?nome=${encodeURIComponent(nome.trim())}`);
  }

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Chamados", href: "/chamados", icon: <LifeBuoy size={14} /> },
          { label: "Consultar", current: true },
        ]}
      />

      <PageHeader
        title="Consultar chamado"
        description="Informe o número do chamado e o nome usado na abertura para acompanhar o andamento."
      />

      <Card>
        <Stack gap={20}>
          <Field label="Número do chamado" required>
            <Input
              value={numero}
              placeholder="ex: 1042"
              inputMode="numeric"
              onChange={(event) => setNumero(event.target.value)}
            />
          </Field>

          <Field label="Nome usado na abertura" required>
            <Input value={nome} onChange={(event) => setNome(event.target.value)} />
          </Field>

          {erro && <Alert variant="danger">{erro}</Alert>}

          <Stack direction="row" justify="end">
            <Button onClick={handleConsultar}>Consultar</Button>
          </Stack>
        </Stack>
      </Card>
    </PageContainer>
  );
}
