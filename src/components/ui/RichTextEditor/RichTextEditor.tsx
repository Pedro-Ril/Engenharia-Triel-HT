"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Highlight from "@tiptap/extension-highlight";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code,
  Grid2x2X,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo,
  Strikethrough,
  Table as TableIcon,
  TableColumnsSplit,
  TableRowsSplit,
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";

import styles from "./RichTextEditor.module.css";

/*
 * Paletas do modo `recursosAvancados` (Bloco de Notas). Cores de texto em
 * tom médio -- legíveis no tema claro e no escuro; marca-texto em tons
 * claros com texto sempre escuro por cima (ver `mark` no CSS).
 */
const CORES_TEXTO = [
  { nome: "Vermelho", cor: "#dc2626" },
  { nome: "Laranja", cor: "#ea580c" },
  { nome: "Verde", cor: "#16a34a" },
  { nome: "Azul", cor: "#2563eb" },
  { nome: "Roxo", cor: "#9333ea" },
  { nome: "Cinza", cor: "#6b7280" },
];

const CORES_MARCA_TEXTO = [
  { nome: "Amarelo", cor: "#fef08a" },
  { nome: "Verde", cor: "#bbf7d0" },
  { nome: "Azul", cor: "#bfdbfe" },
  { nome: "Rosa", cor: "#fbcfe8" },
  { nome: "Laranja", cor: "#fed7aa" },
];

type Alinhamento = "left" | "center" | "right" | "justify";

interface RichTextEditorProps {
  value: string;
  /* `textoVisivel`: só o texto, sem as tags -- para contador de caracteres e "está vazio?". */
  onChange: (html: string, textoVisivel: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /* Liga tabelas: colar do Excel/Word mantém a tabela, e a toolbar ganha os botões de tabela. */
  tabelas?: boolean;
  /* Altura mínima da área de texto, em px (padrão 220, pensado para artigos da Wiki). */
  alturaMinima?: number;
  /*
   * Quando informado, o botão "Imagem" da toolbar passa a abrir um
   * seletor de arquivo (em vez de pedir uma URL por prompt), e colar
   * (Ctrl+V) ou arrastar uma imagem pro editor também funciona — a
   * função recebe o arquivo e devolve a URL já salva pra inserir no
   * conteúdo. Sem essa prop, o editor mantém o comportamento antigo
   * de URL por prompt.
   */
  imagemUpload?: (arquivo: File) => Promise<string>;
  /*
   * Recursos de caderno (Bloco de Notas): Título 1, lista de tarefas, cor
   * do texto, marca-texto, alinhamento e linha divisória. Desligado, o
   * editor fica exatamente como sempre foi (Chamados, Wiki).
   */
  recursosAvancados?: boolean;
  /*
   * Edição ao vivo (Bloco de Notas compartilhado): o texto passa a morar
   * no documento Yjs, sincronizado pelo provedor com quem mais estiver na
   * página -- `value` deixa de mandar no conteúdo (só serve para semear).
   * Desfazer/refazer viram os do Yjs (só desfazem o que VOCÊ fez).
   */
  colaboracao?: ColaboracaoEditor;
}

export interface ColaboracaoEditor {
  documento: Y.Doc;
  provedor: HocuspocusProvider;
  pessoa: { nome: string; cor: string };
  /*
   * O servidor pediu a este navegador para preencher a página com o texto
   * que já existia (`value`): é a primeira vez dela ao vivo. Feito isso,
   * chama `onSemeado`.
   */
  semear: boolean;
  onSemeado: () => void;
}

/* Cursor de outra pessoa: barrinha na cor dela + etiqueta com o nome. */
function renderizarCursor(pessoa: Record<string, unknown>): HTMLElement {
  const cor = typeof pessoa.color === "string" ? pessoa.color : "#6b7280";
  const cursor = document.createElement("span");
  cursor.classList.add("collaboration-carets__caret");
  cursor.style.borderColor = cor;
  const etiqueta = document.createElement("div");
  etiqueta.classList.add("collaboration-carets__label");
  etiqueta.style.backgroundColor = cor;
  etiqueta.textContent = typeof pessoa.name === "string" ? pessoa.name : "";
  cursor.appendChild(etiqueta);
  return cursor;
}

const TAMANHO_MAXIMO_IMAGEM_BYTES = 8 * 1024 * 1024;

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.toolbarButton} ${active ? styles.toolbarButtonAtivo : ""}`}
      /*
       * Não deixa o clique tirar o foco do texto: o editor só recupera o
       * foco no quadro seguinte, e o que fosse digitado nesse meio-tempo
       * (logo depois de clicar em Centralizar, por exemplo) se perdia. De
       * quebra a seleção continua visível ao aplicar a formatação.
       */
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  tabelas = false,
  alturaMinima,
  imagemUpload,
  recursosAvancados = false,
  colaboracao,
}: RichTextEditorProps) {
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  /* Paleta aberta (cor do texto / marca-texto); fecha ao clicar fora. */
  const [paletaAberta, setPaletaAberta] = useState<"cor" | "marca" | null>(null);
  const paletaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paletaAberta) return;
    function aoClicarFora(event: MouseEvent) {
      if (paletaRef.current && !paletaRef.current.contains(event.target as Node)) setPaletaAberta(null);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [paletaAberta]);

  /*
   * Guardada em ref (não em state) porque as callbacks do ProseMirror
   * (handlePaste/handleDrop) são registradas uma vez na criação do
   * editor e não são recriadas a cada render — ler direto do ref
   * evita fechar sobre uma versão antiga de `editor`/`imagemUpload`.
   */
  const processarImagemRef = useRef<(arquivo: File) => void>(() => {});

  /*
   * Último HTML que o próprio editor mandou pelo onChange. Quando o pai
   * devolve esse mesmo valor em `value` (o eco normal de um campo
   * controlado), não é mudança "de fora" -- e o editor pode até já estar
   * à frente dele (digitação rápida, o React ainda não redesenhou). Sem
   * isto, o efeito de sincronizar abaixo reaplicava o valor atrasado e
   * apagava as últimas letras digitadas.
   */
  const ultimoHtmlEmitidoRef = useRef<string | null>(null);

  const provedorColaboracao = colaboracao?.provedor ?? null;

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: recursosAvancados ? [1, 2, 3] : [2, 3] },
        /* Ao vivo, o histórico é o do Yjs (o do ProseMirror desfaria o texto dos outros). */
        ...(colaboracao ? { undoRedo: false as const } : {}),
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({
        placeholder: placeholder ?? "Escreva o conteúdo do artigo...",
      }),
      ...(tabelas ? [TableKit.configure({ table: { resizable: false } })] : []),
      ...(recursosAvancados
        ? [
            TaskList,
            TaskItem.configure({ nested: true }),
            Highlight.configure({ multicolor: true }),
            TextStyle,
            Color,
            TextAlign.configure({ types: ["heading", "paragraph"] }),
          ]
        : []),
      ...(colaboracao
        ? [
            Collaboration.configure({ document: colaboracao.documento }),
            CollaborationCaret.configure({
              provider: colaboracao.provedor,
              user: { name: colaboracao.pessoa.nome, color: colaboracao.pessoa.cor },
              render: renderizarCursor,
            }),
          ]
        : []),
    ],
    content: colaboracao ? undefined : value,
    onUpdate: ({ editor: editorAtualizado }) => {
      const html = editorAtualizado.getHTML();
      ultimoHtmlEmitidoRef.current = html;
      onChange(html, editorAtualizado.getText({ blockSeparator: "\n" }));
    },
    editorProps: {
      attributes: {
        class: styles.conteudo,
        ...(alturaMinima !== undefined ? { style: `min-height: ${alturaMinima}px;` } : {}),
      },
      handlePaste: (_view, event) => {
        if (!imagemUpload) return false;

        /*
         * Excel e Word mandam junto com o conteúdo uma "foto" dele
         * (image/png). Quando há texto ou tabela na área de
         * transferência, cola o conteúdo de verdade, não a foto; só um
         * print puro (Win+Shift+S, Print Screen) vira imagem.
         */
        const dados = event.clipboardData;
        const html = dados?.getData("text/html") ?? "";
        if (/<table/i.test(html) || (dados?.getData("text/plain") ?? "").trim()) return false;

        const itemImagem = Array.from(dados?.items ?? []).find((item) =>
          item.type.startsWith("image/")
        );
        const arquivo = itemImagem?.getAsFile();
        if (!arquivo) return false;

        event.preventDefault();
        processarImagemRef.current(arquivo);
        return true;
      },
      handleDrop: (_view, event) => {
        if (!imagemUpload) return false;

        const arquivo = Array.from(event.dataTransfer?.files ?? []).find((item) =>
          item.type.startsWith("image/")
        );
        if (!arquivo) return false;

        event.preventDefault();
        processarImagemRef.current(arquivo);
        return true;
      },
    },
  }, [provedorColaboracao]);

  useEffect(() => {
    processarImagemRef.current = (arquivo: File) => {
      if (!imagemUpload || !editor) return;

      setErroUpload(null);

      if (!arquivo.type.startsWith("image/")) {
        setErroUpload("Apenas arquivos de imagem podem ser inseridos.");
        return;
      }

      if (arquivo.size > TAMANHO_MAXIMO_IMAGEM_BYTES) {
        setErroUpload(
          `A imagem excede o limite de ${TAMANHO_MAXIMO_IMAGEM_BYTES / (1024 * 1024)} MB.`
        );
        return;
      }

      setEnviandoImagem(true);

      imagemUpload(arquivo)
        .then((url) => {
          editor.chain().focus().setImage({ src: url }).run();
        })
        .catch((error: unknown) => {
          setErroUpload(error instanceof Error ? error.message : "Falha ao enviar a imagem.");
        })
        .finally(() => {
          setEnviandoImagem(false);
        });
    };
  }, [imagemUpload, editor]);

  /* Sincroniza quando `value` muda por fora (ex: trocar de artigo no formulário, limpar depois de enviar). */
  const emColaboracao = Boolean(colaboracao);
  useEffect(() => {
    if (!editor || emColaboracao) return;
    if (value === ultimoHtmlEmitidoRef.current) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor, emColaboracao]);

  /* Primeira vez da página ao vivo: entra o texto que já existia, uma vez só. */
  const precisaSemear = colaboracao?.semear ?? false;
  const onSemeado = colaboracao?.onSemeado;
  useEffect(() => {
    if (!editor || !precisaSemear) return;
    if (editor.isEmpty && value.trim()) editor.commands.setContent(value);
    onSemeado?.();
  }, [editor, precisaSemear, onSemeado, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  /*
   * Estado da toolbar (botão ativo, desfazer/refazer, cursor numa
   * tabela). No Tiptap 3 o componente não redesenha a cada movimento do
   * cursor, e o React Compiler memoriza o que depende só de `editor`
   * (o objeto é sempre o mesmo) -- ler `editor.isActive()` direto no JSX
   * deixava os botões congelados. Isto redesenha só quando algum desses
   * valores muda.
   */
  const estado = useEditorState({
    editor,
    selector: ({ editor: atual }) => ({
      bold: atual?.isActive("bold") ?? false,
      italic: atual?.isActive("italic") ?? false,
      underline: atual?.isActive("underline") ?? false,
      strike: atual?.isActive("strike") ?? false,
      h1: atual?.isActive("heading", { level: 1 }) ?? false,
      h2: atual?.isActive("heading", { level: 2 }) ?? false,
      h3: atual?.isActive("heading", { level: 3 }) ?? false,
      taskList: recursosAvancados ? (atual?.isActive("taskList") ?? false) : false,
      alinhamento: (recursosAvancados
        ? (["center", "right", "justify"] as Alinhamento[]).find((valor) => atual?.isActive({ textAlign: valor })) ?? "left"
        : "left") as Alinhamento,
      corTexto: recursosAvancados ? ((atual?.getAttributes("textStyle").color as string | undefined) ?? null) : null,
      corMarca: recursosAvancados ? ((atual?.getAttributes("highlight").color as string | undefined) ?? null) : null,
      bulletList: atual?.isActive("bulletList") ?? false,
      orderedList: atual?.isActive("orderedList") ?? false,
      blockquote: atual?.isActive("blockquote") ?? false,
      codeBlock: atual?.isActive("codeBlock") ?? false,
      link: atual?.isActive("link") ?? false,
      naTabela: atual?.isActive("table") ?? false,
      podeDesfazer: atual?.can().undo() ?? false,
      podeRefazer: atual?.can().redo() ?? false,
    }),
  });
  const naTabela = estado?.naTabela ?? false;

  if (!editor) {
    return <div className={styles.wrapper} />;
  }

  function inserirLink() {
    const urlAtual = editor?.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link:", urlAtual ?? "https://");

    if (url === null) return;

    if (url === "") {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function inserirImagem() {
    if (imagemUpload) {
      inputArquivoRef.current?.click();
      return;
    }

    const url = window.prompt("URL da imagem:");
    if (!url) return;
    editor?.chain().focus().setImage({ src: url }).run();
  }

  function handleArquivoSelecionado(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (arquivo) processarImagemRef.current(arquivo);
  }

  return (
    <div className={styles.wrapper}>
      {imagemUpload && (
        <input
          ref={inputArquivoRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleArquivoSelecionado}
          style={{ display: "none" }}
        />
      )}

      <div className={styles.toolbar}>
        <ToolbarButton
          label="Negrito"
          active={estado?.bold}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Itálico"
          active={estado?.italic}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Sublinhado"
          active={estado?.underline}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Tachado"
          active={estado?.strike}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={16} />
        </ToolbarButton>

        {recursosAvancados && (
          <div className={styles.paletaGrupo} ref={paletaRef}>
            <ToolbarButton
              label="Cor do texto"
              active={Boolean(estado?.corTexto) || paletaAberta === "cor"}
              disabled={disabled}
              onClick={() => setPaletaAberta((atual) => (atual === "cor" ? null : "cor"))}
            >
              <Baseline size={16} style={estado?.corTexto ? { color: estado.corTexto } : undefined} />
            </ToolbarButton>

            <ToolbarButton
              label="Marca-texto"
              active={Boolean(estado?.corMarca) || paletaAberta === "marca"}
              disabled={disabled}
              onClick={() => setPaletaAberta((atual) => (atual === "marca" ? null : "marca"))}
            >
              <Highlighter size={16} />
            </ToolbarButton>

            {paletaAberta && (
              <div className={styles.paleta} role="menu" aria-label={paletaAberta === "cor" ? "Cor do texto" : "Marca-texto"}>
                {(paletaAberta === "cor" ? CORES_TEXTO : CORES_MARCA_TEXTO).map((opcao) => (
                  <button
                    key={opcao.cor}
                    type="button"
                    role="menuitem"
                    className={styles.paletaCor}
                    onMouseDown={(event) => event.preventDefault()}
                    style={{ background: opcao.cor }}
                    title={opcao.nome}
                    aria-label={opcao.nome}
                    onClick={() => {
                      if (paletaAberta === "cor") editor.chain().focus().setColor(opcao.cor).run();
                      else editor.chain().focus().setHighlight({ color: opcao.cor }).run();
                      setPaletaAberta(null);
                    }}
                  />
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.paletaLimpar}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (paletaAberta === "cor") editor.chain().focus().unsetColor().run();
                    else editor.chain().focus().unsetHighlight().run();
                    setPaletaAberta(null);
                  }}
                >
                  {paletaAberta === "cor" ? "Cor padrão" : "Sem marca"}
                </button>
              </div>
            )}
          </div>
        )}

        <span className={styles.separador} aria-hidden="true" />

        {recursosAvancados && (
          <ToolbarButton
            label="Título 1"
            active={estado?.h1}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 size={16} />
          </ToolbarButton>
        )}

        <ToolbarButton
          label="Título 2"
          active={estado?.h2}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Título 3"
          active={estado?.h3}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={16} />
        </ToolbarButton>

        <span className={styles.separador} aria-hidden="true" />

        <ToolbarButton
          label="Lista com marcadores"
          active={estado?.bulletList}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Lista numerada"
          active={estado?.orderedList}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </ToolbarButton>

        {recursosAvancados && (
          <ToolbarButton
            label="Lista de tarefas"
            active={estado?.taskList}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <ListChecks size={16} />
          </ToolbarButton>
        )}

        <ToolbarButton
          label="Citação"
          active={estado?.blockquote}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Bloco de código"
          active={estado?.codeBlock}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code size={16} />
        </ToolbarButton>

        {recursosAvancados && (
          <>
            <ToolbarButton
              label="Linha divisória"
              disabled={disabled}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Minus size={16} />
            </ToolbarButton>

            <span className={styles.separador} aria-hidden="true" />

            {(
              [
                ["left", "Alinhar à esquerda", AlignLeft],
                ["center", "Centralizar", AlignCenter],
                ["right", "Alinhar à direita", AlignRight],
                ["justify", "Justificar", AlignJustify],
              ] as const
            ).map(([valor, rotulo, Icone]) => (
              <ToolbarButton
                key={valor}
                label={rotulo}
                active={estado?.alinhamento === valor && valor !== "left"}
                disabled={disabled}
                onClick={() => editor.chain().focus().setTextAlign(valor).run()}
              >
                <Icone size={16} />
              </ToolbarButton>
            ))}
          </>
        )}

        <span className={styles.separador} aria-hidden="true" />

        <ToolbarButton
          label="Link"
          active={estado?.link}
          disabled={disabled}
          onClick={inserirLink}
        >
          <LinkIcon size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Imagem"
          disabled={disabled || enviandoImagem}
          onClick={inserirImagem}
        >
          <ImageIcon size={16} />
        </ToolbarButton>

        {tabelas && (
          <>
            <span className={styles.separador} aria-hidden="true" />

            <ToolbarButton
              label="Inserir tabela"
              disabled={disabled || naTabela}
              onClick={() =>
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }
            >
              <TableIcon size={16} />
            </ToolbarButton>

            {naTabela && (
              <>
                <ToolbarButton
                  label="Inserir linha abaixo"
                  disabled={disabled}
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                >
                  <BetweenHorizontalEnd size={16} />
                </ToolbarButton>

                <ToolbarButton
                  label="Inserir coluna à direita"
                  disabled={disabled}
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                >
                  <BetweenVerticalEnd size={16} />
                </ToolbarButton>

                <ToolbarButton
                  label="Excluir linha"
                  disabled={disabled}
                  onClick={() => editor.chain().focus().deleteRow().run()}
                >
                  <TableRowsSplit size={16} />
                </ToolbarButton>

                <ToolbarButton
                  label="Excluir coluna"
                  disabled={disabled}
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                >
                  <TableColumnsSplit size={16} />
                </ToolbarButton>

                <ToolbarButton
                  label="Excluir tabela"
                  disabled={disabled}
                  onClick={() => editor.chain().focus().deleteTable().run()}
                >
                  <Grid2x2X size={16} />
                </ToolbarButton>
              </>
            )}
          </>
        )}

        <span className={styles.separador} aria-hidden="true" />

        <ToolbarButton
          label="Desfazer"
          disabled={disabled || !estado?.podeDesfazer}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Refazer"
          disabled={disabled || !estado?.podeRefazer}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo size={16} />
        </ToolbarButton>
      </div>

      {enviandoImagem && <p className={styles.statusUpload}>Enviando imagem...</p>}
      {erroUpload && <p className={styles.erroUpload}>{erroUpload}</p>}

      <EditorContent editor={editor} />
    </div>
  );
}
