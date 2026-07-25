// Reusable, dependency-free iCalendar (RFC 5545) builder for guest "Add to calendar" actions.
// Pure string construction so it is unit-testable without a DOM; the browser-only download shell
// (Blob + object URL) lives in the renderers that consume it.

export interface IcsEvent {
  /** Globally stable identifier for the event (RFC 5545 UID). */
  readonly uid: string;
  readonly start: Date;
  readonly end: Date;
  readonly summary: string;
  readonly location?: string;
  readonly description?: string;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Formats a Date as an RFC 5545 UTC timestamp, e.g. `20270411T010000Z`. */
export function formatIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

/** Escapes reserved characters in an iCalendar text value (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds a content line to the 75-octet limit (RFC 5545 §3.1). Folding is a pure transport
 * encoding — clients unfold before parsing — so splitting mid-value (even mid-escape) is legal.
 */
function foldLine(line: string): string {
  if (line.length <= 73) {
    return line;
  }

  const parts: string[] = [line.slice(0, 73)];
  let remaining = line.slice(73);
  while (remaining.length > 72) {
    parts.push(` ${remaining.slice(0, 72)}`);
    remaining = remaining.slice(72);
  }
  parts.push(` ${remaining}`);
  return parts.join("\r\n");
}

/**
 * Builds a complete VCALENDAR document for one or more events. `stamp` is the generation time
 * (DTSTAMP); pass it explicitly so output is deterministic and testable.
 */
export function buildIcsCalendar(events: readonly IcsEvent[], stamp: Date): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Invitica//Invitation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const dtstamp = formatIcsUtc(stamp);

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeText(event.uid)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${formatIcsUtc(event.start)}`);
    lines.push(`DTEND:${formatIcsUtc(event.end)}`);
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
