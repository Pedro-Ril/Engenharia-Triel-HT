"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Code,
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
  Underline as UnderlineIcon,
  Undo,
} from "lucide-react";

import styles from "./RichTextEditor.module.css";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
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
    ],
    content: value,
    onUpdate: ({ editor: editorAtualizado }) => {
      onChange(editorAtualizado.getHTML());
    },
    editorProps: {
      attributes: {
        class: styles.conteudo,
      },
      handlePaste: (_view, event) => {
        if (!imagemUpload) return false;

        const itemImagem = Array.from(event.clipboardData?.items ?? []).find((item) =>
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
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Itálico"
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Sublinhado"
          active={editor.isActive("underline")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Tachado"
          active={editor.isActive("strike")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={16} />
        </ToolbarButton>

        <span className={styles.separador} aria-hidden="true" />

        <ToolbarButton
          label="Título 2"
          active={editor.isActive("heading", { level: 2 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Título 3"
          active={editor.isActive("heading", { level: 3 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={16} />
        </ToolbarButton>

        <span className={styles.separador} aria-hidden="true" />

        <ToolbarButton
          label="Lista com marcadores"
          active={editor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Lista numerada"
          active={editor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Citação"
          active={editor.isActive("blockquote")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Bloco de código"
          active={editor.isActive("codeBlock")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code size={16} />
        </ToolbarButton>

        <span className={styles.separador} aria-hidden="true" />

        <ToolbarButton
          label="Link"
          active={editor.isActive("link")}
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

        <span className={styles.separador} aria-hidden="true" />

        <ToolbarButton
          label="Desfazer"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo size={16} />
        </ToolbarButton>

        <ToolbarButton
          label="Refazer"
          disabled={disabled || !editor.can().redo()}
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
