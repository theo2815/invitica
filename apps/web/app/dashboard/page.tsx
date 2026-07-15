import Link from "next/link";

import { BrandMark } from "../../src/components/BrandMark";
import { signOut } from "../../src/server/auth/actions";
import { ensurePersonalWorkspace } from "../../src/server/auth/session";
import styles from "./Dashboard.module.css";

export default async function DashboardPage() {
  const { error, user } = await ensurePersonalWorkspace();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </header>

      <section className={styles.content}>
        <p className={styles.eyebrow}>Creator workspace</p>
        <h1>Welcome to Invitica.</h1>
        {error ? (
          <div className={styles.error} role="alert">
            <h2>Your workspace needs attention</h2>
            <p>
              Your account is secure, but the personal workspace could not be prepared. Confirm that
              the Invitica database migration has been applied, then reload this page.
            </p>
          </div>
        ) : (
          <div className={styles.workspace}>
            <p>Personal workspace</p>
            <h2>Your invitation workspace is ready.</h2>
            <p>
              Signed in as <strong>{user.email}</strong>. Invitation creation remains part of the
              next vertical slice.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
