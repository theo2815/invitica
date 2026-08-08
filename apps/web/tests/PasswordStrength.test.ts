import { describe, expect, it } from "vitest";

import {
  assessPassword,
  generatePassword,
  PASSWORD_MIN_LENGTH,
} from "../src/server/auth/password-strength";
import {
  validateEmailLogin,
  validateEmailRegistration,
  validatePasswordChange,
  validatePasswordUpdate,
} from "../src/server/auth/validation";

const STRONG = "Willow-marble-thistle-cobalt-41";

describe("password assessment", () => {
  it("refuses anything shorter than the floor", () => {
    // Eight characters passed until 2026-08-08; ten is the floor now.
    const assessment = assessPassword("abcdWXYZ");

    expect(assessment.acceptable).toBe(false);
    expect(assessment.problem).toBe(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
    expect(assessment.score).toBe(0);
    expect(assessment.requirements.find((r) => r.id === "length")?.met).toBe(false);
  });

  it("refuses a padded common word even at full length", () => {
    for (const password of ["password123", "Passw0rd123!", "qwertyuiop12", "invitica2026"]) {
      const assessment = assessPassword(password);
      expect(assessment.acceptable, password).toBe(false);
      expect(assessment.problem, password).toContain("too easy to guess");
    }
  });

  it("refuses digits or symbols alone, and too few distinct characters", () => {
    expect(assessPassword("1234567890").acceptable).toBe(false);
    expect(assessPassword("!!!!!!!!!!!!").acceptable).toBe(false);
    expect(assessPassword("ababababab").acceptable).toBe(false);
  });

  it("refuses the creator's own name and email address", () => {
    const context = { email: "maria.santos@example.invalid", fullName: "Maria Santos" };

    expect(assessPassword("mariasantos1", context).problem).toContain("name or email");
    // Leet substitutions do not get around it.
    expect(assessPassword("M4ri4Santos22", context).problem).toContain("name or email");
    expect(assessPassword("santos-forever-88", context).problem).toContain("name or email");
    // A short token like "ana" must not ban an unrelated word.
    expect(assessPassword("banana-lantern-quartz-19", { fullName: "Ana Cruz" }).acceptable).toBe(
      true,
    );
  });

  it("scores an acceptable password by length and variety", () => {
    expect(assessPassword("cedarwalnut").strength).toBe("weak");
    expect(assessPassword("cedar-walnut-33").strength).toBe("good");
    expect(assessPassword(STRONG).strength).toBe("strong");
    expect(assessPassword(STRONG).tip).toBeUndefined();
  });

  it("penalises a predictable run inside an otherwise long password", () => {
    const plain = assessPassword("thistle-quartz-meadow-sparrow");
    const withRun = assessPassword("thistle-quartz-abcdefgh-sparrow");

    expect(withRun.score).toBeLessThan(plain.score);
  });

  it("reports every requirement met once a password is acceptable", () => {
    expect(assessPassword(STRONG).requirements.every((r) => r.met)).toBe(true);
  });
});

describe("generated passwords", () => {
  it("always produces something the rules accept", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const password = generatePassword();
      const assessment = assessPassword(password);
      expect(assessment.acceptable, password).toBe(true);
      expect(assessment.strength, password).toBe("strong");
    }
  });

  it("does not repeat itself", () => {
    const generated = new Set(Array.from({ length: 50 }, generatePassword));
    expect(generated.size).toBeGreaterThan(45);
  });
});

describe("the validators enforce the same rule", () => {
  function registration(password: string, extra: Record<string, string> = {}) {
    const formData = new FormData();
    formData.set("fullName", "Maria Santos");
    formData.set("email", "maria@example.invalid");
    formData.set("password", password);
    formData.set("confirmPassword", password);
    for (const [key, value] of Object.entries(extra)) formData.set(key, value);
    return validateEmailRegistration(formData);
  }

  it("refuses a nine-character registration password", () => {
    const result = registration("abcdWXYZ1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.password).toBe(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
  });

  it("refuses the registrant's own name", () => {
    const result = registration("MariaSantos2026");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.password).toContain("name or email");
  });

  it("accepts a generated password", () => {
    expect(registration(STRONG).ok).toBe(true);
  });

  it("applies the same floor to recovery and to the settings change", () => {
    const reset = new FormData();
    reset.set("password", "abcdWXYZ1");
    reset.set("confirmPassword", "abcdWXYZ1");
    const resetResult = validatePasswordUpdate(reset);
    expect(resetResult.ok).toBe(false);
    if (!resetResult.ok) expect(resetResult.fieldErrors.password).toContain("at least 10");

    const change = new FormData();
    change.set("currentPassword", "whatever-the-old-one-was");
    change.set("password", "password1234");
    change.set("confirmPassword", "password1234");
    const changeResult = validatePasswordChange(change);
    expect(changeResult.ok).toBe(false);
    if (!changeResult.ok) expect(changeResult.fieldErrors.password).toContain("too easy to guess");
  });

  it("still reports an empty new-password field as empty rather than as too short", () => {
    const formData = new FormData();
    formData.set("password", "");
    formData.set("confirmPassword", "");

    const result = validatePasswordUpdate(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.password).toBe("Create a new password.");
  });

  it("leaves sign-in alone, so an existing short password still works", () => {
    // Every account created before 2026-08-08 could hold an eight-character password. Scoring it
    // at the sign-in form would lock its owner out of the only place they can change it.
    const formData = new FormData();
    formData.set("email", "maria@example.invalid");
    formData.set("password", "short8ch");

    expect(validateEmailLogin(formData).ok).toBe(true);
    // The same value is refused when it is being set.
    expect(registration("short8ch").ok).toBe(false);
  });
});
