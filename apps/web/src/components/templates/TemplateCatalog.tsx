"use client";

import { type InvitationOpeningState, resolveTemplateRenderer } from "@invitica/renderer";
import { resolveTemplateById, type TemplateCatalogEntry } from "@invitica/template-kit";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { getMapTileKey } from "../../lib/map-tile-key";
import { Select } from "../forms/Select";
import { ArrowRight, SlidersHorizontal } from "../Icons";
import styles from "./TemplateCatalog.module.css";
import { UseTemplateForm } from "./UseTemplateForm";

type Device = "desktop" | "mobile";
type Tier = "All" | TemplateCatalogEntry["tier"];

interface TemplateCatalogProps {
  creationRequestIds: Readonly<Record<string, string>>;
  templates: readonly TemplateCatalogEntry[];
  usedTemplateVersionIds?: readonly string[];
}

export function TemplateCatalog({
  creationRequestIds,
  templates,
  usedTemplateVersionIds = [],
}: TemplateCatalogProps) {
  const [query, setQuery] = useState("");
  const [occasion, setOccasion] = useState("All");
  const [style, setStyle] = useState("All");
  const [tier, setTier] = useState<Tier>("All");
  const [sort, setSort] = useState("featured");
  const [preview, setPreview] = useState<TemplateCatalogEntry | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [device, setDevice] = useState<Device>("mobile");
  const [previewOpeningState, setPreviewOpeningState] = useState<InvitationOpeningState>("closed");
  const [previewReplayKey, setPreviewReplayKey] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const filterSheetId = useId();
  const filterSheetRef = useRef<HTMLDivElement>(null);
  const filterCloseButtonRef = useRef<HTMLButtonElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const usedTemplateVersions = useMemo(
    () => new Set(usedTemplateVersionIds),
    [usedTemplateVersionIds],
  );
  const occasions = useMemo(
    () => ["All", ...new Set(templates.map((template) => template.occasion))],
    [templates],
  );
  const stylesList = useMemo(
    () => ["All", ...new Set(templates.map((template) => template.style))],
    [templates],
  );
  const previewManifest = useMemo(
    () => (preview ? resolveTemplateById(preview.id) : null),
    [preview],
  );
  const PreviewRenderer = previewManifest
    ? resolveTemplateRenderer(previewManifest.rendererKey)
    : null;

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
  const activeFilterCount = [
    occasion !== "All",
    style !== "All",
    tier !== "All",
    sort !== "featured",
  ].filter(Boolean).length;

  useEffect(() => {
    if (!filtersOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    filterCloseButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        return;
      }

      if (event.key !== "Tab" || !filterSheetRef.current) return;

      const controls = Array.from(
        filterSheetRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled])",
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
      filterTriggerRef.current?.focus();
    };
  }, [filtersOpen]);

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
    setPreviewOpeningState("closed");
    setPreviewReplayKey(0);
    setPreview(template);
  }

  return (
    <section aria-labelledby="preview-collection-heading" className={styles.catalog}>
      <div className={styles.mobileSearchBar}>
        <label htmlFor="mobile-template-search">Search templates</label>
        <div>
          <input
            aria-label="Search templates on mobile"
            id="mobile-template-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates"
            type="search"
            value={query}
          />
          <button
            aria-controls={filterSheetId}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(true)}
            ref={filterTriggerRef}
            type="button"
          >
            <SlidersHorizontal />
            <span>Filters</span>
            {activeFilterCount > 0 ? <small>{activeFilterCount}</small> : null}
          </button>
        </div>
      </div>

      {activeFilterCount > 0 ? (
        <fieldset className={styles.activeFilters}>
          <legend>Active template filters</legend>
          {occasion !== "All" ? (
            <button onClick={() => setOccasion("All")} type="button">
              Occasion: {occasion} <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {style !== "All" ? (
            <button onClick={() => setStyle("All")} type="button">
              Style: {style} <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {tier !== "All" ? (
            <button onClick={() => setTier("All")} type="button">
              Tier: {tier} <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {sort !== "featured" ? (
            <button onClick={() => setSort("featured")} type="button">
              Sort: Name <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </fieldset>
      ) : null}

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

        <Select
          className={styles.selectField}
          id="template-occasion"
          label="Occasion"
          onChange={setOccasion}
          options={occasions.map((option) => ({ label: option, value: option }))}
          value={occasion}
        />

        <Select
          className={styles.selectField}
          id="template-style"
          label="Style"
          onChange={setStyle}
          options={stylesList.map((option) => ({ label: option, value: option }))}
          value={style}
        />

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

        <Select
          className={styles.selectField}
          id="template-sort"
          label="Sort"
          onChange={setSort}
          options={[
            { label: "Featured", value: "featured" },
            { label: "Name", value: "name" },
          ]}
          value={sort}
        />
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
              <button
                aria-label={`Quick preview ${template.name}`}
                className={styles.cardArtwork}
                data-template={template.id}
                onClick={() => openPreview(template)}
                type="button"
              >
                <span>{template.occasion}</span>
                <strong>{template.previewTitle}</strong>
                <small>{template.date}</small>
                <span className={styles.quickPreviewLabel}>Quick preview</span>
              </button>
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
                  <Link
                    aria-label={`Preview ${template.name} invitation in a new tab`}
                    className={styles.cardPreviewLink}
                    href={`/templates/${template.id}/preview`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span>Preview invitation</span>
                    <ArrowRight />
                  </Link>
                  <UseTemplateForm
                    creationRequestId={creationRequestIds[template.id] ?? ""}
                    manifest={resolveTemplateById(template.id)}
                    usedBefore={usedTemplateVersions.has(
                      resolveTemplateById(template.id).templateVersionId,
                    )}
                  />
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
                <div className={styles.previewToolbar}>
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
                  <button
                    className={styles.replayButton}
                    disabled={previewOpeningState !== "opened"}
                    onClick={() => {
                      setPreviewOpeningState("closed");
                      setPreviewReplayKey((current) => current + 1);
                    }}
                    type="button"
                  >
                    Replay opening
                  </button>
                  <Link
                    aria-label={`Open ${preview.name} full invitation in a new tab`}
                    className={styles.fullPreviewLink}
                    href={`/templates/${preview.id}/preview`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open full invitation <ArrowRight />
                  </Link>
                </div>
                {PreviewRenderer && previewManifest ? (
                  <div
                    className={styles.previewStage}
                    data-device={device}
                    data-testid="template-preview-stage"
                  >
                    <PreviewRenderer
                      document={previewManifest.defaultDocument}
                      key={previewManifest.templateVersionId}
                      mapTileKey={getMapTileKey()}
                      mode="preview"
                      onOpeningStateChange={setPreviewOpeningState}
                      openingReplayKey={previewReplayKey}
                    />
                  </div>
                ) : null}
              </div>

              <aside className={styles.previewDetails}>
                <p>
                  {previewManifest?.qualityStatus === "production"
                    ? "Production renderer"
                    : "Renderer-backed fixture"}
                </p>
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
                {previewManifest ? (
                  <div className={styles.previewCreation}>
                    <UseTemplateForm
                      creationRequestId={creationRequestIds[preview.id] ?? ""}
                      manifest={previewManifest}
                      showAvailability
                      usedBefore={usedTemplateVersions.has(previewManifest.templateVersionId)}
                      variant="preview"
                    />
                  </div>
                ) : null}
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {filtersOpen ? (
        <div className={styles.filterBackdrop}>
          <button
            aria-label="Close template filters"
            className={styles.filterDismiss}
            onClick={() => setFiltersOpen(false)}
            type="button"
          />
          <div
            aria-labelledby="mobile-filter-title"
            aria-modal="true"
            className={styles.filterSheet}
            id={filterSheetId}
            ref={filterSheetRef}
            role="dialog"
          >
            <header>
              <div>
                <p>Template collection</p>
                <h2 id="mobile-filter-title">Filter templates</h2>
              </div>
              <button
                aria-label="Close template filters"
                onClick={() => setFiltersOpen(false)}
                ref={filterCloseButtonRef}
                type="button"
              >
                Close
              </button>
            </header>

            <div className={styles.filterFields}>
              <Select
                id="mobile-template-occasion"
                label="Occasion"
                onChange={setOccasion}
                options={occasions.map((option) => ({ label: option, value: option }))}
                value={occasion}
              />
              <Select
                id="mobile-template-style"
                label="Style"
                onChange={setStyle}
                options={stylesList.map((option) => ({ label: option, value: option }))}
                value={style}
              />
              <fieldset>
                <legend>Access tier</legend>
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
              <Select
                id="mobile-template-sort"
                label="Sort"
                onChange={setSort}
                options={[
                  { label: "Featured", value: "featured" },
                  { label: "Name", value: "name" },
                ]}
                value={sort}
              />
            </div>

            <footer>
              <button onClick={clearFilters} type="button">
                Clear all
              </button>
              <button onClick={() => setFiltersOpen(false)} type="button">
                Show {filteredTemplates.length}{" "}
                {filteredTemplates.length === 1 ? "template" : "templates"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
