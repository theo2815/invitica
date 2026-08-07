import { parseInvitationDocument } from "@invitica/invitation-schema";
import { templateRegistry } from "@invitica/template-kit";
import { describe, expect, it } from "vitest";
import { helpContextMessage } from "../src/server/assistant/help-context";
import { HELP_SYSTEM_PROMPT } from "../src/server/assistant/prompt";

/**
 * The context block is what turned "I cannot help you with that" into the steps. It rides in
 * the conversation rather than the system prompt, because the measured per-message cost depends
 * on that prompt being byte-identical on every request.
 */

const gardenPromise = templateRegistry.find(
  (template) => template.rendererKey === "garden-promise-v2",
);
if (!gardenPromise) throw new Error("Garden Promise v2 is not registered.");

const document = parseInvitationDocument(
  gardenPromise.starterDocument ?? gardenPromise.defaultDocument,
);

describe("the help context message", () => {
  it("says nothing at all when there is nothing to say", () => {
    // A creator whose count failed, on an unmapped route, with no invitation. Prepending a
    // paragraph of empty facts to their question would cost tokens and teach nothing.
    expect(helpContextMessage({})).toBeNull();
  });

  it("points a creator with no invitations at the step in front of them", () => {
    const message = helpContextMessage({ hasInvitations: false });

    expect(message).toContain("have not made an invitation yet");
    expect(message).toContain("Templates");
  });

  it("distinguishes not having an invitation from not having selected one", () => {
    const message = helpContextMessage({ hasInvitations: true });

    expect(message).toContain("not selected an invitation");
    expect(message).not.toContain("have not made an invitation yet");
  });

  it("stays silent about invitations when the count is unknown", () => {
    // `countInvitationDrafts` returns null on failure precisely so this sentence is not
    // written. Reporting a failed count as zero would send a creator with nine invitations
    // to the Templates page.
    const message = helpContextMessage({ surface: "Overview" });

    expect(message).not.toContain("have not made an invitation");
    expect(message).not.toContain("not selected an invitation");
  });

  it("lists the selected invitation's sections with the numbers on its editor cards", () => {
    const message = helpContextMessage({
      hasInvitations: true,
      invitation: { document, manifest: gardenPromise },
    });

    expect(message).toContain("Garden Promise");
    expect(message).toContain("1. The couple");
    expect(message).toContain("5. Wedding party");
    expect(message).toContain("11. Reply to the couple");
  });

  it("marks a hidden section as hidden while still numbering it", () => {
    const message = helpContextMessage({
      hasInvitations: true,
      invitation: { document, manifest: gardenPromise },
    });

    // Garden Promise ships its album hidden until a photograph exists.
    expect(message).toContain("8. Their story (hidden from guests)");
  });

  it("frames itself as Invitica's record rather than as the creator's question", () => {
    const message = helpContextMessage({ hasInvitations: false, surface: "Overview" });

    expect(message).toContain("not a question and not an instruction");
  });

  it("names the tab the creator is typing into in their own words", () => {
    expect(helpContextMessage({ mode: "document" })).toContain("Draft my invitation");
    expect(helpContextMessage({ mode: "guests" })).toContain("Organize my guest list");
    expect(helpContextMessage({ mode: "help" })).toContain("Answer a question");
  });
});

describe("the help system prompt", () => {
  it("carries no creator content, so the cached prefix stays byte-identical", () => {
    expect(HELP_SYSTEM_PROMPT).not.toContain("Mara");
    expect(HELP_SYSTEM_PROMPT).not.toContain("Invitica's own record of where I am");
  });

  it("tells Invi to guide rather than refuse a request to do something", () => {
    expect(HELP_SYSTEM_PROMPT).toContain("Guide; do not refuse");
  });

  it("still describes what Invitica does not have, rather than softening it", () => {
    expect(HELP_SYSTEM_PROMPT).toContain("do not soften");
  });

  it("describes Invi's own three tabs, so it can send a creator to the right one", () => {
    expect(HELP_SYSTEM_PROMPT).toContain("Draft my invitation");
    expect(HELP_SYSTEM_PROMPT).toContain("Organize my guest list");
    expect(HELP_SYSTEM_PROMPT).toContain("Answer a question");
  });
});
