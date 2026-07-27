import { describe, expect, it } from "vitest";

import {
  buildGeneralInvitationMessage,
  buildPersonalInvitationMessage,
  type InvitationShareContext,
} from "../src/server/guests/sharing";

function context(overrides: Partial<InvitationShareContext> = {}): InvitationShareContext {
  return {
    celebrantPronoun: "she",
    generalShareMessage: null,
    personalShareMessage: null,
    occasion: "Christening",
    title: "Nenita Grace Abellana Nemenzo",
    ...overrides,
  };
}

describe("guest invitation copy", () => {
  it("greets the party recipient and keeps the personal fragment URL intact", () => {
    expect(
      buildPersonalInvitationMessage(
        context(),
        "  Ninang   Anika ",
        "https://invite.example/i/nenita-abc#g=private-token",
      ),
    ).toBe(
      [
        "Hi, Ninang Anika",
        "",
        "We're happy to share Nenita Grace Abellana Nemenzo's christening invitation with you. We hope you can join us as we celebrate this special day and witness her first sacrament.",
        "",
        "Thank you for being a wonderful part of her life. We can't wait to celebrate with you!",
        "",
        "View your invitation here:",
        "https://invite.example/i/nenita-abc#g=private-token",
      ].join("\n"),
    );
  });

  it("addresses everyone at once on the general link and never promises an RSVP it cannot accept", () => {
    const message = buildGeneralInvitationMessage(context(), "https://invite.example/i/nenita-abc");

    expect(message.startsWith("Dear, Family & Friends\n\n")).toBe(true);
    expect(message).toContain("View the invitation here:\nhttps://invite.example/i/nenita-abc");
    expect(message).not.toContain("RSVP");
    expect(message).not.toContain("reply");
  });

  // Each occasion gets wording written for it; none borrows another's.
  it.each([
    [
      "Christening",
      "celebrate this special day and witness her first sacrament.",
      "a wonderful part of her life.",
    ],
    [
      "Wedding",
      "begin this new chapter and share the day with the people closest to us.",
      "Thank you for being part of our story.",
    ],
    [
      "Debut",
      "an evening of celebration as we mark this milestone together.",
      "a wonderful part of her journey.",
    ],
    [
      "Birthday",
      "celebrate another year and make a few more memories together.",
      "a wonderful part of her life.",
    ],
    [
      "Baby shower",
      "get ready to welcome our little one.",
      "Thank you for being part of this new chapter.",
    ],
    ["Anniversary", "mark another year together.", "Thank you for being part of our story."],
  ] as const)("writes wording made for a %s", (occasion, celebration, closing) => {
    const message = buildGeneralInvitationMessage(
      context({ occasion, title: "Mara & Joaquin" }),
      "https://invite.example/i/a",
    );

    expect(message).toContain(celebration);
    expect(message).toContain(closing);
    // A first sacrament belongs to a christening and to nothing else in the catalog.
    if (occasion !== "Christening") expect(message).not.toContain("sacrament");
  });

  it("falls back to neutral wording when the occasion cannot be resolved", () => {
    const message = buildGeneralInvitationMessage(
      context({ occasion: null, title: "Mara & Joaquin" }),
      "https://invite.example/i/a",
    );

    expect(message).toContain("We're happy to share Mara & Joaquin's invitation with you.");
    expect(message).toContain("We hope you can join us as we celebrate this special day.");
    expect(message).not.toContain("sacrament");
  });

  it("names the occasion from the template and falls back cleanly when it is unknown", () => {
    expect(
      buildGeneralInvitationMessage(
        context({ occasion: "Debut", title: "Sam" }),
        "https://invite.example/i/a",
      ),
    ).toContain("We're happy to share Sam's debut invitation with you.");

    expect(
      buildGeneralInvitationMessage(
        context({ occasion: null, title: "Mara & Joaquin" }),
        "https://invite.example/i/a",
      ),
    ).toContain("We're happy to share Mara & Joaquin's invitation with you.");
  });

  it("refers to the celebrant with the template's pronoun", () => {
    const her = buildGeneralInvitationMessage(context(), "https://invite.example/i/a");
    expect(her).toContain("witness her first sacrament.");
    expect(her).toContain("a wonderful part of her life.");

    const his = buildGeneralInvitationMessage(
      context({ celebrantPronoun: "he", title: "Mateo Luis" }),
      "https://invite.example/i/a",
    );
    expect(his).toContain("witness his first sacrament.");
    expect(his).toContain("a wonderful part of his life.");

    const their = buildGeneralInvitationMessage(
      context({ celebrantPronoun: "they", title: "Baby Reyes" }),
      "https://invite.example/i/a",
    );
    expect(their).toContain("witness their first sacrament.");
    expect(their).toContain("a wonderful part of their life.");

    // A wedding celebrates two people, so its wording carries no celebrant pronoun to get wrong.
    const wedding = buildGeneralInvitationMessage(
      context({ celebrantPronoun: "they", occasion: "Wedding", title: "Mara & Joaquin" }),
      "https://invite.example/i/a",
    );
    expect(wedding).toContain("Thank you for being part of our story.");
    expect(wedding).not.toMatch(/\b(her|his|their)\b/);
  });

  // A title is free text: creators write names, and they write whole clauses.
  it("keeps a clause-like title out of the possessive that would mangle it", () => {
    for (const title of ["Sam turns XVIII", "Lia is seven!", "Come celebrate with us"]) {
      const message = buildGeneralInvitationMessage(
        context({ occasion: "Birthday", title }),
        "https://invite.example/i/a",
      );
      expect(message).toContain(
        `We're happy to share our birthday invitation with you.\n\n${title}`,
      );
      expect(message).not.toContain(`${title}'s`);
    }

    for (const title of ["Eliana Grace", "Mara & Joaquin", "Nenita Grace Abellana Nemenzo"]) {
      expect(
        buildGeneralInvitationMessage(
          context({ occasion: "Christening", title }),
          "https://invite.example/i/a",
        ),
      ).toContain(`We're happy to share ${title}'s christening invitation with you.`);
    }
  });

  it("uses the creator's own wording when they have written some", () => {
    const personal = buildPersonalInvitationMessage(
      context({
        personalShareMessage: "Kumusta {recipient}! Join us for {celebrant}'s {occasion}: {link}",
      }),
      "Ninong Theo",
      "https://invite.example/i/nenita-abc#g=token",
    );

    expect(personal).toBe(
      "Kumusta Ninong Theo! Join us for Nenita Grace Abellana Nemenzo's christening: https://invite.example/i/nenita-abc#g=token",
    );
    // The creator's wording replaces the generated default outright rather than wrapping it.
    expect(personal).not.toContain("We're happy to share");
  });

  it("keeps each message on its own wording", () => {
    const invitation = context({
      generalShareMessage: "Everyone is welcome: {link}",
      personalShareMessage: "For {recipient} only: {link}",
    });

    expect(buildPersonalInvitationMessage(invitation, "Tita Lena", "https://x/i/a#g=t")).toBe(
      "For Tita Lena only: https://x/i/a#g=t",
    );
    expect(buildGeneralInvitationMessage(invitation, "https://x/i/a")).toBe(
      "Everyone is welcome: https://x/i/a",
    );
  });

  it("falls back to the generated default for whichever message is not customised", () => {
    const invitation = context({ generalShareMessage: "Only the general one: {link}" });

    expect(buildPersonalInvitationMessage(invitation, "Tita Lena", "https://x/i/a#g=t")).toContain(
      "We're happy to share Nenita Grace Abellana Nemenzo's christening invitation with you.",
    );
    expect(buildGeneralInvitationMessage(invitation, "https://x/i/a")).toBe(
      "Only the general one: https://x/i/a",
    );
  });

  it("leaves an unknown placeholder untouched rather than substituting an empty string", () => {
    // The server and SQL both reject these before storage; this pins what would reach a guest
    // if one ever slipped through, so it fails loudly rather than silently vanishing.
    expect(
      buildGeneralInvitationMessage(
        context({ generalShareMessage: "Hello {nickname}: {link}" }),
        "https://x/i/a",
      ),
    ).toBe("Hello {nickname}: https://x/i/a");
  });

  it("does not double the s on a name that already ends in one", () => {
    expect(
      buildGeneralInvitationMessage(
        context({ occasion: "Wedding", title: "Charles" }),
        "https://invite.example/i/a",
      ),
    ).toContain("Charles' wedding invitation");
  });
});
