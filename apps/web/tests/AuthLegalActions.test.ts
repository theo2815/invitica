import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "../src/lib/supabase/server";
import { signInWithEmail, signUpWithEmail } from "../src/server/auth/actions";
import { legalAcceptanceCookieSecretIsConfigured } from "../src/server/legal/pending-acceptance";

vi.mock("@invitica/renderer/legal-documents", () => ({
  isLegalAcceptanceEnabled: () => true,
}));

vi.mock("../src/server/legal/acceptance", () => ({
  buildLegalAcceptancePath: vi.fn(),
  getPostAuthLegalRedirect: vi.fn(async () => null),
  recordCurrentTermsAcceptance: vi.fn(),
  setPendingTermsAcceptance: vi.fn(),
}));

vi.mock("../src/server/legal/pending-acceptance", () => ({
  legalAcceptanceCookieSecretIsConfigured: vi.fn(() => false),
}));

vi.mock("../src/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function validLoginForm(): FormData {
  const formData = new FormData();
  formData.set("email", "maria@example.com");
  formData.set("password", "a-secure-password");
  return formData;
}

function validRegistrationForm(): FormData {
  const formData = validLoginForm();
  formData.set("fullName", "Maria Santos");
  formData.set("confirmPassword", "a-secure-password");
  formData.set("termsAccepted", "yes");
  return formData;
}

describe("legal acceptance readiness in auth actions", () => {
  it("keeps ordinary email sign-in independent of the registration handoff secret", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { user: { id: "creator-1" } },
          error: null,
        })),
      },
      rpc: vi.fn(async () => ({ error: null })),
    } as never);

    await expect(signInWithEmail({ error: null }, validLoginForm())).rejects.toThrow(
      "redirect:/dashboard",
    );
    expect(legalAcceptanceCookieSecretIsConfigured).not.toHaveBeenCalled();
  });

  it("fails email registration before account creation when the handoff secret is unavailable", async () => {
    const result = await signUpWithEmail({ error: null }, validRegistrationForm());

    expect(result).toEqual({
      error: "Account creation is temporarily unavailable while legal acceptance is configured.",
    });
    expect(legalAcceptanceCookieSecretIsConfigured).toHaveBeenCalledOnce();
    expect(createClient).not.toHaveBeenCalled();
  });
});
