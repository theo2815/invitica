"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { CAPTCHA_TOKEN_FIELD, turnstileSiteKey } from "../../server/auth/turnstile";
import { useTheme } from "../ThemeContext";
import styles from "./AuthPage.module.css";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      sitekey: string;
      theme: "dark" | "light";
    },
  ) => string;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * One shared load for however many widgets the page mounts. The verify page has two forms and one
 * script; a second `<script>` for the second form would re-execute Cloudflare's bundle.
 */
let scriptPromise: Promise<TurnstileApi | null> | undefined;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = SCRIPT_SRC;
    // A blocked or failed script must not leave the form unusable, so resolve null and let the
    // status line say the check could not load rather than hanging on a token that never arrives.
    script.onerror = () => resolve(null);
    script.onload = () => resolve(window.turnstile ?? null);
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export type TurnstileStatus = "disabled" | "error" | "loading" | "ready" | "solved";

export interface TurnstileInstance {
  containerRef: RefObject<HTMLDivElement | null>;
  /** False when no site key is configured, so validation must not demand a token. */
  required: boolean;
  reset: () => void;
  status: TurnstileStatus;
  token: string;
}

/**
 * Renders one Turnstile widget and hands its token to whatever forms need it.
 *
 * The verify page has two forms — verify the code and send another — that both reach a
 * captcha-protected Supabase endpoint. A Turnstile token is single-use, so they share one widget
 * and reset it after each submission rather than mounting two challenges on one page.
 */
export function useTurnstile(): TurnstileInstance {
  const siteKey = turnstileSiteKey();
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<TurnstileStatus>(siteKey ? "loading" : "disabled");
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!siteKey) {
      return;
    }

    let cancelled = false;

    loadTurnstile().then((turnstile) => {
      const container = containerRef.current;
      if (cancelled || !container) {
        return;
      }

      if (!turnstile) {
        setStatus("error");
        return;
      }

      widgetIdRef.current = turnstile.render(container, {
        callback: (value) => {
          setToken(value);
          setStatus("solved");
        },
        "error-callback": () => {
          setToken("");
          setStatus("error");
        },
        "expired-callback": () => {
          setToken("");
          setStatus("ready");
        },
        sitekey: siteKey,
        theme,
      });
      setStatus("ready");
    });

    return () => {
      cancelled = true;
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
      widgetIdRef.current = null;
    };
    // The widget is rendered with the theme it was created under. Invitica's theme changes only
    // through a Settings save that reloads the page, so this never re-runs in practice.
  }, [siteKey, theme]);

  const reset = useCallback(() => {
    const widgetId = widgetIdRef.current;
    if (!widgetId || !window.turnstile) {
      return;
    }
    setToken("");
    setStatus("ready");
    window.turnstile.reset(widgetId);
  }, []);

  return { containerRef, required: siteKey !== undefined, reset, status, token };
}

const statusMessages: Record<TurnstileStatus, string | null> = {
  disabled: null,
  error: "The verification could not load. Check your connection and reload the page.",
  loading: "Loading the verification check…",
  ready: null,
  solved: null,
};

export const CAPTCHA_FIELD_ID = "captcha-field";

/**
 * The widget, its status line, and the hidden input carrying the token.
 *
 * Renders nothing at all without a site key, so a local `pnpm dev` and any environment where the
 * Supabase toggle is off behave exactly as they did before this existed.
 */
export function TurnstileField({
  error,
  instance,
}: {
  error?: string | undefined;
  instance: TurnstileInstance;
}) {
  if (!instance.required) {
    return null;
  }

  const message = statusMessages[instance.status];

  return (
    // Focusable so `focusFirstError` can move here when the challenge is the only thing missing.
    // The widget itself is a Cloudflare iframe and is not ours to focus.
    <div className={styles.captchaField} id={CAPTCHA_FIELD_ID} tabIndex={-1}>
      <div className={styles.captchaWidget} ref={instance.containerRef} />
      <CaptchaTokenInput instance={instance} />
      {message ? <p className={styles.fieldHint}>{message}</p> : null}
      {error ? (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The token alone, for a second form sharing one page's widget. */
export function CaptchaTokenInput({ instance }: { instance: TurnstileInstance }) {
  if (!instance.required) {
    return null;
  }

  return <input name={CAPTCHA_TOKEN_FIELD} type="hidden" value={instance.token} />;
}
