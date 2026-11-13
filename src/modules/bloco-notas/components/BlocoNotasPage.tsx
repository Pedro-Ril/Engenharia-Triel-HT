"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  CloudOff,
  FileText,
  Home,
  Loader2,
  NotebookPen,
  PanelLeft,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Stack } from "@/components/ui/Stack";
import { Toast } from "@/components/ui/Toast";

import {
  abrirPagina,
  buscarNasNotas,
  criarPagina,
  enviarImagemNota,
  enviarParaLixeira,
  listarPaginas,
  moverPagina,
  reordenarPaginas,
  salvarPagina,
} from "../services/blocoNotas.service";
import type { NoArvore, Pagina, PaginaResumo, ResultadoBusca } from "../types/blocoNotas.types";
import { ancestrais, idsDaSubarvore, montarArvore, tituloOuPadrao } from "../utils/arvore";
import { ArvorePaginas } from "./ArvorePaginas";
import styles from "./BlocoNotas.module.css";
import { LixeiraModal } from "./LixeiraModal";
import { MoverPaginaModal } from "./MoverPaginaModal";

/* Grava ~1 s depois de parar de digitar. */
const ESPERA_GRAVACAO_MS = 1000;
const ESPERA_BUSCA_MS = 400;
const CHAVE_EXPANDIDOS = "bloco-notas-expandidos";

type StatusGravacao = "salvo" | "pendente" | "salvando" | "erro" | "conflito";

interface CamposPendentes {
  titulo?: string;
  conteudo?: string;
}

function lerExpandidos(): Set<string> {
  try {
    const bruto = localStorage.getItem(CHAVE_EXPANDIDOS);
    return new Set(bruto ? (JSON.parse(bruto) as string[]) : []);
  } catch {
    return new Set();
  }
}

function guardarExpandidos(ids: Set<string>) {
  try {
    localStorage.setItem(CHAVE_EXPANDIDOS, JSON.stringify([...ids]));
  } catch {
    /* sem localStorage (modo privado): só não lembra o que estava aberto */
  }
}

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function BlocoNotasPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paginaDaUrl = searchParams.get("pagina");

  const [paginas, setPaginas] = useState<PaginaResumo[] | null>(null);
  const [naLixeira, setNaLixeira] = useState(0);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(() => new Set());
  const [lateralAberta, setLateralAberta] = useState(true);

  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [status, setStatus] = useState<StatusGravacao>("salvo");
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [erroGravacao, setErroGravacao] = useState<string | null>(null);
  const [focarTitulo, setFocarTitulo] = useState(false);

  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null);

  const [moverNo, setMoverNo] = useState<NoArvore | null>(null);
  const [excluirNo, setExcluirNo] = useState<NoArvore | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [aviso, setAviso] = useState<{ variante: "success" | "danger"; titulo: string; texto?: string } | null>(null);

  /* Gravação automática: o que falta gravar, de qual página, em que versão. */
  const paginaIdRef = useRef<string | null>(null);
  const versaoRef = useRef(0);
  const pendenteRef = useRef<CamposPendentes>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gravacaoRef = useRef<Promise<void> | null>(null);
  const statusRef = useRef<StatusGravacao>("salvo");
  const tituloRef = useRef<HTMLInputElement>(null);

  const mudarStatus = useCallback((novo: StatusGravacao) => {
    statusRef.current = novo;
    setStatus(novo);
  }, []);

  const arvore = useMemo(() => (paginas ? montarArvore(paginas) : []), [paginas]);
  const favoritas = useMemo(() => (paginas ?? []).filter((item) => item.favorita), [paginas]);
  const trilha = useMemo(
    () => (pagina && paginas ? ancestrais(paginas, pagina.id) : []),
    [pagina, paginas]
  );

  const carregarArvore = useCallback(async () => {
    const resultado = await listarPaginas();
    if (resultado.ok && resultado.data) {
      setPaginas(resultado.data.paginas);
      setNaLixeira(resultado.data.naLixeira);
      setErroCarga(null);
      return resultado.data.paginas;
    }
    setErroCarga(resultado.message ?? "Não foi possível abrir o caderno.");
    return null;
  }, []);

  /* ---------- gravação automática ---------- */

  const gravarAgora = useCallback(
    async (forcar = false): Promise<void> => {
      if (gravacaoRef.current) {
        await gravacaoRef.current;
      }

      const id = paginaIdRef.current;
      const campos = pendenteRef.current;
      if (!id || (campos.titulo === undefined && campos.conteudo === undefined)) return;

      pendenteRef.current = {};
      mudarStatus("salvando");

      const tarefa = (async () => {
        const resultado = await salvarPagina(id, {
          ...campos,
          versao: campos.conteudo !== undefined ? versaoRef.current : undefined,
          forcar,
        });

        /* A pessoa trocou de página enquanto gravava: o resultado é da anterior. */
        if (paginaIdRef.current !== id) return;

        if (resultado.ok && resultado.data) {
          if (campos.conteudo !== undefined) versaoRef.current = resultado.data.versao;
          setSalvoEm(resultado.data.atualizadoEm);
          setErroGravacao(null);
          const tituloGravado = resultado.data.titulo;
          if (campos.titulo !== undefined) {
            setPaginas((atual) =>
              atual?.map((item) => (item.id === id ? { ...item, titulo: tituloGravado } : item)) ?? atual
            );
          }
          const aindaFalta = pendenteRef.current.titulo !== undefined || pendenteRef.current.conteudo !== undefined;
          mudarStatus(aindaFalta ? "pendente" : "salvo");
          return;
        }

        /* Não gravou: devolve o que era para gravar (sem apagar o que a pessoa digitou depois). */
        pendenteRef.current = { ...campos, ...pendenteRef.current };
        if (resultado.status === 409) {
          mudarStatus("conflito");
        } else {
          setErroGravacao(resultado.message ?? "Não foi possível salvar.");
          mudarStatus("erro");
        }
      })();

      gravacaoRef.current = tarefa;
      try {
        await tarefa;
      } finally {
        gravacaoRef.current = null;
      }

      if (statusRef.current === "pendente") {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void gravarAgora(), ESPERA_GRAVACAO_MS);
      }
    },
    [mudarStatus]
  );

  const agendarGravacao = useCallback(
    (campos: CamposPendentes) => {
      pendenteRef.current = { ...pendenteRef.current, ...campos };
      if (statusRef.current === "conflito") return; /* espera a pessoa decidir */
      mudarStatus("pendente");
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void gravarAgora(), ESPERA_GRAVACAO_MS);
    },
    [gravarAgora, mudarStatus]
  );

  /* Antes de trocar de página/sair: grava o que estiver pendente. */
  const descarregar = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (statusRef.current !== "conflito") await gravarAgora();
  }, [gravarAgora]);

  /* ---------- abrir / criar ---------- */

  const abrir = useCallback(
    async (id: string, opcoes?: { focarTitulo?: boolean; listaAtual?: PaginaResumo[] | null }) => {
      await descarregar();
      setAbrindo(true);
      setResultados(null);
      setBuscaDigitada("");
      setBusca("");

      const resultado = await abrirPagina(id);
      setAbrindo(false);

      if (!resultado.ok || !resultado.data) {
        setAviso({ variante: "danger", titulo: "Não foi possível abrir a página", texto: resultado.message });
        return;
      }

      const aberta = resultado.data;
      paginaIdRef.current = aberta.id;
      versaoRef.current = aberta.versao;
      pendenteRef.current = {};
      setPagina(aberta);
      setTitulo(aberta.titulo);
      setConteudo(aberta.conteudo);
      setSalvoEm(aberta.atualizadoEm);
      setErroGravacao(null);
      mudarStatus("salvo");
      setFocarTitulo(Boolean(opcoes?.focarTitulo));

      /* Abre a trilha até ela na árvore. */
      const lista = opcoes?.listaAtual ?? paginas ?? [];
      const caminho = ancestrais(lista, aberta.id).map((item) => item.id);
      if (caminho.length > 0) {
        setExpandidos((atual) => {
          const proximo = new Set([...atual, ...caminho]);
          guardarExpandidos(proximo);
          return proximo;
        });
      }

      if (searchParams.get("pagina") !== aberta.id) {
        router.replace(`${pathname}?pagina=${aberta.id}`, { scroll: false });
      }

      if (window.matchMedia("(max-width: 900px)").matches) setLateralAberta(false);
    },
    [descarregar, mudarStatus, paginas, pathname, router, searchParams]
  );

  async function novaPagina(paiId: string | null) {
    const resultado = await criarPagina({ paiId });
    if (!resultado.ok || !resultado.data) {
      setAviso({ variante: "danger", titulo: "Não foi possível criar a página", texto: resultado.message });
      return;
    }

    const criada = resultado.data;
    const lista = [...(paginas ?? []), criada];
    setPaginas(lista);
    if (paiId) {
      setExpandidos((atual) => {
        const proximo = new Set(atual).add(paiId);
        guardarExpandidos(proximo);
        return proximo;
      });
    }
    await abrir(criada.id, { focarTitulo: true, listaAtual: lista });
  }

  /* ---------- efeitos ---------- */

  useEffect(() => {
    setExpandidos(lerExpandidos());
    void carregarArvore();
  }, [carregarArvore]);

  /* Primeira abertura: a página da URL, ou a primeira do caderno. */
  const abriuInicialRef = useRef(false);
  useEffect(() => {
    if (!paginas || abriuInicialRef.current) return;
    abriuInicialRef.current = true;
    const alvo =
      (paginaDaUrl && paginas.some((item) => item.id === paginaDaUrl) && paginaDaUrl) ||
      montarArvore(paginas)[0]?.id;
    if (alvo) void abrir(alvo, { listaAtual: paginas });
  }, [paginas, paginaDaUrl, abrir]);

  useEffect(() => {
    if (focarTitulo) {
      tituloRef.current?.focus();
      setFocarTitulo(false);
    }
  }, [focarTitulo, pagina]);

  /* Busca com espera de 400 ms (nunca uma requisição por tecla). */
  useEffect(() => {
    const temporizador = setTimeout(() => setBusca(buscaDigitada.trim()), ESPERA_BUSCA_MS);
    return () => clearTimeout(temporizador);
  }, [buscaDigitada]);

  useEffect(() => {
    if (busca.length < 2) {
      setResultados(null);
      return;
    }
    let cancelado = false;
    buscarNasNotas(busca).then((resultado) => {
      if (!cancelado) setResultados(resultado.ok && resultado.data ? resultado.data : []);
    });
    return () => {
      cancelado = true;
    };
  }, [busca]);

  /* Sair com algo sem gravar: o navegador pergunta; trocar de aba: grava na hora. */
  useEffect(() => {
    function aoSair(event: BeforeUnloadEvent) {
      if (statusRef.current !== "salvo") event.preventDefault();
    }
    function aoEsconder() {
      if (document.visibilityState === "hidden") void descarregar();
    }
    window.addEventListener("beforeunload", aoSair);
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.removeEventListener("beforeunload", aoSair);
      document.removeEventListener("visibilitychange", aoEsconder);
    };
  }, [descarregar]);

  /* ---------- ações da árvore ---------- */

  function alternar(id: string) {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      guardarExpandidos(proximo);
      return proximo;
    });
  }

  async function favoritar(alvo: { id: string; favorita: boolean }) {
    const favorita = !alvo.favorita;
    setPaginas((atual) => atual?.map((item) => (item.id === alvo.id ? { ...item, favorita } : item)) ?? atual);
    if (pagina?.id === alvo.id) setPagina({ ...pagina, favorita });
    const resultado = await salvarPagina(alvo.id, { favorita });
    if (!resultado.ok) {
      setAviso({ variante: "danger", titulo: "Não foi possível atualizar a favorita", texto: resultado.message });
      void carregarArvore();
    }
  }

  async function reordenar(paiId: string | null, ids: string[]) {
    /* Otimista: já mostra na nova ordem; se falhar, busca a ordem real de novo. */
    const posicao = new Map(ids.map((id, indice) => [id, indice]));
    setPaginas((atual) =>
      atual?.map((item) => (posicao.has(item.id) ? { ...item, ordem: posicao.get(item.id) as number } : item)) ?? atual
    );
    const resultado = await reordenarPaginas(paiId, ids);
    if (!resultado.ok) {
      setAviso({ variante: "danger", titulo: "Não foi possível salvar a ordem", texto: resultado.message });
      void carregarArvore();
    }
  }

  async function mover(paiId: string | null) {
    if (!moverNo) return;
    const resultado = await moverPagina(moverNo.id, paiId);
    if (!resultado.ok) {
      setAviso({ variante: "danger", titulo: "Não foi possível mover a página", texto: resultado.message });
      return;
    }
    if (paiId) {
      setExpandidos((atual) => {
        const proximo = new Set(atual).add(paiId);
        guardarExpandidos(proximo);
        return proximo;
      });
    }
    setMoverNo(null);
    await carregarArvore();
  }

  async function confirmarExclusao() {
    if (!excluirNo || !paginas) return;
    setExcluindo(true);
    const removidas = idsDaSubarvore(paginas, excluirNo.id);
    const resultado = await enviarParaLixeira(excluirNo.id);
    setExcluindo(false);

    if (!resultado.ok) {
      setAviso({ variante: "danger", titulo: "Não foi possível excluir", texto: resultado.message });
      return;
    }

    if (pagina && removidas.has(pagina.id)) {
      clearTimeout(timerRef.current);
      pendenteRef.current = {};
      paginaIdRef.current = null;
      setPagina(null);
      mudarStatus("salvo");
      router.replace(pathname, { scroll: false });
    }

    setAviso({
      variante: "success",
      titulo: "Enviada para a lixeira",
      texto: `Dá para restaurar por 30 dias em "Lixeira".`,
    });
    setExcluirNo(null);
    await carregarArvore();
  }

  /* ---------- conflito com outra aba ---------- */

  async function usarVersaoSalva() {
    if (!pagina) return;
    pendenteRef.current = {};
    mudarStatus("salvo");
    const id = pagina.id;
    paginaIdRef.current = null;
    await abrir(id);
  }

  async function manterMinhaVersao() {
    pendenteRef.current = { titulo, conteudo };
    mudarStatus("pendente");
    await gravarAgora(true);
  }

  /* ---------- render ---------- */

  const cabecalho = (
    <>
      <PageHeader
        title="Bloco de Notas"
        description="Seu caderno pessoal — páginas, subpáginas, prints, tabelas e listas de tarefas. Só você tem acesso."
      />
      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Bloco de Notas", current: true, icon: <NotebookPen size={14} /> },
        ]}
      />
    </>
  );

  if (erroCarga && !paginas) {
    return (
      <PageContainer>
        {cabecalho}
        <Alert variant="danger">{erroCarga}</Alert>
      </PageContainer>
    );
  }

  if (!paginas) {
    return (
      <PageContainer>
        {cabecalho}
        <Loader label="Abrindo o seu caderno..." />
      </PageContainer>
    );
  }

  const textoStatus =
    status === "salvando" || status === "pendente"
      ? "Salvando..."
      : status === "erro"
        ? "Não salvo"
        : status === "conflito"
          ? "Alterada em outra aba"
          : salvoEm
            ? `Salvo às ${horaCurta(salvoEm)}`
            : "Salvo";

  return (
    <PageContainer>
      {cabecalho}

      <div className={styles.layout}>
        <aside className={`${styles.lateral} ${lateralAberta ? "" : styles.lateralFechada}`} aria-label="Páginas do caderno">
          <Button fullWidth onClick={() => void novaPagina(null)}>
            <Plus size={16} /> Nova página
          </Button>

          <div className={styles.busca}>
            <Search size={15} className={styles.buscaIcone} aria-hidden />
            <Input
              value={buscaDigitada}
              onChange={(event) => setBuscaDigitada(event.target.value)}
              placeholder="Buscar nas notas"
              aria-label="Buscar nas notas"
              className={styles.buscaInput}
            />
          </div>

          {resultados ? (
            <div className={styles.secao}>
              <span className={styles.secaoTitulo}>
                {resultados.length === 0 ? "Nada encontrado" : `${resultados.length} resultado(s)`}
              </span>
              <ul className={styles.resultados}>
                {resultados.map((resultado) => (
                  <li key={resultado.id}>
                    <button type="button" className={styles.resultado} onClick={() => void abrir(resultado.id)}>
                      <strong>{tituloOuPadrao(resultado.titulo)}</strong>
                      {resultado.trecho && <span>{resultado.trecho}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              {favoritas.length > 0 && (
                <div className={styles.secao}>
                  <span className={styles.secaoTitulo}>Favoritas</span>
                  <ul className={styles.arvoreLista}>
                    {favoritas.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`${styles.favorita} ${pagina?.id === item.id ? styles.arvoreLinhaSelecionada : ""}`}
                          onClick={() => void abrir(item.id)}
                        >
                          <Star size={14} className={styles.estrelaMini} />
                          <span>{tituloOuPadrao(item.titulo)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.secao}>
                <span className={styles.secaoTitulo}>Páginas</span>
                {arvore.length === 0 ? (
                  <p className={styles.vazioLateral}>Nenhuma página ainda.</p>
                ) : (
                  <ArvorePaginas
                    arvore={arvore}
                    selecionadaId={pagina?.id ?? null}
                    expandidos={expandidos}
                    onSelecionar={(id) => void abrir(id)}
                    onAlternar={alternar}
                    onNovaSubpagina={(paiId) => void novaPagina(paiId)}
                    onFavoritar={(no) => void favoritar(no)}
                    onMover={setMoverNo}
                    onExcluir={setExcluirNo}
                    onReordenar={(paiId, ids) => void reordenar(paiId, ids)}
                  />
                )}
              </div>
            </>
          )}

          <button type="button" className={styles.botaoLixeira} onClick={() => setLixeiraAberta(true)}>
            <Trash2 size={15} /> Lixeira
            {naLixeira > 0 && <span className={styles.contador}>{naLixeira}</span>}
          </button>
        </aside>

        <section className={styles.area}>
          <div className={styles.barraMobile}>
            <Button variant="secondary" onClick={() => setLateralAberta((atual) => !atual)}>
              <PanelLeft size={16} /> {lateralAberta ? "Esconder páginas" : "Páginas"}
            </Button>
          </div>

          {abrindo && !pagina ? (
            <Loader label="Abrindo a página..." />
          ) : !pagina ? (
            <EmptyState
              icon={<BookOpen size={30} />}
              title={arvore.length === 0 ? "Comece o seu caderno" : "Escolha uma página"}
              description={
                arvore.length === 0
                  ? "Crie páginas e subpáginas para organizar anotações, prints, tabelas e listas de tarefas."
                  : "Abra uma página na lista ao lado ou crie uma nova."
              }
              action={
                <Button onClick={() => void novaPagina(null)}>
                  <Plus size={16} /> Criar página
                </Button>
              }
            />
          ) : (
            <Stack gap={14}>
              <div className={styles.editorTopo}>
                <nav className={styles.trilha} aria-label="Caminho da página">
                  {trilha.map((item) => (
                    <span key={item.id} className={styles.trilhaItem}>
                      <button type="button" onClick={() => void abrir(item.id)}>
                        {tituloOuPadrao(item.titulo)}
                      </button>
                      <span aria-hidden>/</span>
                    </span>
                  ))}
                  <span className={styles.trilhaAtual}>
                    <FileText size={13} /> {tituloOuPadrao(titulo)}
                  </span>
                </nav>

                <div className={styles.editorAcoes}>
                  <span
                    className={`${styles.status} ${status === "erro" || status === "conflito" ? styles.statusProblema : ""}`}
                    aria-live="polite"
                  >
                    {status === "salvando" || status === "pendente" ? (
                      <Loader2 size={14} className={styles.girando} />
                    ) : status === "erro" || status === "conflito" ? (
                      <CloudOff size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    {textoStatus}
                  </span>
                  <IconButton
                    icon={<Star size={16} className={pagina.favorita ? styles.estrelaAtiva : undefined} />}
                    label={pagina.favorita ? "Tirar das favoritas" : "Adicionar às favoritas"}
                    size="small"
                    onClick={() => void favoritar(pagina)}
                  />
                  <IconButton
                    icon={<Trash2 size={16} />}
                    label="Mover para a lixeira"
                    size="small"
                    variant="danger"
                    onClick={() => {
                      const no = arvore.length ? encontrarNo(arvore, pagina.id) : null;
                      if (no) setExcluirNo(no);
                    }}
                  />
                </div>
              </div>

              <input
                ref={tituloRef}
                className={styles.titulo}
                value={titulo}
                maxLength={200}
                placeholder="Sem título"
                aria-label="Título da página"
                onChange={(event) => {
                  setTitulo(event.target.value);
                  agendarGravacao({ titulo: event.target.value });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    (document.querySelector(`.${styles.editor} .ProseMirror`) as HTMLElement | null)?.focus();
                  }
                }}
              />

              {status === "conflito" && (
                <Alert variant="warning" title="Esta página foi alterada em outra aba ou janela">
                  <Stack gap={10}>
                    <span>Para não perder nada, escolha qual versão fica.</span>
                    <Stack direction="row" gap={8} wrap>
                      <Button variant="secondary" onClick={() => void usarVersaoSalva()}>
                        Usar a versão salva
                      </Button>
                      <Button onClick={() => void manterMinhaVersao()}>Manter a minha versão</Button>
                    </Stack>
                  </Stack>
                </Alert>
              )}

              {status === "erro" && (
                <Alert variant="danger" title="As últimas alterações não foram salvas">
                  <Stack gap={10}>
                    <span>{erroGravacao}</span>
                    <Stack direction="row">
                      <Button variant="secondary" onClick={() => void gravarAgora()}>
                        Tentar de novo
                      </Button>
                    </Stack>
                  </Stack>
                </Alert>
              )}

              <div className={styles.editor}>
                <RichTextEditor
                  key={pagina.id}
                  value={conteudo}
                  tabelas
                  recursosAvancados
                  alturaMinima={460}
                  imagemUpload={enviarImagemNota}
                  placeholder="Escreva aqui. Cole prints com Ctrl+V, use a barra acima para tabelas, tarefas, cores..."
                  onChange={(html) => {
                    setConteudo(html);
                    agendarGravacao({ conteudo: html });
                  }}
                />
              </div>
            </Stack>
          )}
        </section>
      </div>

      {moverNo && paginas && (
        <MoverPaginaModal
          pagina={moverNo}
          arvore={arvore}
          paginas={paginas}
          onFechar={() => setMoverNo(null)}
          onMover={mover}
        />
      )}

      {lixeiraAberta && (
        <LixeiraModal
          onFechar={() => setLixeiraAberta(false)}
          onMudou={(restauradaId) => {
            void carregarArvore();
            if (restauradaId) setAviso({ variante: "success", titulo: "Página restaurada" });
          }}
        />
      )}

      <ConfirmDialog
        open={excluirNo !== null}
        title="Mover para a lixeira?"
        message={
          <>
            <strong>{tituloOuPadrao(excluirNo?.titulo ?? "")}</strong>
            {excluirNo && paginas && idsDaSubarvore(paginas, excluirNo.id).size > 1
              ? ` e as ${idsDaSubarvore(paginas, excluirNo.id).size - 1} subpáginas dela vão`
              : " vai"}{" "}
            para a lixeira. Dá para restaurar por 30 dias.
          </>
        }
        confirmLabel="Mover para a lixeira"
        variant="danger"
        loading={excluindo}
        onClose={() => setExcluirNo(null)}
        onConfirm={() => void confirmarExclusao()}
      />

      <Toast
        open={aviso !== null}
        variant={aviso?.variante ?? "success"}
        title={aviso?.titulo ?? ""}
        description={aviso?.texto}
        onClose={() => setAviso(null)}
      />
    </PageContainer>
  );
}

function encontrarNo(nos: NoArvore[], id: string): NoArvore | null {
  for (const no of nos) {
    if (no.id === id) return no;
    const achado = encontrarNo(no.filhos, id);
    if (achado) return achado;
  }
  return null;
}
