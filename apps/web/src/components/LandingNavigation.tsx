"use client";

import Link from "next/link";
import { useState } from "react";

import { BrandMark } from "./BrandMark";
import styles from "./LandingConcept.module.css";

interface LandingNavigationProps {
  authenticated: boolean;
}

export function LandingNavigation({ authenticated }: LandingNavigationProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <>
      <header className={styles.header}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>

        <nav aria-label="Main navigation" className={styles.desktopNav}>
          <a href="#templates">Templates</a>
          <a href="#how-it-works">How it works</a>
          <a href="#details">What is included</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className={styles.headerActions}>
          {authenticated ? (
            <Link className={styles.headerCta} href="/dashboard">
              Home
            </Link>
          ) : (
            <>
              <Link className={styles.loginLink} href="/login">
                Log in
              </Link>
              <Link className={styles.headerCta} href="/register">
                Create account
              </Link>
            </>
          )}
        </div>

        <button
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className={styles.menuButton}
          onClick={() => setMenuOpen((current) => !current)}
          type="button"
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </header>

      <nav
        aria-label="Mobile navigation"
        className={styles.mobileNav}
        data-open={menuOpen}
        id="mobile-navigation"
      >
        <Link href="#templates" onClick={closeMenu}>
          Templates
        </Link>
        <Link href="#how-it-works" onClick={closeMenu}>
          How it works
        </Link>
        <Link href="#details" onClick={closeMenu}>
          What is included
        </Link>
        <Link href="#faq" onClick={closeMenu}>
          FAQ
        </Link>
        {authenticated ? (
          <Link className={styles.mobileCta} href="/dashboard" onClick={closeMenu}>
            Home
          </Link>
        ) : (
          <>
            <Link href="/login" onClick={closeMenu}>
              Log in
            </Link>
            <Link className={styles.mobileCta} href="/register" onClick={closeMenu}>
              Create account
            </Link>
          </>
        )}
      </nav>
    </>
  );
}
