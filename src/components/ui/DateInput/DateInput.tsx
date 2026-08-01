"use client";

import type { InputHTMLAttributes } from "react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import styles from "./DateInput.module.css";

interface DateInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | "type"
    | "value"
    | "defaultValue"
    | "onChange"
    | "min"
    | "max"
  > {
  value?: string;
  defaultValue?: string;
  min?: string;
  max?: string;
  hasError?: boolean;
  onValueChange?: (value: string) => void;
}

const weekdays = ["D", "S", "T", "Q", "Q", "S", "S"];

function parseDate(value?: string) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value?: string) {
  const date = parseDate(value);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function DateInput({
  id,
  name,
  value,
  defaultValue = "",
  min,
  max,
  disabled = false,
  required = false,
  hasError = false,
  placeholder = "Selecione uma data",
  className = "",
  onValueChange,
  "aria-describedby": ariaDescribedBy,
}: DateInputProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const controlled = value !== undefined;

  const [internalValue, setInternalValue] =
    useState(defaultValue);

  const selectedValue = controlled
    ? value
    : internalValue;

  const selectedDate = parseDate(selectedValue);

  const [open, setOpen] = useState(false);

  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initialDate = selectedDate ?? new Date();

    return new Date(
      initialDate.getFullYear(),
      initialDate.getMonth(),
      1
    );
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [open]);

  function updateValue(nextValue: string) {
    if (!controlled) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
  }

  function selectDate(date: Date) {
    const isoDate = toIsoDate(date);

    if (
      (min && isoDate < min) ||
      (max && isoDate > max)
    ) {
      return;
    }

    updateValue(isoDate);
    setOpen(false);
  }

  function clearDate() {
    updateValue("");
    setOpen(false);
  }

  function selectToday() {
    const today = new Date();

    selectDate(today);
  }

  function changeMonth(offset: number) {
    setVisibleMonth(
      new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth() + offset,
        1
      )
    );
  }

  const firstDay = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1
  );

  const calendarStart = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1 - firstDay.getDay()
  );

  const calendarDays = Array.from(
    { length: 42 },
    (_, index) =>
      new Date(
        calendarStart.getFullYear(),
        calendarStart.getMonth(),
        calendarStart.getDate() + index
      )
  );

  const todayIso = toIsoDate(new Date());

  const monthLabel = capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(visibleMonth)
  );

  const wrapperClassName = [
    styles.wrapper,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const containerClassName = [
    styles.container,
    hasError ? styles.error : "",
    disabled ? styles.disabled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={wrapperRef}
      className={wrapperClassName}
    >
      <div className={containerClassName}>
        <input
          id={id}
          type="text"
          value={formatDate(selectedValue)}
          placeholder={placeholder}
          readOnly
          disabled={disabled}
          required={required}
          aria-required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={ariaDescribedBy}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={styles.input}
          onClick={() => {
            if (!disabled) {
              setOpen((current) => !current);
            }
          }}
        />

        <button
          type="button"
          className={styles.calendarButton}
          disabled={disabled}
          aria-label="Abrir calendário"
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          <CalendarDays aria-hidden="true" />
        </button>
      </div>

      {name && (
        <input
          type="hidden"
          name={name}
          value={selectedValue}
        />
      )}

      {open && (
        <div
          className={styles.calendar}
          role="dialog"
          aria-label="Selecionar data"
        >
          <div className={styles.calendarHeader}>
            <strong className={styles.monthLabel}>
              {monthLabel}
            </strong>

            <div className={styles.navigation}>
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft />
              </button>

              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight />
              </button>
            </div>
          </div>

          <div className={styles.weekdays}>
            {weekdays.map((weekday, index) => (
              <span key={`${weekday}-${index}`}>
                {weekday}
              </span>
            ))}
          </div>

          <div className={styles.days}>
            {calendarDays.map((date) => {
              const isoDate = toIsoDate(date);

              const outsideMonth =
                date.getMonth() !==
                visibleMonth.getMonth();

              const selected =
                isoDate === selectedValue;

              const today = isoDate === todayIso;

              const unavailable =
                Boolean(min && isoDate < min) ||
                Boolean(max && isoDate > max);

              const dayClassName = [
                styles.day,
                outsideMonth ? styles.outside : "",
                selected ? styles.selected : "",
                today ? styles.today : "",
                unavailable ? styles.unavailable : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={isoDate}
                  type="button"
                  disabled={unavailable}
                  className={dayClassName}
                  aria-label={new Intl.DateTimeFormat(
                    "pt-BR",
                    {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }
                  ).format(date)}
                  aria-pressed={selected}
                  onClick={() => selectDate(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className={styles.calendarFooter}>
            <button
              type="button"
              onClick={clearDate}
            >
              Limpar
            </button>

            <button
              type="button"
              onClick={selectToday}
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}