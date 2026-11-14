"use client";

import { useEffect, useRef, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

import { Alert } from "@/components/ui/Alert";
import { Loader } from "@/components/ui/Loader";
import { type ColaboracaoEditor, RichTextEditor, RichTextViewer } from "@/components/ui/RichTextEditor";

import { pedirPasseColaboracao } from "../services/blocoNotas.service";
import styles from "./BlocoNotas.module.css";

/* Campo do Yjs onde o Tiptap guarda o texto (padrão da extensão Collaboration). */
const CAMPO_YJS = "default";
/* Sem conectar nesse tempo, avisa (o provedor continua tentando sozinho). */
const ESPERA_AVISO_MS = 6000;

type EstadoAoVivo = "conectando" | "ao-vivo" | "reconectando" | "negado" | "indisponivel";

interface Sessao {
  documento: Y.Doc;
  provedor: HocuspocusProvider;
  pessoa: { nome: string; cor: string };
  podeEditar: boolean;
}

interface Presente {
  clientId: number;
  nome: string;
  cor: string;
}

interface EditorAoVivoProps {
  paginaId: string;
  /* HTML salvo da página: semeia a primeira sessão ao vivo e aparece para quem só vê enquanto ela não existe. */
  htmlInicial: string;
  imagemUpload: (arquivo: File) => Promise<string>;
  /* HTML atual depois de qualquer mudança (sua ou de outra pessoa) -- a tela grava como "versão de leitura". */
  onHtml: (html: string) => void;
  /* Quem compartilhou tirou o seu acesso. */
  onSemAcesso: () => void;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

/*
 * Página compartilhada: edição ao mesmo tempo, como no Google Docs. O
 * texto mora num documento Yjs sincronizado pelo serviço de colaboração
 * (colaboracao/server.mjs, porta 3012); cada pessoa vê o cursor e o nome
 * das outras. Sem conexão, fica só para leitura até reconectar -- assim
 * ninguém escreve por cima do que os outros estão fazendo.
 *
 * Montado com `key` = id da página: trocar de página derruba esta
 * conexão e abre outra do zero.
 */
export function EditorAoVivo({ paginaId, htmlInicial, imagemUpload, onHtml, onSemAcesso }: EditorAoVivoProps) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [estado, setEstado] = useState<EstadoAoVivo>("conectando");
  const [sincronizou, setSincronizou] = useState(false);
  const [demorou, setDemorou] = useState(false);
  const [docVazio, setDocVazio] = useState(true);
  const [semear, setSemear] = useState(false);
  const [presentes, setPresentes] = useState<Presente[]>([]);
  /* Sobe a cada vez que a conexão precisa ser refeita do zero (o servidor fechou esta página). */
  const [geracao, setGeracao] = useState(0);

  const onHtmlRef = useRef(onHtml);
  const onSemAcessoRef = useRef(onSemAcesso);
  useEffect(() => {
    onHtmlRef.current = onHtml;
    onSemAcessoRef.current = onSemAcesso;
  }, [onHtml, onSemAcesso]);

  /* Último HTML conhecido: só avisa a tela quando muda de verdade. */
  const ultimoHtmlRef = useRef(htmlInicial);

  useEffect(() => {
    let cancelado = false;
    let provedor: HocuspocusProvider | null = null;
    const documento = new Y.Doc();
    const fragmento = documento.getXmlFragment(CAMPO_YJS);
    const aoMudarDocumento = () => setDocVazio(fragmento.length === 0);
    documento.on("update", aoMudarDocumento);
    const temporizador = setTimeout(() => setDemorou(true), ESPERA_AVISO_MS);

    void (async () => {
      const passe = await pedirPasseColaboracao(paginaId);
      if (cancelado) return;
      if (!passe.ok || !passe.data) {
        setEstado(passe.status === 404 ? "negado" : "indisponivel");
        if (passe.status === 404) onSemAcessoRef.current();
        return;
      }

      /* O primeiro passe já veio junto; nas reconexões pede um novo (o acesso é conferido de novo). */
      let passeReservado: string | null = passe.data.token;
      let jaSincronizou = false;
      let pediuSemente = false;

      provedor = new HocuspocusProvider({
        url: `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${passe.data.porta}`,
        name: `pagina:${paginaId.toLowerCase()}`,
        document: documento,
        token: async () => {
          if (passeReservado) {
            const token = passeReservado;
            passeReservado = null;
            return token;
          }
          /* Reconexão de rede: confere o acesso de novo e já aplica a permissão atual. */
          const novo = await pedirPasseColaboracao(paginaId);
          if (!novo.ok || !novo.data) return "";
          const podeEditarAgora = novo.data.podeEditar;
          if (!cancelado) setSessao((atual) => (atual ? { ...atual, podeEditar: podeEditarAgora } : atual));
          return novo.data.token;
        },
        /*
         * O servidor fechou esta página com o socket ainda aberto: alguém
         * mudou o acesso a ela (ou foi para a lixeira). O provedor não se
         * autentica de novo sozinho nesse caso -- refaz a conexão do zero,
         * com passe novo (que já traz a permissão nova, ou 404).
         */
        onClose: ({ event }) => {
          /*
           * Queda de rede chega como CloseEvent do próprio websocket: aí o
           * provedor reconecta sozinho e o que estiver pendente é enviado
           * depois -- refazer do zero perderia isso.
           */
          if (cancelado || (typeof CloseEvent !== "undefined" && event instanceof CloseEvent)) return;
          cancelado = true;
          setSessao(null);
          setSincronizou(false);
          setPresentes([]);
          setDemorou(false);
          setEstado("conectando");
          setGeracao((atual) => atual + 1);
        },
        onSynced: ({ state }) => {
          if (!state || cancelado) return;
          jaSincronizou = true;
          setSincronizou(true);
          setEstado("ao-vivo");
          aoMudarDocumento();
          if (pediuSemente) {
            pediuSemente = false;
            setSemear(true);
          }
        },
        onStateless: ({ payload }) => {
          let mensagem: { tipo?: string } | null = null;
          try {
            mensagem = JSON.parse(payload) as { tipo?: string };
          } catch {
            return;
          }
          if (mensagem?.tipo !== "semear" || cancelado) return;
          if (jaSincronizou) setSemear(true);
          else pediuSemente = true;
        },
        onAuthenticationFailed: () => {
          if (cancelado) return;
          setEstado("negado");
          onSemAcessoRef.current();
        },
        onStatus: ({ status }) => {
          if (cancelado || status !== "disconnected") return;
          setEstado((atual) => (atual === "negado" ? atual : "reconectando"));
        },
        onAwarenessChange: ({ states }) => {
          if (cancelado) return;
          const outros: Presente[] = [];
          for (const item of states) {
            const pessoa = item.user as { name?: unknown; color?: unknown } | undefined;
            if (item.clientId === documento.clientID || typeof pessoa?.name !== "string") continue;
            outros.push({
              clientId: item.clientId,
              nome: pessoa.name,
              cor: typeof pessoa.color === "string" ? pessoa.color : "#6b7280",
            });
          }
          setPresentes(outros);
        },
      });

      setSessao({ documento, provedor, pessoa: passe.data.pessoa, podeEditar: passe.data.podeEditar });
    })();

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      documento.off("update", aoMudarDocumento);
      provedor?.destroy();
      documento.destroy();
    };
  }, [paginaId, geracao]);

  const podeEditar = sessao?.podeEditar ?? false;

  /* Mesma pessoa em duas abas conta uma vez. */
  const nomesPresentes = [...new Map(presentes.map((item) => [item.nome, item])).values()];

  const colaboracao: ColaboracaoEditor | undefined = sessao
    ? {
        documento: sessao.documento,
        provedor: sessao.provedor,
        pessoa: sessao.pessoa,
        semear,
        onSemeado: () => setSemear(false),
      }
    : undefined;

  if (estado === "negado") {
    return (
      <Alert variant="danger" title="Você não tem mais acesso a esta página">
        Quem compartilhou tirou o seu acesso, ou a página foi movida para a lixeira.
      </Alert>
    );
  }

  const semConexao = estado === "indisponivel" || estado === "reconectando" || (estado === "conectando" && demorou);

  return (
    <div className={styles.aoVivo}>
      <div className={styles.presenca} aria-live="polite">
        <span className={`${styles.presencaPonto} ${estado === "ao-vivo" ? styles.presencaPontoAtivo : ""}`} />
        <span className={styles.presencaTexto}>
          {estado === "ao-vivo"
            ? nomesPresentes.length === 0
              ? "Ao vivo · só você nesta página agora"
              : `Ao vivo · ${nomesPresentes.length === 1 ? nomesPresentes[0].nome : `${nomesPresentes.length} pessoas`} aqui com você`
            : estado === "conectando"
              ? "Conectando à edição ao vivo..."
              : "Sem conexão"}
        </span>
        <span className={styles.presencaAvatares}>
          {nomesPresentes.slice(0, 6).map((pessoa) => (
            <span
              key={pessoa.clientId}
              className={styles.avatar}
              style={{ background: pessoa.cor }}
              title={pessoa.nome}
              aria-label={pessoa.nome}
            >
              {iniciais(pessoa.nome)}
            </span>
          ))}
        </span>
        {!podeEditar && sessao && <span className={styles.selo}>Só leitura</span>}
      </div>

      {semConexao && (
        <Alert variant="warning" title="Sem conexão com a edição ao vivo">
          {estado === "indisponivel"
            ? "O serviço de edição ao vivo não respondeu. Recarregue a página em instantes; se continuar, avise a TI."
            : "Tentando reconectar... Enquanto isso a página fica só para leitura, para ninguém escrever por cima de ninguém."}
        </Alert>
      )}

      {!sessao || !sincronizou ? (
        semConexao ? (
          <RichTextViewer html={htmlInicial} />
        ) : (
          <Loader label="Abrindo a página ao vivo..." />
        )
      ) : !podeEditar && docVazio ? (
        /* Ninguém editou ao vivo ainda: quem só vê enxerga o texto salvo. */
        <RichTextViewer html={htmlInicial} />
      ) : (
        <RichTextEditor
          value={htmlInicial}
          colaboracao={colaboracao}
          disabled={!podeEditar || estado !== "ao-vivo"}
          tabelas
          recursosAvancados
          alturaMinima={460}
          imagemUpload={imagemUpload}
          placeholder="Escreva aqui. Quem estiver na página vê na hora."
          onChange={(html) => {
            if (!podeEditar || html === ultimoHtmlRef.current) return;
            ultimoHtmlRef.current = html;
            onHtmlRef.current(html);
          }}
        />
      )}
    </div>
  );
}
