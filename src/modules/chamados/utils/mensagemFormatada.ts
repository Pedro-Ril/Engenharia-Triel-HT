"use client";

import { useCallback, useRef } from "react";

/*
 * Lado do navegador das mensagens formatadas de chamado (ver
 * src/lib/chamados/mensagem-html.ts, que é quem valida e limpa).
 *
 * Um print colado ainda não tem para onde subir (na abertura o chamado
 * nem existe), então fica só no navegador: o editor mostra a imagem por
 * uma URL local (blob:) e, ao enviar, cada imagem vai como arquivo no
 * campo "imagensColadas" e o HTML troca a URL local por
 * "imagem-colada:N". O servidor grava a imagem como anexo e aponta o
 * HTML para ele.
 */

export const LIMITE_TEXTO_MENSAGEM = 4000;

export function mensagemVazia(html: string, textoVisivel: string): boolean {
  return !textoVisivel.trim() && !/<img\b/i.test(html);
}

export function useImagensColadas() {
  const imagens = useRef(new Map<string, File>());

  /* Passado como `imagemUpload` do RichTextEditor: não sobe nada, só guarda o arquivo. */
  const registrar = useCallback(async (arquivo: File): Promise<string> => {
    const url = URL.createObjectURL(arquivo);
    imagens.current.set(url, arquivo);
    return url;
  }, []);

  const anexarAoFormulario = useCallback((formData: FormData, campo: string, html: string) => {
    const usadas: File[] = [];
    const indicePorUrl = new Map<string, number>();

    const htmlFinal = html.replace(/(<img\b[^>]*?\bsrc=")(blob:[^"]+)(")/gi, (trecho, antes: string, url: string, depois: string) => {
      let indice = indicePorUrl.get(url);

      if (indice === undefined) {
        const arquivo = imagens.current.get(url);
        if (!arquivo) return trecho;
        indice = usadas.length;
        usadas.push(arquivo);
        indicePorUrl.set(url, indice);
      }

      return `${antes}imagem-colada:${indice}${depois}`;
    });

    formData.append("formato", "html");
    formData.append(campo, htmlFinal);
    for (const arquivo of usadas) formData.append("imagensColadas", arquivo, arquivo.name || "imagem.png");
  }, []);

  /* Depois de enviar: libera as URLs locais. */
  const limpar = useCallback(() => {
    for (const url of imagens.current.keys()) URL.revokeObjectURL(url);
    imagens.current.clear();
  }, []);

  return { registrar, anexarAoFormulario, limpar };
}
