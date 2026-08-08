"use client";

import { useId, useOptimistic, useTransition } from "react";

import { setThemePreference } from "../../server/account/actions";
import type { ThemePreference } from "../../server/account/theme";
import styles from "./Settings.module.css";

const OPTIONS: { description: string; label: string; value: ThemePreference }[] = [
  { description: "The cream paper Invitica ships with", label: "Light", value: "light" },
  { description: "The same paper and wine, after dark", label: "Dark", value: "dark" },
];

/**
 * Light or Dark, and nothing else.
 *
 * There is deliberately no *System*: a device set to dark at the OS level is not a statement about
 * this product, and a creator who has never opened this panel should meet the same cream paper on
 * every machine they sign in from. The palette moves only from here.
 *
 * Radio inputs rather than the button group the Invi mode switch uses: this is one mutually
 * exclusive value that persists, not a view mode, and radios carry arrow-key navigation and the
 * correct semantics without any of it being written here.
 *
 * The choice is optimistic because the round trip re-renders the whole tree from the root layout,
 * and the control must not appear to snap back while that happens.
 */
export function ThemePanel({ preference }: { preference: ThemePreference }) {
  const [pending, startTransition] = useTransition();
  const [selected, select] = useOptimistic(preference);
  const name = useId();

  function choose(value: ThemePreference) {
    startTransition(async () => {
      select(value);
      await setThemePreference(value);
    });
  }

  return (
    <fieldset className={styles.themeGroup} disabled={pending}>
      <legend className={styles.visuallyHidden}>Theme</legend>
      {OPTIONS.map((option) => (
        <label
          className={styles.themeOption}
          data-selected={selected === option.value}
          key={option.value}
        >
          <input
            checked={selected === option.value}
            name={name}
            onChange={() => choose(option.value)}
            type="radio"
            value={option.value}
          />
          <span className={styles.themeLabel}>{option.label}</span>
          <span className={styles.themeDescription}>{option.description}</span>
        </label>
      ))}
    </fieldset>
  );
}
