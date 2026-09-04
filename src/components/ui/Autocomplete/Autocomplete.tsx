"use client";

import {
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./Autocomplete.module.css";

export interface AutocompleteOption {
  value: string;
  label: string;
}

interface AutocompleteProps {
  id?: string;
  name?: string;
  options: AutocompleteOption[];
  selectedOption?: AutocompleteOption | null;
  onSelect?: (option: AutocompleteOption | null) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  hasError?: boolean;
  /* Limita quantas opções aparecem na lista aberta de uma vez — importante quando `options` vem de um catálogo grande (ex: milhares de itens de ERP). */
  maxOptions?: number;
  /*
   * Substitui o filtro padrão (substring em qualquer parte do label,
   * já normalizado em minúsculas e sem espaço nas pontas). Use quando
   * o padrão for texto demais pra um campo que é essencialmente um
   * código (ex: buscar só por prefixo exato do código, ignorando a
   * descrição).
   */
  filterOption?: (option: AutocompleteOption, normalizedQuery: string) => boolean;
}

export function Autocomplete({
  id,
  name,
  options,
  selectedOption = null,
  onSelect,
  placeholder,
  emptyMessage = "Nenhum resultado encontrado.",
  disabled = false,
  hasError = false,
  maxOptions,
  filterOption,
}: AutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(
    selectedOption?.label ?? ""
  );

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] =
    useState(-1);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza o texto exibido com o `selectedOption` controlado externamente pelo pai
    setQuery(selectedOption?.label ?? "");
  }, [selectedOption]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .toLocaleLowerCase("pt-BR");

    const encontradas = normalizedQuery
      ? options.filter((option) =>
          filterOption
            ? filterOption(option, normalizedQuery)
            : option.label
                .toLocaleLowerCase("pt-BR")
                .includes(normalizedQuery)
        )
      : options;

    if (!maxOptions || encontradas.length <= maxOptions) {
      return encontradas;
    }

    /*
     * "options" chega na ordem que o chamador montou (ex: ordem de
     * inserção de um Map, nada a ver com o código em si) — cortar
     * direto em maxOptions sem ordenar antes descartava um subconjunto
     * arbitrário, escondendo em silêncio um item válido (ex: buscar
     * "1" com centenas de resultados e o item "11" cair fora só por
     * ter sido encontrado depois dos outros 50 na árvore da
     * estrutura). Ordena por label (numeric:true trata "2" < "11" <
     * "100" corretamente) antes de cortar, pra o corte ser sempre os
     * mesmos primeiros N em vez de depender da sorte da ordem de
     * entrada.
     */
    return [...encontradas]
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }))
      .slice(0, maxOptions);
  }, [options, query, maxOptions, filterOption]);

  function handleSelect(option: AutocompleteOption) {
    setQuery(option.label);
    setOpen(false);
    setHighlightedIndex(-1);
    onSelect?.(option);
  }

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);
    setHighlightedIndex(-1);

    if (
      selectedOption &&
      value !== selectedOption.label
    ) {
      onSelect?.(null);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();

      setOpen(true);
      setHighlightedIndex((current) =>
        Math.min(current + 1, filteredOptions.length - 1)
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setHighlightedIndex((current) =>
        Math.max(current - 1, 0)
      );
    }

    if (event.key === "Enter") {
      if (
        open &&
        highlightedIndex >= 0 &&
        filteredOptions[highlightedIndex]
      ) {
        event.preventDefault();
        handleSelect(filteredOptions[highlightedIndex]);
      }
    }

    if (event.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div
      ref={containerRef}
      className={styles.container}
    >
      <input
        id={id}
        name={name}
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-options` : undefined}
        className={[
          styles.input,
          hasError ? styles.inputError : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onFocus={() => setOpen(true)}
        onChange={(event) =>
          handleChange(event.target.value)
        }
        onKeyDown={handleKeyDown}
      />

      {open && !disabled && (
        <div
          id={id ? `${id}-options` : undefined}
          className={styles.dropdown}
          role="listbox"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={
                  selectedOption?.value === option.value
                }
                className={[
                  styles.option,
                  highlightedIndex === index
                    ? styles.optionHighlighted
                    : "",
                  selectedOption?.value === option.value
                    ? styles.optionSelected
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() =>
                  setHighlightedIndex(index)
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSelect(option);
                }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className={styles.empty}>
              {emptyMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}