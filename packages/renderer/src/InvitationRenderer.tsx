import type { InvitationDocument, InvitationSection } from "@invitica/invitation-schema";
import type { CSSProperties, ReactElement } from "react";

export interface InvitationRendererProps {
  document: InvitationDocument;
  mode: "preview" | "published";
  recipientName?: string;
  reducedMotion?: boolean;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported invitation section: ${JSON.stringify(value)}`);
}

function renderSection(section: InvitationSection): ReactElement {
  switch (section.type) {
    case "hero":
      return (
        <section
          key={section.id}
          data-animation={section.animationPreset}
          data-section-type={section.type}
        >
          {section.props.eyebrow ? <p>{section.props.eyebrow}</p> : null}
          <h1>{section.props.title}</h1>
          {section.props.subtitle ? <p>{section.props.subtitle}</p> : null}
          {section.props.dateLabel ? <time>{section.props.dateLabel}</time> : null}
        </section>
      );

    case "message":
      return (
        <section
          key={section.id}
          data-animation={section.animationPreset}
          data-section-type={section.type}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <p>{section.props.body}</p>
        </section>
      );

    case "venue":
      return (
        <section
          key={section.id}
          data-animation={section.animationPreset}
          data-section-type={section.type}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          <h3>{section.props.venueName}</h3>
          <address>{section.props.address}</address>
          {section.props.mapUrl ? <a href={section.props.mapUrl}>Open map</a> : null}
        </section>
      );

    case "rsvp":
      return (
        <section
          key={section.id}
          data-animation={section.animationPreset}
          data-section-type={section.type}
        >
          {section.props.heading ? <h2>{section.props.heading}</h2> : null}
          {section.props.message ? <p>{section.props.message}</p> : null}
          {section.props.deadline ? (
            <time dateTime={section.props.deadline}>RSVP deadline</time>
          ) : null}
          <div data-rsvp-slot="true" />
        </section>
      );

    default:
      return assertNever(section);
  }
}

export function InvitationRenderer({
  document,
  mode,
  recipientName,
  reducedMotion = false,
}: InvitationRendererProps) {
  const recipient = recipientName ?? document.opening.fallbackRecipientText;
  const style = {
    "--invitation-background": document.theme.colors.background,
    "--invitation-surface": document.theme.colors.surface,
    "--invitation-text": document.theme.colors.text,
    "--invitation-accent": document.theme.colors.accent,
    "--invitation-accent-contrast": document.theme.colors.accentContrast,
    backgroundColor: "var(--invitation-background)",
    color: "var(--invitation-text)",
  } as CSSProperties;

  return (
    <article
      data-invitation-schema-version={document.schemaVersion}
      data-render-mode={mode}
      data-spacing={document.theme.spacingScale}
      lang={document.locale}
      style={style}
    >
      <header
        data-motion-enabled={!reducedMotion}
        data-motion-style={document.opening.motionStyle}
        data-opening-preset={document.opening.preset}
      >
        <p>To: {recipient}</p>
      </header>

      <main>{document.sections.filter((section) => section.visible).map(renderSection)}</main>
    </article>
  );
}
