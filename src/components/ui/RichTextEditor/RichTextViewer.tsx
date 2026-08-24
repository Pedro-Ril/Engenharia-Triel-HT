import styles from "./RichTextEditor.module.css";

interface RichTextViewerProps {
  html: string;
  className?: string;
}

/*
 * Renderiza HTML já produzido pelo RichTextEditor (Tiptap) sem
 * instanciar um editor — usado na tela pública do wiki. O HTML
 * só é gerado pela UI do editor (autores sempre administradores),
 * nunca aceita colar HTML bruto, então o schema do Tiptap já
 * limita as tags possíveis.
 */
export function RichTextViewer({ html, className = "" }: RichTextViewerProps) {
  return (
    <div
      className={[styles.conteudo, className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
