import styles from "./RichTextEditor.module.css";

interface RichTextViewerProps {
  html: string;
  className?: string;
  /* Sem altura mínima nem respiro interno -- para texto no meio de outra coisa (ex: mensagem de chamado). */
  compacto?: boolean;
}

/*
 * Renderiza HTML já produzido pelo RichTextEditor (Tiptap) sem
 * instanciar um editor. Na Wiki o HTML só é gerado pela UI do editor
 * (autores sempre administradores). Nos chamados, que qualquer pessoa
 * escreve, o servidor limpa o HTML antes de gravar e ao ler (ver
 * src/lib/chamados/mensagem-html.ts) -- nunca passe para cá HTML vindo
 * direto do navegador.
 */
export function RichTextViewer({ html, className = "", compacto = false }: RichTextViewerProps) {
  return (
    <div
      className={[styles.conteudo, compacto ? styles.compacto : "", className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
