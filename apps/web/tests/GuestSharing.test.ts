import { describe, expect, it } from "vitest";

import {
  buildGeneralInvitationMessage,
  buildPersonalInvitationMessage,
} from "../src/server/guests/sharing";

describe("guest invitation copy", () => {
  it("builds a platform-neutral general message around the delivered URL", () => {
    expect(
      buildGeneralInvitationMessage(
        "  Theo &  Lia's Wedding  ",
        "https://invite.example/i/theo-lia-abc",
      ),
    ).toBe(
      "You're invited to Theo & Lia's Wedding.\n\nView the invitation here:\nhttps://invite.example/i/theo-lia-abc",
    );
  });

  it("names the party recipient and keeps the personal fragment URL intact", () => {
    expect(
      buildPersonalInvitationMessage(
        "Theo & Lia's Wedding",
        "  John   Santos ",
        "https://invite.example/i/theo-lia-abc#g=private-token",
      ),
    ).toBe(
      "Hi John Santos! You're invited to Theo & Lia's Wedding.\n\nView your personal invitation and RSVP here:\nhttps://invite.example/i/theo-lia-abc#g=private-token",
    );
  });
});
