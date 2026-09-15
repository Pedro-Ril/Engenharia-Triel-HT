"use client";

import { useEffect, useRef, useState } from "react";

import { buscarUsuariosParaSelecao } from "../services/chamados.service";
import type { UsuarioParaSelecao } from "../services/chamados.service";
import styles from "./UsuarioAutocomplete.module.css";

interface UsuarioAutocompleteProps {
  placeholder?: string;
  disabled?: boolean;
  onSelecionar: (usuario: UsuarioParaSelecao) => void;
}

/* Busca no servidor com debounce de 400ms (não fetch-once-filtra-local, ao contrário de ClienteAutocomplete) -- a lista de usuários do portal é grande demais pra trazer inteira de uma vez. */
export function UsuarioAutocomplete({ placeholder, disabled, onSelecionar }: UsuarioAutocompleteProps) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<UsuarioParaSelecao[]>([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelado = false;

    /*
     * Sem debounce quando o termo está vazio -- é o caso logo após
     * selecionar alguém (selecionar() zera o termo) ou ao apagar o
     * campo, e o usuário costuma clicar de novo no input quase na
     * hora; esperar 400ms aqui deixava uma janela em que o dropdown
     * não tinha nenhum resultado pra mostrar (parecia "não abrir").
     */
    if (!termo.trim()) {
      buscarUsuariosParaSelecao("").then((dados) => {
        if (!cancelado) setResultados(dados);
      });
      return () => {
        cancelado = true;
      };
    }

    const temporizador = setTimeout(() => {
      buscarUsuariosParaSelecao(termo).then((dados) => {
        if (!cancelado) setResultados(dados);
      });
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [termo]);

  useEffect(() => {
    function handleClickFora(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setMostrarLista(false);
      }
    }

    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, []);

  function selecionar(usuario: UsuarioParaSelecao) {
    onSelecionar(usuario);
    setTermo("");
    setMostrarLista(false);
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <input
        type="text"
        className={styles.input}
        placeholder={placeholder ?? "Buscar por nome ou e-mail"}
        value={termo}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => {
          setTermo(event.target.value);
          setMostrarLista(true);
        }}
        onFocus={() => setMostrarLista(true)}
      />

      {mostrarLista && resultados.length > 0 && (
        <div className={styles.lista}>
          {resultados.map((usuario) => (
            <button
              type="button"
              key={usuario.id}
              className={styles.item}
              onClick={() => selecionar(usuario)}
            >
              {usuario.nomeExibicao}
              {usuario.email && <span className={styles.itemSub}> — {usuario.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
