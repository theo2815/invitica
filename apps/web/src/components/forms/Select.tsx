"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Check, ChevronDown } from "../Icons";
import styles from "./CreatorControl.module.css";
import { useAnchoredPopover } from "./useAnchoredPopover";

export interface SelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

interface SelectProps {
  className?: string | undefined;
  disabled?: boolean;
  hint?: string;
  id: string;
  label: string;
  name?: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  value: string;
}

function nextEnabledIndex(
  options: readonly SelectOption[],
  currentIndex: number,
  direction: 1 | -1,
) {
  if (options.length === 0) return -1;

  for (let offset = 1; offset <= options.length; offset += 1) {
    const candidate = (currentIndex + direction * offset + options.length) % options.length;
    if (!options[candidate]?.disabled) return candidate;
  }

  return currentIndex;
}

function edgeEnabledIndex(options: readonly SelectOption[], edge: "end" | "start") {
  const indexes = options.map((_, index) => index);
  if (edge === "end") indexes.reverse();
  return indexes.find((index) => !options[index]?.disabled) ?? -1;
}

export function Select({
  className,
  disabled = false,
  hint,
  id,
  label,
  name,
  onChange,
  options,
  placeholder = "Select an option",
  value,
}: SelectProps) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const listboxId = `${generatedId}-listbox`;
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<number, HTMLButtonElement>());
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const popoverStyle = useAnchoredPopover({
    estimatedHeight: Math.min(options.length, 6) * 44 + 12,
    open,
    triggerRef,
  });

  useEffect(() => {
    if (!open) return;

    function handleOutsidePointer(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!rootRef.current?.contains(event.target) && !listboxRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current.get(activeIndex)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  function openListbox(direction?: 1 | -1) {
    if (disabled || options.length === 0) return;
    const fallback = edgeEnabledIndex(options, direction === -1 ? "end" : "start");
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : fallback);
    setOpen(true);
  }

  function chooseOption(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        openListbox(direction);
      } else {
        setActiveIndex((current) =>
          nextEnabledIndex(options, current < 0 ? selectedIndex : current, direction),
        );
      }
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setActiveIndex(edgeEnabledIndex(options, event.key === "End" ? "end" : "start"));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) chooseOption(activeIndex);
      else openListbox();
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "Tab" && open) {
      setOpen(false);
      return;
    }

    if (event.key.length === 1 && /\S/.test(event.key)) {
      const match = options.findIndex(
        (option) =>
          !option.disabled && option.label.toLocaleLowerCase().startsWith(event.key.toLowerCase()),
      );
      if (match >= 0) {
        event.preventDefault();
        if (!open) setOpen(true);
        setActiveIndex(match);
      }
    }
  }

  const listbox =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-labelledby={labelId}
            className={styles.selectPopover}
            id={listboxId}
            ref={listboxRef}
            role="listbox"
            style={popoverStyle}
          >
            {options.map((option, index) => (
              <button
                aria-selected={option.value === value}
                className={styles.selectOption}
                data-active={activeIndex === index}
                disabled={option.disabled}
                id={`${listboxId}-option-${index}`}
                key={option.value}
                onClick={() => chooseOption(index)}
                onPointerMove={() => {
                  if (!option.disabled) setActiveIndex(index);
                }}
                ref={(element) => {
                  if (element) optionRefs.current.set(index, element);
                  else optionRefs.current.delete(index);
                }}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span>{option.label}</span>
                {option.value === value ? <Check className={styles.optionCheck ?? ""} /> : null}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`${styles.field} ${className ?? ""}`} ref={rootRef}>
      <label className={styles.label} htmlFor={id}>
        <span id={labelId}>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </label>
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <button
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={labelId}
        className={styles.selectTrigger}
        disabled={disabled}
        id={id}
        onClick={() => {
          if (open) setOpen(false);
          else openListbox();
        }}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className={styles.selectValue}>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown />
      </button>
      {listbox}
    </div>
  );
}
