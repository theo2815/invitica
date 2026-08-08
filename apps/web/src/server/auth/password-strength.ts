/**
 * One password rule, read by the meter a creator watches and by the validator that refuses the
 * save. They call the same function so they cannot disagree — a bar that says "strong" over a
 * server error is worse than no bar at all.
 *
 * **No character-class requirements.** NIST SP 800-63B advises against them, and they reliably
 * produce `Passw0rd!` rather than a better password. What is enforced instead is length, a
 * blocklist of predictable words, and the creator's own name and email — the three things that
 * actually appear in a compromised account.
 *
 * **No new dependency.** `zxcvbn` is roughly 800 KB of dictionaries against a repository rule that
 * budgets JavaScript for a mid-range phone on a slower Philippine connection. This is a few dozen
 * lines and ships in the bundle that was already being sent.
 */

/** Raised from 8 on 2026-08-08. Existing passwords are unaffected; this governs a password being set. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordStrength = "fair" | "good" | "strong" | "weak";

export interface PasswordRequirement {
  id: "length" | "notCommon" | "notPersonal";
  label: string;
  met: boolean;
}

export interface PasswordAssessment {
  /** False when the validators must refuse it. */
  acceptable: boolean;
  /** The sentence to show when `acceptable` is false. */
  problem: string | undefined;
  requirements: PasswordRequirement[];
  /** 0 to 4, for the meter's width. Always 0 when unacceptable. */
  score: number;
  strength: PasswordStrength;
  /** One optional sentence on how to make an already-acceptable password better. */
  tip: string | undefined;
}

export interface PasswordContext {
  email?: string | undefined;
  fullName?: string | undefined;
}

/**
 * Words that are predictable here specifically, reduced to letters. Deliberately short: at ten
 * characters the classic leaks are already excluded by length, so what remains worth naming is the
 * padded forms people reach for next — `password123`, `invitica2026`, `qwerty123456`.
 */
const WEAK_BASES = new Set([
  "abc",
  "admin",
  "asdf",
  "changeme",
  "iloveyou",
  "invitation",
  "invitica",
  "letmein",
  "login",
  "monkey",
  "password",
  "qwerty",
  "qwertyuiop",
  "secret",
  "sunshine",
  "welcome",
  "wedding",
]);

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "!": "i",
};

/** Lowercase, undo the obvious substitutions, and keep letters only. */
function toLetters(value: string): string {
  let result = "";
  for (const character of value.toLowerCase()) {
    const mapped = LEET[character] ?? character;
    if (mapped >= "a" && mapped <= "z") {
      result += mapped;
    }
  }
  return result;
}

/** Lowercase and keep letters, without the substitutions. */
function plainLetters(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * The padding comes off before the word is read, and the word is read two ways.
 *
 * Both passes are needed and neither is enough. `password123` survives the substitution map,
 * because the map turns its `1` and `3` into letters and leaves `passwordie`. `Passw0rd123!` needs
 * the map, because its zero is inside the word. Stripping the leading and trailing non-letters
 * first is what lets one rule catch both.
 */
function isWeakBase(password: string): boolean {
  const core = password.replace(/^[^a-zA-Z]+/, "").replace(/[^a-zA-Z]+$/, "");

  if (plainLetters(password).length === 0) {
    // Digits or symbols only. `1234567890` and `!!!!!!!!!!!!` both land here.
    return true;
  }

  return [plainLetters(password), plainLetters(core), toLetters(password), toLetters(core)].some(
    (form) => WEAK_BASES.has(form),
  );
}

/** Name tokens and the email local part, at four characters or more so "ana" does not ban a word. */
function personalTokens(context: PasswordContext): string[] {
  const tokens: string[] = [];

  const localPart = context.email?.split("@")[0] ?? "";
  for (const token of localPart.split(/[^a-zA-Z]+/)) {
    if (token.length >= 4) tokens.push(token.toLowerCase());
  }

  for (const token of (context.fullName ?? "").split(/\s+/)) {
    const letters = toLetters(token);
    if (letters.length >= 4) tokens.push(letters);
  }

  return tokens;
}

function containsPersonalInformation(password: string, context: PasswordContext): boolean {
  const letters = toLetters(password);
  return personalTokens(context).some((token) => letters.includes(token));
}

/** A run of four identical characters, or five stepping by one in either direction. */
function hasPredictableRun(password: string): boolean {
  let identical = 1;
  let ascending = 1;
  let descending = 1;

  for (let index = 1; index < password.length; index += 1) {
    const step = password.charCodeAt(index) - password.charCodeAt(index - 1);
    identical = step === 0 ? identical + 1 : 1;
    ascending = step === 1 ? ascending + 1 : 1;
    descending = step === -1 ? descending + 1 : 1;

    if (identical >= 4 || ascending >= 5 || descending >= 5) {
      return true;
    }
  }

  return false;
}

function characterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/\d/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1;
  return classes;
}

const STRENGTH_BY_SCORE: PasswordStrength[] = ["weak", "weak", "fair", "good", "strong"];

export function assessPassword(
  password: string,
  context: PasswordContext = {},
): PasswordAssessment {
  const distinct = new Set(password).size;
  const longEnough =
    password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
  const common = isWeakBase(password) || distinct < 5;
  const personal = password.length > 0 && containsPersonalInformation(password, context);

  const requirements: PasswordRequirement[] = [
    {
      id: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: longEnough,
    },
    { id: "notCommon", label: "Not a predictable password", met: password.length > 0 && !common },
    {
      id: "notPersonal",
      label: "Not your name or email address",
      met: password.length > 0 && !personal,
    },
  ];

  let problem: string | undefined;
  if (password.length === 0) {
    problem = "Create a password.";
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    problem = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    problem = `Use no more than ${PASSWORD_MAX_LENGTH} characters.`;
  } else if (common) {
    problem = "That password is too easy to guess. Try a phrase only you would write.";
  } else if (personal) {
    problem = "Do not use your name or email address in your password.";
  }

  if (problem) {
    return { acceptable: false, problem, requirements, score: 0, strength: "weak", tip: undefined };
  }

  let score = 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (characterClasses(password) >= 3) score += 1;
  if (hasPredictableRun(password)) score -= 1;
  score = Math.min(4, Math.max(1, score));

  const tip =
    score >= 4
      ? undefined
      : password.length < 16
        ? "A longer phrase of a few unrelated words is stronger than a short complicated one."
        : "Mixing in a capital, a number, or a symbol would make this stronger.";

  return {
    acceptable: true,
    problem: undefined,
    requirements,
    score,
    strength: STRENGTH_BY_SCORE[score] ?? "fair",
    tip,
  };
}

const GENERATOR_WORDS = [
  "amber",
  "anchor",
  "basil",
  "beacon",
  "candle",
  "cedar",
  "cobalt",
  "coral",
  "cotton",
  "dahlia",
  "ember",
  "fennel",
  "garnet",
  "ginger",
  "harbor",
  "indigo",
  "ivory",
  "jasmine",
  "juniper",
  "lantern",
  "linen",
  "maple",
  "marble",
  "meadow",
  "myrtle",
  "olive",
  "opal",
  "orchid",
  "pebble",
  "pepper",
  "quartz",
  "ribbon",
  "saffron",
  "sage",
  "silver",
  "sorrel",
  "sparrow",
  "sunset",
  "thistle",
  "topaz",
  "velvet",
  "walnut",
  "willow",
  "wren",
];

const GENERATOR_SEPARATORS = "-_.";

/**
 * Four unrelated words, one of them capitalized, a separator, and a four-digit number — drawn from
 * `crypto.getRandomValues`, and short enough to read off a screen and type on a phone.
 *
 * **About 39 bits**: 44⁴ words × 4 positions for the capital × 3 separators × 9000 numbers. That is
 * far short of what an offline crack of a stolen hash would need, and comfortably beyond what an
 * online attacker gets through Supabase's own rate limits with Turnstile in front of them, which is
 * the attack this endpoint actually faces. Stated rather than rounded up: a larger word list is
 * what would buy more, and shipping one to every auth page costs bundle a mid-range phone pays for.
 *
 * Browsers already offer a generated password on `autocomplete="new-password"` fields, and a
 * creator using a password manager should take that one. This is for the creator who has none and
 * would otherwise reuse a password they already use somewhere else.
 */
export function generatePassword(): string {
  const values = new Uint32Array(7);
  crypto.getRandomValues(values);

  const separator = GENERATOR_SEPARATORS[(values[4] ?? 0) % GENERATOR_SEPARATORS.length] ?? "-";
  const capitalIndex = (values[5] ?? 0) % 4;
  const words = Array.from({ length: 4 }, (_, index) => {
    const word = GENERATOR_WORDS[(values[index] ?? 0) % GENERATOR_WORDS.length] ?? "cedar";
    return index === capitalIndex ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}` : word;
  });
  const number = 1000 + ((values[6] ?? 0) % 9000);

  return `${words.join(separator)}${separator}${number}`;
}
