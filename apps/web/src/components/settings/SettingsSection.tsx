import type { ReactNode } from "react";

import { AlertCircle, Check } from "../Icons";
import styles from "./Settings.module.css";

interface SettingsSectionProps {
  children: ReactNode;
  description: string;
  title: string;
  tone?: "danger" | undefined;
}

interface SettingsStatusProps {
  message: string;
  tone: "danger" | "success";
}

/**
 * One account group. A heading, one sentence on what it does, then the control.
 *
 * These are sections rather than tabs on purpose: six account groups are not peer views of a
 * single object, and a phone would have to scroll a tab strip to reach the last of them.
 */
export function SettingsSection({ children, description, title, tone }: SettingsSectionProps) {
  return (
    <section className={styles.section} data-tone={tone}>
      <h2 className={styles.sectionHeading}>{title}</h2>
      <p className={styles.sectionDescription}>{description}</p>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

/**
 * The outcome of one panel's last submission, announced politely so a screen reader hears it
 * without losing the field the creator is in.
 *
 * The mark is the point: `--danger` and `--accent` are both warm and both dark enough to pass
 * contrast, which makes them poor at telling a success from a failure on their own.
 */
export function SettingsStatus({ message, tone }: SettingsStatusProps) {
  return (
    <p className={styles.status} data-tone={tone} role="status">
      {tone === "success" ? <Check /> : <AlertCircle />}
      <span>{message}</span>
    </p>
  );
}
