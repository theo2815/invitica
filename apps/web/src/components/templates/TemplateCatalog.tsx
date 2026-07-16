"use client";

import type { TemplateCatalogEntry } from "@invitica/template-kit";
import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowRight } from "../Icons";
import styles from "./TemplateCatalog.module.css";

type Device = "desktop" | "mobile";
type Tier = "All" | TemplateCatalogEntry["tier"];

interface TemplateCatalogProps {
  templates: readonly TemplateCatalogEntry[];
}

export function TemplateCatalog({ templates }: TemplateCatalogProps) {
  const [query, setQuery] = useState("");
  const [occasion, setOccasion] = useState("All");
  const [style, setStyle] = useState("All");
  const [tier, setTier] = useState<Tier>("All");
  const [sort, setSort] = useState("featured");
  const [preview, setPreview] = useState<TemplateCatalogEntry | null>(null);
  const [device, setDevice] = useState<Device>("mobile");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const occasions = useMemo(
    () => ["All", ...new Set(templates.map((template) => template.occasion))],
    [templates],
  );
  const stylesList = useMemo(
    () => ["All", ...new Set(templates.map((template) => template.style))],
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-PH");
    const filtered = templates.filter((template) => {
      const searchable =
        `${template.name} ${template.occasion} ${template.style}`.toLocaleLowerCase("en-PH");

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (occasion === "All" || template.occasion === occasion) &&
        (style === "All" || template.style === style) &&
        (tier === "All" || template.tier === tier)
      );
    });

    if (sort === "name") {
      return [...filtered].sort((left, right) => left.name.localeCompare(right.name, "en-PH"));
    }

    return filtered;
  }, [occasion, query, sort, style, templates, tier]);

  useEffect(() => {
    if (!preview) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreview(null);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled])",
        ),
      );
      const first = controls[0];
      const last = controls.at(-1);

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [preview]);

  function clearFilters() {
    setQuery("");
    setOccasion("All");
    setStyle("All");
    setTier("All");
    setSort("featured");
  }

  function openPreview(template: TemplateCatalogEntry) {
    setDevice("mobile");
    setPreview(template);
  }

  return (
    <section aria-labelledby="preview-collection-heading" className={styles.catalog}>
      <div className={styles.catalogNotice}>
        <div>
          <p>Preview collection</p>
          <strong>Explore the art direction already established in Invitica.</strong>
        </div>
        <span>{templates.length} concept previews · Creation integration follows</span>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchField}>
          <label htmlFor="template-search">Search templates</label>
          <input
            id="template-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, occasion, or style"
            type="search"
            value={query}
          />
        </div>

        <div className={styles.selectField}>
          <label htmlFor="template-occasion">Occasion</label>
          <select
            id="template-occasion"
            onChange={(event) => setOccasion(event.target.value)}
            value={occasion}
          >
            {occasions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.selectField}>
          <label htmlFor="template-style">Style</label>
          <select
            id="template-style"
            onChange={(event) => setStyle(event.target.value)}
            value={style}
          >
            {stylesList.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <fieldset aria-label="Access tier" className={styles.tierControl}>
          {(["All", "Free", "Premium"] as const).map((option) => (
            <button
              aria-pressed={tier === option}
              key={option}
              onClick={() => setTier(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </fieldset>

        <div className={styles.selectField}>
          <label htmlFor="template-sort">Sort</label>
          <select id="template-sort" onChange={(event) => setSort(event.target.value)} value={sort}>
            <option value="featured">Featured</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <div className={styles.resultsHeading}>
        <div>
          <p>Curated beginnings</p>
          <h2 id="preview-collection-heading">Preview collection</h2>
        </div>
        <span aria-live="polite">
          {filteredTemplates.length} {filteredTemplates.length === 1 ? "template" : "templates"}
        </span>
      </div>

      {filteredTemplates.length ? (
        <div className={styles.templateGrid}>
          {filteredTemplates.map((template) => (
            <article className={styles.templateCard} key={template.id}>
              <div
                aria-label={`${template.name} invitation artwork`}
                className={styles.cardArtwork}
                data-template={template.id}
                role="img"
              >
                <span>{template.occasion}</span>
                <strong>{template.previewTitle}</strong>
                <small>{template.date}</small>
              </div>
              <div className={styles.cardDetails}>
                <div className={styles.cardMeta}>
                  <p>
                    {template.occasion} · {template.style}
                  </p>
                  <span>{template.tier}</span>
                </div>
                <h2>{template.name}</h2>
                <p>{template.description}</p>
                <div className={styles.cardActions}>
                  <button
                    aria-label={`Preview ${template.name}`}
                    onClick={() => openPreview(template)}
                    type="button"
                  >
                    Preview <ArrowRight />
                  </button>
                  <button disabled title="Invitation creation is not available yet" type="button">
                    Use this template
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.noResults}>
          <p>No matching designs</p>
          <h2>No templates match your search.</h2>
          <span>Try a different occasion, style, tier, or search phrase.</span>
          <button onClick={clearFilters} type="button">
            Clear filters
          </button>
        </div>
      )}

      {preview ? (
        <div className={styles.dialogBackdrop}>
          <div
            aria-labelledby="template-preview-title"
            aria-modal="true"
            className={styles.dialog}
            ref={dialogRef}
            role="dialog"
          >
            <header className={styles.dialogHeader}>
              <div>
                <p>
                  {preview.occasion} · {preview.tier}
                </p>
                <h2 id="template-preview-title">Preview {preview.name}</h2>
              </div>
              <button
                aria-label="Close template preview"
                onClick={() => setPreview(null)}
                ref={closeButtonRef}
                type="button"
              >
                Close
              </button>
            </header>

            <div className={styles.dialogBody}>
              <div className={styles.previewColumn}>
                <fieldset aria-label="Preview device" className={styles.deviceControl}>
                  <button
                    aria-pressed={device === "mobile"}
                    onClick={() => setDevice("mobile")}
                    type="button"
                  >
                    Mobile preview
                  </button>
                  <button
                    aria-pressed={device === "desktop"}
                    onClick={() => setDevice("desktop")}
                    type="button"
                  >
                    Desktop preview
                  </button>
                </fieldset>
                <div
                  className={styles.previewStage}
                  data-device={device}
                  data-testid="template-preview-stage"
                >
                  <div className={styles.previewArtwork} data-template={preview.id}>
                    <span>You are invited</span>
                    <strong>{preview.previewTitle}</strong>
                    <small>{preview.date}</small>
                  </div>
                </div>
              </div>

              <aside className={styles.previewDetails}>
                <p>Concept preview</p>
                <h3>{preview.style}</h3>
                <span>{preview.description}</span>
                <div>
                  <strong>Included sections</strong>
                  <ul>
                    {preview.sections.map((section) => (
                      <li key={section}>{section}</li>
                    ))}
                  </ul>
                </div>
                <button disabled type="button">
                  Use this template
                </button>
                <small>Available after invitation creation is connected.</small>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
