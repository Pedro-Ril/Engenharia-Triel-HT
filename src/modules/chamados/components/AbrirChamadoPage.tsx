"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Home, LifeBuoy, X } from "lucide-react";
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
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Stack } from "@/components/ui/Stack";

import {
  abrirChamado,
  adicionarUsuarioCopiaChamado,
  buscarOpcoesUnidadeChamado,
} from "../services/chamados.service";
import type {
  CategoriaChamado,
  OpcoesUnidadeChamado,
  PrioridadeChamado,
  SetorChamado,
} from "../types/chamados.types";
import { LIMITE_TEXTO_MENSAGEM, mensagemVazia, useImagensColadas } from "../utils/mensagemFormatada";
import { PRIORIDADE_LABELS } from "./ChamadoBadges";
import styles from "./Chamados.module.css";
import { UsuarioAutocomplete } from "./UsuarioAutocomplete";

const OPCOES_PRIORIDADE = (Object.keys(PRIORIDADE_LABELS) as PrioridadeChamado[]).map(
  (prioridade) => ({ value: prioridade, label: PRIORIDADE_LABELS[prioridade].label })
);

interface AbrirChamadoPageProps {
  setores: SetorChamado[];
  categorias: CategoriaChamado[];
  usuarioLogado: { nomeExibicao: string; email: string | null } | null;
  /* Atendente de algum setor ou admin -- só essas pessoas podem abrir um chamado em nome de outra. */
  podeAbrirEmNomeDe: boolean;
  /* Unidades do próprio usuário logado (ver opcoesUnidadeParaChamado) -- anônimo: "nenhuma". */
  opcoesUnidade: OpcoesUnidadeChamado;
}

const SEM_UNIDADE: OpcoesUnidadeChamado = { modo: "nenhuma", unidades: [] };

function unidadeInicial(opcoes: OpcoesUnidadeChamado): string {
  return opcoes.modo === "fixa" ? (opcoes.unidades[0]?.id ?? "") : "";
}

export function AbrirChamadoPage({
  setores,
  categorias,
  usuarioLogado,
  podeAbrirEmNomeDe,
  opcoesUnidade: opcoesUnidadeProprias,
}: AbrirChamadoPageProps) {
  const [setorId, setSetorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [descricaoTexto, setDescricaoTexto] = useState("");
  const imagensColadas = useImagensColadas();
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [anexos, setAnexos] = useState<File[]>([]);
  const [solicitanteAlvo, setSolicitanteAlvo] = useState<{ id: string; nomeExibicao: string } | null>(
    null
  );
  const [copiaSelecionada, setCopiaSelecionada] = useState<{ id: string; nomeExibicao: string }[]>([]);

  /*
   * Unidade é sempre a do SOLICITANTE: no "abrir em nome de", troca para
   * as opções do alvo (buscadas na hora); ao cancelar, volta às próprias.
   */
  const [opcoesUnidade, setOpcoesUnidade] = useState<OpcoesUnidadeChamado>(opcoesUnidadeProprias);
  const [unidadeId, setUnidadeId] = useState(() => unidadeInicial(opcoesUnidadeProprias));
  const [carregandoUnidades, setCarregandoUnidades] = useState(false);
  /* Resposta atrasada de um alvo já trocado/cancelado é descartada. */
  const buscaUnidadesRef = useRef(0);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoCopia, setAvisoCopia] = useState<string | null>(null);
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

  function aplicarOpcoesUnidade(opcoes: OpcoesUnidadeChamado) {
    setOpcoesUnidade(opcoes);
    setUnidadeId(unidadeInicial(opcoes));
  }

  async function selecionarSolicitanteAlvo(alvo: { id: string; nomeExibicao: string }) {
    const busca = ++buscaUnidadesRef.current;

    setSolicitanteAlvo(alvo);
    aplicarOpcoesUnidade(SEM_UNIDADE);
    setCarregandoUnidades(true);

    try {
      const resultado = await buscarOpcoesUnidadeChamado(alvo.id);
      if (busca !== buscaUnidadesRef.current) return;

      if (resultado.ok && resultado.data) {
        aplicarOpcoesUnidade(resultado.data);
      } else {
        setErro(resultado.message ?? "Não foi possível carregar as unidades dessa pessoa.");
      }
    } catch {
      if (busca === buscaUnidadesRef.current) {
        setErro("Não foi possível carregar as unidades dessa pessoa.");
      }
    } finally {
      if (busca === buscaUnidadesRef.current) setCarregandoUnidades(false);
    }
  }

  function cancelarSolicitanteAlvo() {
    buscaUnidadesRef.current++;
    setSolicitanteAlvo(null);
    setCarregandoUnidades(false);
    aplicarOpcoesUnidade(opcoesUnidadeProprias);
  }

  const precisaEscolherUnidade = opcoesUnidade.modo === "escolher" && !unidadeId;

  async function handleSubmit() {
    setErro(null);

    if (!setorId) {
      setErro("Selecione um setor.");
      return;
    }

    if (precisaEscolherUnidade) {
      setErro("Selecione a unidade deste chamado.");
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

    if (descricaoTexto.trim().length > LIMITE_TEXTO_MENSAGEM) {
      setErro(`A descrição passou de ${LIMITE_TEXTO_MENSAGEM} caracteres.`);
      return;
    }

    setEnviando(true);

    try {
      const formData = new FormData();
      formData.append("setorId", setorId);
      formData.append("categoriaId", categoriaId);
      formData.append("prioridade", prioridade);
      formData.append("titulo", titulo);
      imagensColadas.anexarAoFormulario(formData, "descricao", descricao);

      if (!usuarioLogado) {
        formData.append("nome", nome);
        if (contato.trim()) formData.append("contato", contato.trim());
      }

      if (solicitanteAlvo) {
        formData.append("solicitanteAlvoId", solicitanteAlvo.id);
      }

      if (unidadeId) {
        formData.append("unidadeId", unidadeId);
      }

      for (const arquivo of anexos) {
        formData.append("anexos", arquivo);
      }

      const resultado = await abrirChamado(formData);

      if (resultado.ok && resultado.data) {
        const numero = resultado.data.numero;

        if (copiaSelecionada.length > 0) {
          const resultadosCopia = await Promise.all(
            copiaSelecionada.map((pessoa) => adicionarUsuarioCopiaChamado(numero, pessoa.id))
          );

          if (resultadosCopia.some((item) => !item.ok)) {
            setAvisoCopia(
              "O chamado foi aberto, mas não foi possível adicionar todas as pessoas em cópia — adicione novamente pela tela do chamado."
            );
          }
        }

        imagensColadas.limpar();
        setNumeroCriado(numero);
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

            {avisoCopia && <Alert variant="warning">{avisoCopia}</Alert>}

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
                  setDescricaoTexto("");
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

      <Card allowOverflow>
        <Stack gap={20}>
          {usuarioLogado ? (
            <Stack gap={12}>
              <Alert variant="info">
                {solicitanteAlvo ? (
                  <>
                    Abrindo em nome de <strong>{solicitanteAlvo.nomeExibicao}</strong> — registrado por{" "}
                    {usuarioLogado.nomeExibicao}.{" "}
                    <button
                      type="button"
                      className={styles.linkBotao}
                      onClick={cancelarSolicitanteAlvo}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>Abrindo como <strong>{usuarioLogado.nomeExibicao}</strong>.</>
                )}
              </Alert>

              <FormGrid columns={2}>
                {podeAbrirEmNomeDe && !solicitanteAlvo && (
                  <Field label="Abrir em nome de outra pessoa" hint="opcional — deixe em branco pra abrir para você mesmo">
                    <UsuarioAutocomplete
                      placeholder="Buscar usuário por nome ou e-mail"
                      onSelecionar={(usuario) =>
                        void selecionarSolicitanteAlvo({
                          id: usuario.id,
                          nomeExibicao: usuario.nomeExibicao,
                        })
                      }
                    />
                  </Field>
                )}

                <Field label="Pessoas em cópia" hint="opcional — recebem as respostas deste chamado por e-mail">
                  <Stack gap={8}>
                    {copiaSelecionada.length > 0 && (
                      <div className={styles.copiaLista}>
                        {copiaSelecionada.map((pessoa) => (
                          <span key={pessoa.id} className={styles.copiaChip}>
                            {pessoa.nomeExibicao}
                            <button
                              type="button"
                              className={styles.copiaChipRemover}
                              aria-label={`Remover ${pessoa.nomeExibicao} da cópia`}
                              onClick={() =>
                                setCopiaSelecionada((atual) => atual.filter((item) => item.id !== pessoa.id))
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <UsuarioAutocomplete
                      paraCopia
                      placeholder="Buscar usuário por nome ou e-mail"
                      onSelecionar={(usuario) =>
                        setCopiaSelecionada((atual) =>
                          atual.some((item) => item.id === usuario.id)
                            ? atual
                            : [...atual, { id: usuario.id, nomeExibicao: usuario.nomeExibicao }]
                        )
                      }
                    />
                  </Stack>
                </Field>
              </FormGrid>
            </Stack>
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

          {(carregandoUnidades || opcoesUnidade.modo !== "nenhuma") && (
            <FormGrid columns={3}>
              {carregandoUnidades ? (
                <Field label="Unidade">
                  <Input value="Carregando unidades..." disabled readOnly />
                </Field>
              ) : opcoesUnidade.modo === "fixa" ? (
                <Field
                  label="Unidade"
                  hint={solicitanteAlvo ? "a unidade cadastrada para essa pessoa" : "a unidade do seu cadastro"}
                >
                  <Input value={opcoesUnidade.unidades[0]?.nome ?? ""} disabled readOnly />
                </Field>
              ) : (
                <Field
                  label="Unidade"
                  required
                  hint={
                    solicitanteAlvo
                      ? "de qual unidade é este chamado"
                      : "você está em mais de uma unidade — de qual é este chamado?"
                  }
                >
                  <Dropdown
                    value={unidadeId}
                    onValueChange={setUnidadeId}
                    placeholder="Selecione a unidade"
                    options={opcoesUnidade.unidades.map((unidade) => ({
                      value: unidade.id,
                      label: unidade.nome,
                    }))}
                  />
                </Field>
              )}
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

          <Field
            label="Descrição"
            required
            hint={`${descricaoTexto.trim().length}/${LIMITE_TEXTO_MENSAGEM} caracteres · dá para colar prints (Ctrl+V) e tabelas do Excel`}
          >
            <RichTextEditor
              tabelas
              alturaMinima={160}
              value={descricao}
              placeholder="Descreva com o máximo de detalhes possível: o que aconteceu, quando, e o que você esperava que acontecesse."
              imagemUpload={imagensColadas.registrar}
              onChange={(html, texto) => {
                setDescricao(html);
                setDescricaoTexto(texto);
              }}
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
                carregandoUnidades ||
                precisaEscolherUnidade ||
                !setorId ||
                !categoriaId ||
                !prioridade ||
                !titulo.trim() ||
                mensagemVazia(descricao, descricaoTexto)
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
