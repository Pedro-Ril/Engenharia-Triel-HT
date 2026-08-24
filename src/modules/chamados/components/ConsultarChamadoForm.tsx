"use client";

import { useEffect, useState } from "react";
import { Home, LifeBuoy, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";

import { pesquisarChamados } from "../services/chamados.service";
import type { ChamadoResumo } from "../types/chamados.types";
import { PrioridadeBadge, StatusBadge } from "./ChamadoBadges";
import styles from "./Chamados.module.css";

const TAMANHO_MINIMO_TERMO = 2;

export function ConsultarChamadoForm() {
  const router = useRouter();

  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const [termoDigitado, setTermoDigitado] = useState("");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ChamadoResumo[]>([]);
  /* Termo já respondido pela última busca concluída — enquanto for diferente de `termo`, há uma busca em andamento. */
  const [termoConsultado, setTermoConsultado] = useState("");

  /* Sem isso, cada tecla digitada na busca disparava uma requisição imediata. */
  useEffect(() => {
    const temporizador = setTimeout(() => setTermo(termoDigitado.trim()), 400);
    return () => clearTimeout(temporizador);
  }, [termoDigitado]);

  useEffect(() => {
    if (termo.length < TAMANHO_MINIMO_TERMO) {
      return;
    }

    let cancelado = false;

    pesquisarChamados(termo).then((resultado) => {
      if (cancelado) return;
      setResultados(resultado.ok ? (resultado.data ?? []) : []);
      setTermoConsultado(termo);
    });

    return () => {
      cancelado = true;
    };
  }, [termo]);

  const buscaHabilitada = termo.length >= TAMANHO_MINIMO_TERMO;
  const buscando = buscaHabilitada && termoConsultado !== termo;
  const resultadosVisiveis = buscaHabilitada && !buscando ? resultados : [];

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
      <PageHeader
        title="Consultar chamado"
        description="Informe o número do chamado e o nome usado na abertura, ou busque por palavra-chave."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Chamados", href: "/chamados", icon: <LifeBuoy size={14} /> },
          { label: "Consultar", current: true },
        ]}
      />

      <Card title="Buscar por título ou descrição">
        <Stack gap={16}>
          <Field
            label="Palavra-chave"
            hint="Mostra chamados públicos e, se você estiver logado, também os seus."
          >
            <Input
              value={termoDigitado}
              placeholder="ex: como criar um chamado"
              onChange={(event) => setTermoDigitado(event.target.value)}
            />
          </Field>

          {buscando && <Loader label="Buscando..." />}

          {!buscando && buscaHabilitada && resultadosVisiveis.length === 0 && (
            <EmptyState
              icon={<Search size={26} />}
              title="Nenhum chamado encontrado"
              description="Tente outra palavra-chave."
            />
          )}

          {!buscando && resultadosVisiveis.length > 0 && (
            <div className={styles.resultadoBuscaLista}>
              {resultadosVisiveis.map((chamado) => (
                <button
                  key={chamado.id}
                  type="button"
                  className={styles.resultadoBusca}
                  onClick={() => router.push(`/chamados/${chamado.numero}`)}
                >
                  <div className={styles.resultadoBuscaInfo}>
                    <span className={styles.resultadoBuscaNumero}>
                      Nº {chamado.numero}
                      {chamado.categoriaNome ? ` · ${chamado.categoriaNome}` : ""}
                    </span>
                    <span className={styles.resultadoBuscaTitulo}>{chamado.titulo}</span>
                  </div>

                  <div className={styles.resultadoBuscaBadges}>
                    <StatusBadge status={chamado.status} />
                    <PrioridadeBadge prioridade={chamado.prioridade} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Stack>
      </Card>

      <Card title="Buscar por número e nome">
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
