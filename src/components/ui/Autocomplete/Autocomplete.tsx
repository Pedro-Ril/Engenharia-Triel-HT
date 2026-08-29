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
}: AutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(
    selectedOption?.label ?? ""
  );

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] =
    useState(-1);

  useEffect(() => {
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
          option.label
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedQuery)
        )
      : options;

    return maxOptions ? encontradas.slice(0, maxOptions) : encontradas;
  }, [options, query, maxOptions]);

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