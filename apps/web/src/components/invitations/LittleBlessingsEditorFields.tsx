"use client";

import type { ReactNode } from "react";
import { useId } from "react";

import { CalendarPicker } from "../forms/CalendarPicker";
import { ChevronDown, Trash } from "../Icons";
import styles from "./LittleBlessingsDraftEditor.module.css";

/**
 * Presentational controls for the Little Blessings editor. They hold no draft
 * state: every value and change handler comes from the editor, which owns the
 * one document being edited.
 */

interface TextFieldProps {
  errorText?: string;
  hint?: string;
  id: string;
  invalid?: boolean;
  label: string;
  maxLength: number;
  onChange: (value: string) => void;
  placeholder?: string;
  requirement: string;
  rows?: number;
  value: string;
}

export function TextField({
  errorText = "Add this before the invitation can save.",
  hint,
  id,
  invalid = false,
  label,
  maxLength,
  onChange,
  placeholder,
  requirement,
  rows,
  value,
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = invalid ? errorId : hint ? hintId : undefined;

  return (
    <div className={styles.fieldGroup}>
      <label htmlFor={id}>
        {label}
        <span>{requirement}</span>
      </label>
      {rows ? (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={invalid}
          id={id}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          value={value}
        />
      ) : (
        <input
          aria-describedby={describedBy}
          aria-invalid={invalid}
          id={id}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      )}
      {invalid ? (
        <small className={styles.fieldError} id={errorId} role="alert">
          {errorText}
        </small>
      ) : hint ? (
        <small className={styles.fieldHint} id={hintId}>
          {hint}
        </small>
      ) : null}
    </div>
  );
}

interface DateFieldProps {
  hint?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  requirement?: string;
  value: string;
}

export function DateField({
  hint,
  id,
  label,
  onChange,
  requirement = "Optional",
  value,
}: DateFieldProps) {
  const hintId = `${id}-hint`;

  return (
    <div className={styles.fieldGroup}>
      <CalendarPicker hint={requirement} id={id} label={label} onChange={onChange} value={value} />
      {hint ? (
        <small className={styles.fieldHint} id={hintId}>
          {hint}
        </small>
      ) : null}
    </div>
  );
}

interface DateTimeFieldProps {
  date: string;
  id: string;
  label: string;
  onChange: (next: { date: string; time: string }) => void;
  time: string;
}

/**
 * A date plus a time of day. The invitation's event timezone is Asia/Manila, so
 * the editor never asks a creator to think about offsets; the saved value gets
 * the +08:00 offset the document contract requires.
 */
export function DateTimeField({ date, id, label, onChange, time }: DateTimeFieldProps) {
  return (
    <div className={styles.fieldRow}>
      <div className={styles.fieldGroup}>
        <CalendarPicker
          id={`${id}-date`}
          label={label}
          onChange={(nextDate) => onChange({ date: nextDate, time })}
          value={date}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor={`${id}-time`}>
          Start time
          <span>Philippine time</span>
        </label>
        <input
          id={`${id}-time`}
          onChange={(event) => onChange({ date, time: event.target.value })}
          type="time"
          value={time}
        />
      </div>
    </div>
  );
}

interface ColorFieldProps {
  id: string;
  label: string;
  onChange: (next: { label: string; value: string }) => void;
  value: string;
}

/** A named swatch. The name carries the meaning; the swatch only illustrates it. */
export function ColorField({ id, label, onChange, value }: ColorFieldProps) {
  const nameIsMissing = label.trim().length === 0;

  return (
    <div className={styles.colorField}>
      <div className={styles.fieldGroup}>
        <label htmlFor={`${id}-label`}>
          Color name
          <span>Required · 80 characters</span>
        </label>
        <input
          aria-describedby={nameIsMissing ? `${id}-label-error` : undefined}
          aria-invalid={nameIsMissing}
          id={`${id}-label`}
          maxLength={80}
          onChange={(event) => onChange({ label: event.target.value, value })}
          value={label}
        />
        {nameIsMissing ? (
          <small className={styles.fieldError} id={`${id}-label-error`} role="alert">
            Name this color so guests reading without swatches still understand it.
          </small>
        ) : null}
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor={id}>
          <span className={styles.visuallyHidden}>Swatch for {label || "this color"}</span>
        </label>
        <input
          id={id}
          onChange={(event) => onChange({ label, value: event.target.value })}
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#dd7f9b"}
        />
      </div>
    </div>
  );
}

interface SectionCardProps {
  children: ReactNode;
  index: number;
  /** Sections that cannot be toggled keep the switch visible but disabled, with the reason. */
  locked?: boolean;
  /** What the disabled switch says. Defaults to a section that can never be hidden. */
  lockedLabel?: string;
  name: string;
  note?: string;
  onToggleOpen: () => void;
  onToggleVisible: (visible: boolean) => void;
  open: boolean;
  visible: boolean;
}

export function SectionCard({
  children,
  index,
  locked = false,
  lockedLabel = "Always shown",
  name,
  note,
  onToggleOpen,
  onToggleVisible,
  open,
  visible,
}: SectionCardProps) {
  const generatedId = useId();
  const triggerId = `${generatedId}-trigger`;
  const panelId = `${generatedId}-panel`;
  const toggleId = `${generatedId}-visible`;

  return (
    <section className={styles.sectionCard} data-hidden={!visible}>
      <div className={styles.sectionHead}>
        <button
          aria-controls={panelId}
          aria-expanded={open}
          className={styles.sectionTrigger}
          id={triggerId}
          onClick={onToggleOpen}
          type="button"
        >
          <span className={styles.sectionIndex}>{index}</span>
          {name}
          <span aria-hidden="true" className={styles.sectionMarker}>
            <ChevronDown />
          </span>
        </button>
        <label className={styles.sectionToggle} htmlFor={toggleId}>
          <input
            checked={visible}
            disabled={locked}
            id={toggleId}
            onChange={(event) => onToggleVisible(event.target.checked)}
            type="checkbox"
          />
          {locked ? lockedLabel : "Show"}
        </label>
      </div>
      {/*
        A disclosure panel: the trigger's aria-expanded and aria-controls carry
        the relationship, so the panel needs no role or label of its own.
      */}
      <div className={styles.sectionPanel} hidden={!open} id={panelId}>
        {note ? <p className={styles.sectionNote}>{note}</p> : null}
        {children}
      </div>
    </section>
  );
}

interface CollectionItemProps {
  canRemove: boolean;
  children: ReactNode;
  /**
   * Positional name for the row's controls, such as "photograph 3". Kept
   * separate from the visible title, which follows creator content and may be
   * blank or repeated — neither of which makes a usable control name.
   */
  controlLabel: string;
  index: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  title: string;
  total: number;
}

export function CollectionItem({
  canRemove,
  children,
  controlLabel,
  index,
  onMove,
  onRemove,
  title,
  total,
}: CollectionItemProps) {
  return (
    <div className={styles.collectionItem}>
      <div className={styles.collectionItemHead}>
        <span className={styles.collectionItemTitle}>{title}</span>
        <div className={styles.collectionActions}>
          <button
            className={styles.iconButton}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            type="button"
          >
            <span aria-hidden="true">↑</span>
            <span className={styles.visuallyHidden}>Move {controlLabel} earlier</span>
          </button>
          <button
            className={styles.iconButton}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            type="button"
          >
            <span aria-hidden="true">↓</span>
            <span className={styles.visuallyHidden}>Move {controlLabel} later</span>
          </button>
          <button
            className={styles.iconButton}
            disabled={!canRemove}
            onClick={onRemove}
            type="button"
          >
            <Trash />
            <span className={styles.visuallyHidden}>Remove {controlLabel}</span>
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

interface AddItemButtonProps {
  atLimit: boolean;
  label: string;
  onAdd: () => void;
}

export function AddItemButton({ atLimit, label, onAdd }: AddItemButtonProps) {
  return (
    <button className={styles.addButton} disabled={atLimit} onClick={onAdd} type="button">
      {atLimit ? `${label} — limit reached` : label}
    </button>
  );
}

interface LastItemNoticeProps {
  message: string;
  onHideSection: () => void;
}

/**
 * Every Little Blessings collection requires at least one entry, so removing the
 * last one would produce a document the contract rejects. Hiding the section is
 * the honest alternative, and it keeps the creator's uploads.
 */
export function LastItemNotice({ message, onHideSection }: LastItemNoticeProps) {
  return (
    <div className={styles.lastItemNotice}>
      <p>{message}</p>
      <button onClick={onHideSection} type="button">
        Hide this section instead
      </button>
    </div>
  );
}
