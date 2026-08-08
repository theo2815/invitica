import type { ReactNode } from "react";

import styles from "./Assistant.module.css";

/**
 * Renders Invi's answer.
 *
 * The help corpus is written in Markdown, so the model mirrors it and answers arrive with
 * `**bold**`, `-` bullets, and numbered steps in them. Until now the thread rendered that
 * as plain text, so a creator read the asterisks instead of the emphasis they stood for.
 *
 * The fix is a bounded reader rather than a Markdown library. Four block kinds and two
 * inline marks is the whole of what the prompt asks for and the whole of what this
 * accepts; anything else stays literal text. Nothing here builds HTML from a string — the
 * output is React elements, so a model that writes a tag writes four visible characters.
 *
 * Written to survive a half-arrived answer, because it renders one on every streamed
 * chunk: an unclosed `**` needs its closing pair before it means anything, so a mark that
 * is still arriving reads as the asterisks it currently is and resolves when it lands.
 */

type Block =
  | { items: string[]; kind: "ordered" }
  | { items: string[]; kind: "unordered" }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; lines: string[] };

const BULLET = /^\s{0,3}[-*•]\s+(.*)$/;
const NUMBERED = /^\s{0,3}\d{1,2}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;

/** `****` is an empty emphasis pair: it marks nothing, so it renders as nothing. */
const INLINE = /\*\*\*\*|\*\*([\s\S]+?)\*\*|`([\s\S]+?)`/g;

export function parseAnswerBlocks(text: string): Block[] {
  const blocks: Block[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    const open = blocks.at(-1);

    if (line.trim().length === 0) {
      // A blank line ends whatever was open. The next line starts a new block even if it
      // is the same kind, which is how a creator gets two lists instead of one.
      if (open) blocks.push({ kind: "paragraph", lines: [] });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading?.[1]) {
      blocks.push({ kind: "heading", text: heading[1].trim() });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet?.[1] !== undefined) {
      if (open?.kind === "unordered") open.items.push(bullet[1].trim());
      else blocks.push({ items: [bullet[1].trim()], kind: "unordered" });
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered?.[1] !== undefined) {
      if (open?.kind === "ordered") open.items.push(numbered[1].trim());
      else blocks.push({ items: [numbered[1].trim()], kind: "ordered" });
      continue;
    }

    if (open?.kind === "paragraph") open.lines.push(line.trim());
    else blocks.push({ kind: "paragraph", lines: [line.trim()] });
  }

  // The separator above pushes an empty paragraph rather than tracking a flag; they are
  // dropped here so an answer padded with blank lines does not render padded with them.
  return blocks.filter((block) =>
    block.kind === "paragraph"
      ? block.lines.length > 0
      : block.kind === "heading"
        ? block.text.length > 0
        : block.items.length > 0,
  );
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  INLINE.lastIndex = 0;
  let match = INLINE.exec(text);

  while (match !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));

    if (match[1] !== undefined) {
      nodes.push(<strong key={match.index}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(
        <code className={styles.answerCode} key={match.index}>
          {match[2]}
        </code>,
      );
    }

    cursor = match.index + match[0].length;
    match = INLINE.exec(text);
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function AssistantAnswer({ text }: { text: string }) {
  const blocks = parseAnswerBlocks(text);

  return (
    <div className={styles.answer}>
      {/* Blocks are re-derived whole from the answer on every streamed chunk, so position
          is the only identity they have. They are never reordered. */}
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <p className={styles.answerHeading} key={index}>
              {renderInline(block.text)}
            </p>
          );
        }

        if (block.kind === "unordered") {
          return (
            <ul className={styles.answerList} key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.kind === "ordered") {
          return (
            <ol className={styles.answerSteps} key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }

        return <p key={index}>{renderInline(block.lines.join(" "))}</p>;
      })}
    </div>
  );
}
