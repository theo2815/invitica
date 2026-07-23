"use client";

import { type InvitationOpeningState, resolveTemplateRenderer } from "@invitica/renderer";
import {
  resolveTemplateById,
  type TemplateCatalogEntry,
  type TemplateManifest,
} from "@invitica/template-kit";
import Link from "next/link";
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";

import { createInvitationDraftAction } from "../../server/invitations/actions";
import { ArrowRight } from "../Icons";
import styles from "./TemplateCatalog.module.css";

type Device = "desktop" | "mobile";
type Tier = "All" | TemplateCatalogEntry["tier"];

interface TemplateCatalogProps {
  creationRequestIds: Readonly<Record<string, string>>;
  templates: readonly TemplateCatalogEntry[];
  usedTemplateVersionIds?: readonly string[];
}

interface UseTemplateFormProps {
  creationRequestId: string;
  manifest: TemplateManifest;
  showAvailability?: boolean;
  usedBefore: boolean;
}

function UseTemplateForm({
  creationRequestId,
  manifest,
  showAvailability = false,
  usedBefore,
}: UseTemplateFormProps) {
  const [state, formAction, pending] = useActionState(createInvitationDraftAction, {
    error: null,
  });
  const [confirmingReuse, setConfirmingReuse] = useState(false);
  const confirmationId = useId();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const reuseButtonRef = useRef<HTMLButtonElement>(null);
  const hadConfirmationRef = useRef(false);
  const available = manifest.qualityStatus === "production";

  useEffect(() => {
    if (confirmingReuse) {
      hadConfirmationRef.current = true;
      confirmButtonRef.current?.focus();
    } else if (hadConfirmationRef.current) {
      hadConfirmationRef.current = false;
      reuseButtonRef.current?.focus();
    }
  }, [confirmingReuse]);

  return (
    <form
      action={formAction}
      className={`${styles.creationForm} ${confirmingReuse ? styles.creationFormExpanded : ""}`}
    >
      <input name="invitationId" type="hidden" value={creationRequestId} />
      <input name="templateVersionId" type="hidden" value={manifest.templateVersionId} />
      <button
        aria-controls={usedBefore ? confirmationId : undefined}
        aria-expanded={usedBefore ? confirmingReuse : undefined}
        disabled={!available || pending}
        onClick={usedBefore ? () => setConfirmingReuse(true) : undefined}
        ref={reuseButtonRef}
        title={available ? undefined : "This renderer-backed fixture is not available for creation"}
        type={usedBefore ? "button" : "submit"}
      >
        {pending ? "Creating draft…" : "Use this template"}
      </button>
      {confirmingReuse ? (
        <div className={styles.reuseConfirmation} id={confirmationId}>
          <p aria-live="polite">
            You have already started an invitation with {manifest.listing.name}. Create another one
            for a different event?
          </p>
          <div>
            <button ref={confirmButtonRef} type="submit">
              Create another
            </button>
            <Link href="/dashboard/invitations">View invitations</Link>
            <button onClick={() => setConfirmingReuse(false)} type="button">
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {state.error ? (
        <small className={styles.creationError} role="alert">
          {state.error}
        </small>
      ) : null}
      {showAvailability && !available ? (
        <small className={styles.creationNote}>
          Preview only — production creation is unavailable.
        </small>
      ) : null}
    </form>
  );
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
  const [device, setDevice] = useState<Device>("mobile");
  const [previewOpeningState, setPreviewOpeningState] = useState<InvitationOpeningState>("closed");
  const [previewReplayKey, setPreviewReplayKey] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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
      <div className={styles.catalogNotice}>
        <div>
          <p>Preview collection</p>
          <strong>Explore the art direction already established in Invitica.</strong>
        </div>
        <span>
          {templates.length} renderer-backed templates · Garden Promise production preview
        </span>
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
                  <UseTemplateForm
                    creationRequestId={creationRequestIds[preview.id] ?? ""}
                    manifest={previewManifest}
                    showAvailability
                    usedBefore={usedTemplateVersions.has(previewManifest.templateVersionId)}
                  />
                ) : null}
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
