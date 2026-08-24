"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Home, LifeBuoy } from "lucide-react";
import Link from "next/link";

import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";

import { abrirChamado } from "../services/chamados.service";
import type { CategoriaChamado, PrioridadeChamado, SetorChamado } from "../types/chamados.types";
import { PRIORIDADE_LABELS } from "./ChamadoBadges";
import styles from "./Chamados.module.css";

const OPCOES_PRIORIDADE = (Object.keys(PRIORIDADE_LABELS) as PrioridadeChamado[]).map(
  (prioridade) => ({ value: prioridade, label: PRIORIDADE_LABELS[prioridade].label })
);

interface AbrirChamadoPageProps {
  setores: SetorChamado[];
  categorias: CategoriaChamado[];
  usuarioLogado: { nomeExibicao: string; email: string | null } | null;
}

export function AbrirChamadoPage({ setores, categorias, usuarioLogado }: AbrirChamadoPageProps) {
  const [setorId, setSetorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [anexos, setAnexos] = useState<File[]>([]);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [numeroCriado, setNumeroCriado] = useState<number | null>(null);

  const categoriasDoSetor = useMemo(
    () => categorias.filter((categoria) => categoria.setorId === setorId),
    [categorias, setorId]
  );

  /*
   * Limpa a categoria escolhida ao trocar de setor (nunca
   * pré-seleciona a primeira — a pessoa que abre o chamado tem
   * que escolher). Ajuste durante a renderização (não em
   * useEffect) porque é reagir a uma mudança de estado/prop, não
   * sincronizar com um sistema externo. Ver "Adjusting state when
   * a prop changes" na doc do React.
   */
  const [setorIdAnterior, setSetorIdAnterior] = useState(setorId);
  if (setorId !== setorIdAnterior) {
    setSetorIdAnterior(setorId);
    setCategoriaId("");
  }

  async function handleSubmit() {
    setErro(null);

    if (!setorId) {
      setErro("Selecione um setor.");
      return;
    }

    if (!categoriaId) {
      setErro("Selecione uma categoria.");
      return;
    }

    if (!prioridade) {
      setErro("Selecione a prioridade.");
      return;
    }

    if (!usuarioLogado && !nome.trim()) {
      setErro("Informe seu nome.");
      return;
    }

    setEnviando(true);

    try {
      const formData = new FormData();
      formData.append("setorId", setorId);
      formData.append("categoriaId", categoriaId);
      formData.append("prioridade", prioridade);
      formData.append("titulo", titulo);
      formData.append("descricao", descricao);

      if (!usuarioLogado) {
        formData.append("nome", nome);
        if (contato.trim()) formData.append("contato", contato.trim());
      }

      for (const arquivo of anexos) {
        formData.append("anexos", arquivo);
      }

      const resultado = await abrirChamado(formData);

      if (resultado.ok && resultado.data) {
        setNumeroCriado(resultado.data.numero);
      } else {
        setErro(resultado.message ?? "Não foi possível abrir o chamado.");
      }
    } finally {
      setEnviando(false);
    }
  }

  if (numeroCriado) {
    return (
      <PageContainer>
        <Breadcrumb
          items={[
            { label: "Início", href: "/", icon: <Home size={14} /> },
            { label: "Chamados", href: "/chamados", icon: <LifeBuoy size={14} /> },
            { label: `Nº ${numeroCriado}`, current: true },
          ]}
        />

        <Card>
          <Stack gap={16} align="center" className={styles.confirmacao}>
            <CheckCircle2 size={48} className={styles.confirmacaoIcone} />

            <h2 className={styles.confirmacaoTitulo}>Chamado aberto com sucesso!</h2>

            <p className={styles.confirmacaoNumero}>
              Nº <strong>{numeroCriado}</strong>
            </p>

            <p>
              Guarde este número — {usuarioLogado ? (
                <>ele também aparece em <Link href="/chamados/meus">Meus chamados</Link>.</>
              ) : (
                <>
                  ele é o que você vai usar para consultar o andamento em{" "}
                  <Link href="/chamados/consultar">Consultar chamado</Link>.
                </>
              )}
            </p>

            <Stack direction="row" gap={10}>
              <Link href={`/chamados/${numeroCriado}${!usuarioLogado ? `?nome=${encodeURIComponent(nome)}` : ""}`}>
                <Button>Ver chamado</Button>
              </Link>

              <Button
                variant="secondary"
                onClick={() => {
                  setNumeroCriado(null);
                  setTitulo("");
                  setDescricao("");
                  setAnexos([]);
                }}
              >
                Abrir outro chamado
              </Button>
            </Stack>
          </Stack>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Abrir chamado"
        description="Conte o que está acontecendo — o time responsável pelo setor vai te responder por aqui."
        actions={
          <Stack direction="row" gap={10}>
            <Link href="/chamados/consultar">
              <Button variant="secondary">Consultar chamado</Button>
            </Link>

            {usuarioLogado && (
              <Link href="/chamados/meus">
                <Button variant="secondary">Meus chamados</Button>
              </Link>
            )}
          </Stack>
        }
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Chamados", current: true, icon: <LifeBuoy size={14} /> },
        ]}
      />

      <Card>
        <Stack gap={20}>
          {usuarioLogado ? (
            <Alert variant="info">
              Abrindo como <strong>{usuarioLogado.nomeExibicao}</strong>.
            </Alert>
          ) : (
            <FormGrid columns={2}>
              <Field label="Seu nome" required>
                <Input value={nome} onChange={(event) => setNome(event.target.value)} />
              </Field>

              <Field label="Contato" hint="e-mail ou telefone (opcional)">
                <Input value={contato} onChange={(event) => setContato(event.target.value)} />
              </Field>
            </FormGrid>
          )}

          <FormGrid columns={3}>
            <Field label="Setor" required>
              {setores.length === 0 ? (
                <Alert variant="warning">
                  Nenhum setor está aceitando chamados no momento. Tente novamente mais tarde.
                </Alert>
              ) : (
                <Dropdown
                  value={setorId}
                  onValueChange={setSetorId}
                  placeholder="Selecione o setor"
                  options={setores.map((setor) => ({ value: setor.id, label: setor.nome }))}
                />
              )}
            </Field>

            <Field label="Categoria" required>
              {!setorId ? (
                <Alert variant="warning">Escolha um setor antes.</Alert>
              ) : categoriasDoSetor.length === 0 ? (
                <Alert variant="warning">
                  Nenhuma categoria cadastrada para este setor ainda.
                </Alert>
              ) : (
                <Dropdown
                  value={categoriaId}
                  onValueChange={setCategoriaId}
                  placeholder="Selecione a categoria"
                  options={categoriasDoSetor.map((categoria) => ({
                    value: categoria.id,
                    label: categoria.nome,
                  }))}
                />
              )}
            </Field>

            <Field
              label="Prioridade"
              required
              hint="sua percepção — o atendente pode ajustar depois"
            >
              <Dropdown
                value={prioridade}
                onValueChange={setPrioridade}
                placeholder="Selecione a prioridade"
                options={OPCOES_PRIORIDADE}
              />
            </Field>
          </FormGrid>

          <Field label="Título" required hint={`${titulo.length}/200 caracteres`}>
            <Input
              value={titulo}
              maxLength={200}
              placeholder="Resuma o problema em poucas palavras"
              onChange={(event) => setTitulo(event.target.value)}
            />
          </Field>

          <Field label="Descrição" required hint={`${descricao.length}/4000 caracteres`}>
            <Textarea
              rows={6}
              maxLength={4000}
              value={descricao}
              placeholder="Descreva com o máximo de detalhes possível: o que aconteceu, quando, e o que você esperava que acontecesse."
              onChange={(event) => setDescricao(event.target.value)}
            />
          </Field>

          <Field label="Anexos" hint="prints, documentos... até 10 MB por arquivo">
            <FileUpload multiple maxSizeMB={10} files={anexos} onFilesChange={setAnexos} />
          </Field>

          {erro && <Alert variant="danger">{erro}</Alert>}

          <Stack direction="row" justify="end">
            <Button
              onClick={handleSubmit}
              loading={enviando}
              disabled={
                !setorId || !categoriaId || !prioridade || !titulo.trim() || !descricao.trim()
              }
            >
              Abrir chamado
            </Button>
          </Stack>
        </Stack>
      </Card>
    </PageContainer>
  );
}
