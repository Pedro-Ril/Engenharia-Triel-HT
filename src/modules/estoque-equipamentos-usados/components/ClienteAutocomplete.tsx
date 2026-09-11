"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { buscarClientesEstoque } from "../services/estoque.service";
import type { ClienteEstoqueItem } from "../types/estoque.types";
import styles from "./ClienteAutocomplete.module.css";

interface ClienteAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /*
   * Opcional — disparado só quando uma sugestão é de fato clicada (não
   * em toda digitação), com o item completo. Usado pelo campo "Cliente"
   * (não pelo "Destinatário") pra guardar também o cod_cli, necessário
   * pro job de integração de NF de entrada montar o parâmetro cod_for.
   */
  onSelecionarItem?: (item: ClienteEstoqueItem) => void;
}

/*
 * Mesmo padrão do campo "Cliente" do módulo Liberação de Projeto
 * (src/app/liberacao-projeto/page.tsx) — mesmo endpoint externo
 * (buscarClientesEstoque, ver estoque.service.ts), mesmo formato
 * "código | descrição" e mesma regra: o valor só é gravado quando uma
 * sugestão é clicada — digitar sem selecionar mantém o campo vazio,
 * igual lá.
 */
export function ClienteAutocomplete({ value, onChange, disabled, onSelecionarItem }: ClienteAutocompleteProps) {
  const [clientes, setClientes] = useState<ClienteEstoqueItem[]>([]);
  const [inputValue, setInputValue] = useState(value);
  const [mostrarLista, setMostrarLista] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  /*
   * "Ajustar estado durante a renderização" (padrão documentado do
   * React, com useState — não useRef, que não pode ser lido/mutado no
   * corpo do render) em vez de useEffect. Precisa saber se `value`
   * mudou por uma causa EXTERNA (troca de tipo, carregar equipamento
   * existente) ou é só o eco do nosso próprio onChange (digitar limpa
   * pra "", selecionar grava a descrição) — nesses dois últimos casos o
   * texto exibido já foi setado localmente e não deve ser sobrescrito.
   */
  const [ultimoValorEmitido, setUltimoValorEmitido] = useState(value);
  if (value !== ultimoValorEmitido) {
    setUltimoValorEmitido(value);
    setInputValue(value);
  }

  useEffect(() => {
    buscarClientesEstoque().then(setClientes);
  }, []);

  useEffect(() => {
    function handleClickFora(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setMostrarLista(false);
      }
    }

    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, []);

  const sugestoes = useMemo(() => {
    const termo = inputValue.trim().toLowerCase();
    const lista = termo
      ? clientes.filter((item) => {
          const codigo = String(item.cod_cli ?? "").toLowerCase();
          const descricao = String(item.descricao ?? "").toLowerCase();
          return codigo.includes(termo) || descricao.includes(termo);
        })
      : clientes;
    return lista.slice(0, 30);
  }, [clientes, inputValue]);

  function selecionar(item: ClienteEstoqueItem) {
    /*
     * O valor persistido é só a descrição — código e descrição sempre
     * ficam em colunas separadas no banco (nome_cliente/codigo_cliente),
     * nunca concatenados numa string só. "cod | descrição" é só efeito
     * visual: aqui embaixo no próprio campo de busca (pra confirmar o
     * item certo foi escolhido) e, na exibição de leitura, remontado a
     * partir das duas colunas separadas — nunca gravado assim.
     */
    const texto = `${item.cod_cli} | ${item.descricao}`;
    setInputValue(texto);
    setUltimoValorEmitido(item.descricao);
    onChange(item.descricao);
    onSelecionarItem?.(item);
    setMostrarLista(false);
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <input
        type="text"
        className={styles.input}
        placeholder="Digite código ou descrição do cliente"
        value={inputValue}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => {
          const texto = event.target.value;
          setInputValue(texto);
          setUltimoValorEmitido("");
          onChange("");
          setMostrarLista(true);
        }}
        onFocus={() => setMostrarLista(true)}
      />

      {mostrarLista && sugestoes.length > 0 && (
        <div className={styles.lista}>
          {sugestoes.map((item) => (
            <button
              type="button"
              key={`${item.cod_cli}-${item.descricao}`}
              className={styles.item}
              onClick={() => selecionar(item)}
            >
              {item.cod_cli} | {item.descricao}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
