import { describe, expect, it } from "vitest";

import { suggestMode } from "../src/lib/assistant/mode-routing";

/** A creator with an invitation selected that they can both draft into and organize. */
const everything = { canDraft: true, canOrganize: true };

/** In the editor: drafting works, but the invitation has not been published yet. */
const draftingOnly = { canDraft: true, canOrganize: false };

/** In the Guest Desk, or with nothing selected at all. */
const nothing = { canDraft: false, canOrganize: false };

describe("routing a message to the tab it belongs in", () => {
  it("offers drafting when a creator asks for a content change from the question tab", () => {
    const suggestion = suggestMode({
      ...everything,
      mode: "help",
      text: "change the reception time to 6pm",
    });

    expect(suggestion?.to).toBe("document");
  });

  it("offers the question tab when a creator asks how Invitica works while drafting", () => {
    // The more expensive of the two failures, and the reason this exists. Left alone, this
    // message spends a document turn on a proposal that changes nothing.
    const suggestion = suggestMode({
      ...everything,
      mode: "document",
      text: "how do I publish this?",
    });

    expect(suggestion?.to).toBe("help");
  });

  it("offers the guest tab for a list, and does not mistake it for invitation wording", () => {
    const suggestion = suggestMode({
      ...everything,
      mode: "help",
      text: "Tita Baby +2, Kuya Jun & Ate Mae, Santos family (5)",
    });

    expect(suggestion?.to).toBe("guests");
  });

  it("reads a correction to a parsed list as a guest-list message", () => {
    expect(
      suggestMode({ ...everything, mode: "help", text: "The Reyes family is 6, not 4" })?.to,
    ).toBe("guests");
  });

  it("says nothing when the message already belongs where the creator is", () => {
    expect(
      suggestMode({ ...everything, mode: "document", text: "change the reception time to 6pm" }),
    ).toBeNull();
    expect(
      suggestMode({ ...everything, mode: "help", text: "how do I send personalized links?" }),
    ).toBeNull();
    expect(
      suggestMode({ ...everything, mode: "guests", text: "Tita Baby +2, Ninong Ramon" }),
    ).toBeNull();
  });

  it("leaves a question about a content change alone in the question tab", () => {
    // Both readings are present, and in the help tab the help reading is the right one.
    // Interrupting a creator who is exactly where they should be is the worst failure here.
    expect(
      suggestMode({ ...everything, mode: "help", text: "how do I change the reception time?" }),
    ).toBeNull();
  });

  it("says nothing when a message is genuinely two requests", () => {
    expect(
      suggestMode({
        ...everything,
        mode: "help",
        text: "change the reception time and add Tita Baby +2",
      }),
    ).toBeNull();
  });

  it("still offers the one tab a creator could act on when the other is unavailable", () => {
    // The same two-request sentence. Organizing is not available, so there is no choice left
    // to get wrong — and drafting is a thing they can do right now.
    expect(
      suggestMode({
        ...draftingOnly,
        mode: "help",
        text: "change the reception time and add Tita Baby +2",
      })?.to,
    ).toBe("document");
  });
});

describe("what a suggestion is never allowed to do", () => {
  it("never offers drafting when Invi cannot draft into this invitation", () => {
    // Legacy Garden Promise v1 and the Guest Desk both land here. Offering the tab would send
    // a creator to one that cannot apply anything they get back.
    expect(
      suggestMode({ ...nothing, mode: "help", text: "change the reception time to 6pm" }),
    ).toBeNull();
  });

  it("never offers the guest tab for an invitation with no guest list yet", () => {
    // Guest parties belong to a published invitation. The route refuses this with a 404, so a
    // suggestion here would walk a creator into a refusal they had no way to see coming.
    expect(
      suggestMode({ ...draftingOnly, mode: "help", text: "Tita Baby +2, Ninong Ramon" }),
    ).toBeNull();
  });

  it("never offers the tab the creator is already in", () => {
    for (const mode of ["document", "guests", "help"] as const) {
      for (const text of [
        "change the reception time to 6pm",
        "how do I publish this?",
        "Tita Baby +2, Ninong Ramon",
        "add the programme: cocktails at 6, dinner 7",
      ]) {
        expect(suggestMode({ ...everything, mode, text })?.to).not.toBe(mode);
      }
    }
  });

  it("stays quiet on a message too short to have said anything yet", () => {
    expect(suggestMode({ ...everything, mode: "document", text: "how do" })).toBeNull();
    expect(suggestMode({ ...everything, mode: "help", text: "+2" })).toBeNull();
  });
});

describe("the words that separate one tab from another", () => {
  it("treats a named section as a drafting request, spelled either way", () => {
    // "Help me improve Section 5" is the founder's own example, and the section vocabulary
    // resolves the number server-side. Here it only has to be recognized as an edit at all.
    expect(
      suggestMode({ ...everything, mode: "help", text: "Help me improve Section 5" })?.to,
    ).toBe("document");
    expect(suggestMode({ ...everything, mode: "help", text: "rewrite section five" })?.to).toBe(
      "document",
    );
  });

  it("treats a request about tone as a drafting request", () => {
    expect(
      suggestMode({ ...everything, mode: "help", text: "make it warmer and less formal" })?.to,
    ).toBe("document");
  });

  it("does not read an edit verb on its own as a content change", () => {
    // "Add" with nothing of the invitation beside it is most often a guest. A verb alone was
    // the fastest way to make this fire on everything.
    expect(suggestMode({ ...everything, mode: "help", text: "can you add something" })).toBeNull();
  });

  it("does not read the word guest as a guest list", () => {
    // This is one of the three help suggestions on the empty thread, and it contains the word
    // twice. Reading it as a list would send a creator to the wrong tab from the front door.
    expect(
      suggestMode({
        ...everything,
        mode: "document",
        text: "Why can't my guest see the reply form?",
      })?.to,
    ).toBe("help");
  });

  it("recognizes the counting a real guest list does", () => {
    for (const text of [
      "add 4 pax for the Cruz side",
      "Ninang Let 2 seats",
      "please add Tito Boy to my guest list",
    ]) {
      expect(suggestMode({ ...everything, mode: "help", text })?.to).toBe("guests");
    }
  });

  it("gives a reason that names what it noticed, not what the creator should do", () => {
    const suggestion = suggestMode({
      ...everything,
      mode: "help",
      text: "change the reception time to 6pm",
    });

    expect(suggestion?.reason).toBe("That reads like a change to your invitation.");
  });
});
