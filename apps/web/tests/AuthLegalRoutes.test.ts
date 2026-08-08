import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as authCallback } from "../app/auth/callback/route";
import { GET as emailConfirmation } from "../app/auth/confirm/route";
import { createClient } from "../src/lib/supabase/server";
import {
  applyPendingTermsAcceptance,
  getPostAuthLegalRedirect,
} from "../src/server/legal/acceptance";

vi.mock("../src/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("../src/server/legal/acceptance", () => ({
  applyPendingTermsAcceptance: vi.fn(),
  getPostAuthLegalRedirect: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://invitica.test";
});

describe("post-auth legal acceptance routes", () => {
  it("gates a Google identity before preparing its creator workspace", async () => {
    const rpc = vi.fn();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: { user: { id: "creator-1" } },
          error: null,
        })),
      },
      rpc,
    } as never);
    vi.mocked(getPostAuthLegalRedirect).mockResolvedValue(
      "/legal/acceptance?next=%2Fdashboard%2Ftemplates",
    );

    const response = await authCallback(
      new Request(
        "https://invitica.test/auth/callback?code=oauth-code&next=%2Fdashboard%2Ftemplates",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://invitica.test/legal/acceptance?next=%2Fdashboard%2Ftemplates",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("applies email pre-consent before the version check and workspace preparation", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({ error: null })),
        getUser: vi.fn(async () => ({
          data: { user: { id: "creator-2" } },
        })),
        verifyOtp: vi.fn(),
      },
      rpc,
    } as never);
    vi.mocked(applyPendingTermsAcceptance).mockResolvedValue({ error: null });
    vi.mocked(getPostAuthLegalRedirect).mockResolvedValue(null);

    const response = await emailConfirmation(
      new Request(
        "https://invitica.test/auth/confirm?code=email-code&next=%2Fdashboard%2Finvitations",
      ),
    );

    expect(response.headers.get("location")).toBe("https://invitica.test/dashboard/invitations");
    expect(applyPendingTermsAcceptance).toHaveBeenCalledWith(expect.anything(), "creator-2");
    expect(vi.mocked(applyPendingTermsAcceptance).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getPostAuthLegalRedirect).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(vi.mocked(getPostAuthLegalRedirect).mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});
