"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CalendarDays, ChevronLeft, ChevronRight } from "../Icons";
import styles from "./CreatorControl.module.css";
import { useAnchoredPopover } from "./useAnchoredPopover";

type CalendarDisplayFormat = "iso" | "long";

interface CalendarPickerProps {
  ariaDescribedBy?: string;
  className?: string | undefined;
  disabled?: boolean;
  displayFormat?: CalendarDisplayFormat;
  hint?: string;
  id: string;
  invalid?: boolean;
  label: string;
  max?: string;
  min?: string;
  name?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function parseCalendarDate(value: string) {
  const isoDate = parseIsoDate(value);
  if (isoDate) return toIsoDate(isoDate);
  if (!value.trim()) return "";

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : toIsoDate(parsed);
}

export function formatLongCalendarDate(value: string) {
  const date = parseIsoDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatInputValue(value: string, displayFormat: CalendarDisplayFormat) {
  if (!value) return "";
  return displayFormat === "long" ? formatLongCalendarDate(value) : value;
}

function parseInputValue(value: string, displayFormat: CalendarDisplayFormat) {
  if (!value.trim()) return "";
  return displayFormat === "long" ? parseCalendarDate(value) : parseIsoDate(value) ? value : null;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function dateIsAllowed(value: string, min?: string, max?: string) {
  if (min && value < min) return false;
  if (max && value > max) return false;
  return true;
}

function dayAriaLabel(date: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  }).format(date);
}

export function CalendarPicker({
  ariaDescribedBy,
  className,
  disabled = false,
  displayFormat = "iso",
  hint,
  id,
  invalid = false,
  label,
  max,
  min,
  name,
  onChange,
  placeholder,
  value,
}: CalendarPickerProps) {
  const generatedId = useId();
  const dialogId = `${generatedId}-calendar`;
  const labelId = `${generatedId}-label`;
  const manualErrorId = `${generatedId}-manual-error`;
  const selectedDate = parseIsoDate(value);
  const today = useMemo(() => new Date(), []);
  const [draft, setDraft] = useState(() => formatInputValue(value, displayFormat));
  const [focusedDate, setFocusedDate] = useState(value || toIsoDate(today));
  const [manualInvalid, setManualInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(selectedDate ?? today));
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const popoverStyle = useAnchoredPopover({
    estimatedHeight: 390,
    minimumWidth: 336,
    open,
    triggerRef,
  });

  useEffect(() => {
    setDraft(formatInputValue(value, displayFormat));
    setManualInvalid(false);
  }, [displayFormat, value]);

  useEffect(() => {
    if (!open) return;

    function handleOutsidePointer(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!rootRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => {
      dayRefs.current.get(focusedDate)?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [focusedDate, open]);

  const dayCells = useMemo(() => {
    const leadingDays = visibleMonth.getDay();
    const cells: Array<Date | null> = Array.from({ length: leadingDays }, () => null);
    for (let day = 1; day <= daysInMonth(visibleMonth); day += 1) {
      cells.push(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [visibleMonth]);

  function openCalendar() {
    if (disabled) return;
    const focusTarget = selectedDate ?? today;
    setVisibleMonth(monthStart(focusTarget));
    setFocusedDate(toIsoDate(focusTarget));
    setOpen(true);
  }

  function chooseDate(nextValue: string) {
    if (!dateIsAllowed(nextValue, min, max)) return;
    onChange(nextValue);
    setManualInvalid(false);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveFocusedDate(nextDate: Date) {
    const nextValue = toIsoDate(nextDate);
    if (!dateIsAllowed(nextValue, min, max)) return;
    setVisibleMonth(monthStart(nextDate));
    setFocusedDate(nextValue);
  }

  function handleDayKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, date: Date) {
    let nextDate: Date | null = null;
    if (event.key === "ArrowLeft") nextDate = addDays(date, -1);
    if (event.key === "ArrowRight") nextDate = addDays(date, 1);
    if (event.key === "ArrowUp") nextDate = addDays(date, -7);
    if (event.key === "ArrowDown") nextDate = addDays(date, 7);
    if (event.key === "Home") nextDate = addDays(date, -date.getDay());
    if (event.key === "End") nextDate = addDays(date, 6 - date.getDay());
    if (event.key === "PageUp") nextDate = addMonths(date, -1);
    if (event.key === "PageDown") nextDate = addMonths(date, 1);
    if (!nextDate) return;
    event.preventDefault();
    moveFocusedDate(nextDate);
  }

  function changeVisibleMonth(amount: number) {
    const nextMonth = addMonths(visibleMonth, amount);
    const currentFocused = parseIsoDate(focusedDate);
    const day = Math.min(currentFocused?.getDate() ?? 1, daysInMonth(nextMonth));
    const nextDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day);
    setVisibleMonth(nextMonth);
    setFocusedDate(toIsoDate(nextDate));
  }

  const inputError = manualInvalid ? manualErrorId : ariaDescribedBy;
  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-labelledby={`${dialogId}-title`}
            className={styles.calendarPopover}
            id={dialogId}
            ref={popoverRef}
            role="dialog"
            style={popoverStyle}
          >
            <header className={styles.calendarHeader}>
              <button
                aria-label="Previous month"
                className={styles.monthButton}
                onClick={() => changeVisibleMonth(-1)}
                type="button"
              >
                <ChevronLeft />
              </button>
              <h2 id={`${dialogId}-title`}>
                {new Intl.DateTimeFormat("en-PH", {
                  month: "long",
                  year: "numeric",
                }).format(visibleMonth)}
              </h2>
              <button
                aria-label="Next month"
                className={styles.monthButton}
                onClick={() => changeVisibleMonth(1)}
                type="button"
              >
                <ChevronRight />
              </button>
            </header>

            <div aria-hidden="true" className={styles.weekdayRow}>
              {weekdays.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>

            <fieldset className={styles.dayFieldset}>
              <legend>{label} calendar days</legend>
              <div className={styles.dayGrid}>
                {dayCells.map((date, index) =>
                  date ? (
                    <button
                      aria-label={dayAriaLabel(date)}
                      aria-pressed={toIsoDate(date) === value}
                      className={styles.dayButton}
                      data-today={toIsoDate(date) === toIsoDate(today)}
                      disabled={!dateIsAllowed(toIsoDate(date), min, max)}
                      key={toIsoDate(date)}
                      onClick={() => chooseDate(toIsoDate(date))}
                      onKeyDown={(event) => handleDayKeyDown(event, date)}
                      ref={(element) => {
                        const dateValue = toIsoDate(date);
                        if (element) dayRefs.current.set(dateValue, element);
                        else dayRefs.current.delete(dateValue);
                      }}
                      tabIndex={toIsoDate(date) === focusedDate ? 0 : -1}
                      type="button"
                    >
                      {date.getDate()}
                    </button>
                  ) : (
                    <span aria-hidden="true" className={styles.daySpacer} key={`spacer-${index}`} />
                  ),
                )}
              </div>
            </fieldset>

            <footer className={styles.calendarFooter}>
              <button
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                type="button"
              >
                Clear
              </button>
              <button
                disabled={!dateIsAllowed(toIsoDate(today), min, max)}
                onClick={() => chooseDate(toIsoDate(today))}
                type="button"
              >
                Today
              </button>
            </footer>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`${styles.field} ${className ?? ""}`} ref={rootRef}>
      <label className={styles.label} htmlFor={id} id={labelId}>
        {label}
        {hint ? <small>{hint}</small> : null}
      </label>
      <div className={styles.dateControl}>
        <input
          aria-describedby={inputError}
          aria-invalid={invalid || manualInvalid}
          className={styles.dateInput}
          disabled={disabled}
          id={id}
          inputMode="numeric"
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            const parsed = parseInputValue(nextDraft, displayFormat);
            setDraft(nextDraft);
            setManualInvalid(parsed === null);
            if (parsed !== null) onChange(parsed);
          }}
          placeholder={placeholder ?? (displayFormat === "long" ? "Month DD, YYYY" : "YYYY-MM-DD")}
          ref={inputRef}
          type="text"
          value={draft}
        />
        {name ? <input name={name} type="hidden" value={value} /> : null}
        <button
          aria-controls={dialogId}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Open ${label} calendar`}
          className={styles.calendarTrigger}
          disabled={disabled}
          onClick={() => {
            if (open) setOpen(false);
            else openCalendar();
          }}
          ref={triggerRef}
          type="button"
        >
          <CalendarDays />
        </button>
      </div>
      {manualInvalid ? (
        <small className={styles.fieldError} id={manualErrorId} role="alert">
          Use a valid {displayFormat === "long" ? "calendar date" : "YYYY-MM-DD date"}.
        </small>
      ) : null}
      {dialog}
    </div>
  );
}
