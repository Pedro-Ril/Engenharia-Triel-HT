"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code,
  Grid2x2X,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
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
}: RichTextEditorProps) {
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  /*
   * Guardada em ref (não em state) porque as callbacks do ProseMirror
   * (handlePaste/handleDrop) são registradas uma vez na criação do
   * editor e não são recriadas a cada render — ler direto do ref
   * evita fechar sobre uma versão antiga de `editor`/`imagemUpload`.
   */
  const processarImagemRef = useRef<(arquivo: File) => void>(() => {});

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({
        placeholder: placeholder ?? "Escreva o conteúdo do artigo...",
      }),
      ...(tabelas ? [TableKit.configure({ table: { resizable: false } })] : []),
    ],
    content: value,
    onUpdate: ({ editor: editorAtualizado }) => {
      onChange(editorAtualizado.getHTML(), editorAtualizado.getText({ blockSeparator: "\n" }));
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
  });

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

  /* Sincroniza quando `value` muda por fora (ex: trocar de artigo no formulário). */
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

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
      h2: atual?.isActive("heading", { level: 2 }) ?? false,
      h3: atual?.isActive("heading", { level: 3 }) ?? false,
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

        <span className={styles.separador} aria-hidden="true" />

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
