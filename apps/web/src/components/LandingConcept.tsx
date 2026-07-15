"use client";

import Link from "next/link";
import { useState } from "react";

import { BrandMark } from "./BrandMark";
import { ArrowRight, ArrowUpRight, Check } from "./Icons";
import styles from "./LandingConcept.module.css";

const templates = [
  {
    occasion: "Wedding",
    name: "Garden Promise",
    previewTitle: "Mara & Joaquin",
    date: "January 17, 2027 · Manila",
    tier: "Free",
  },
  {
    occasion: "Debut",
    name: "Golden Hour",
    previewTitle: "Sam turns XVIII",
    date: "August 14, 2027 · Quezon City",
    tier: "Premium",
  },
  {
    occasion: "Birthday",
    name: "Sunday Joy",
    previewTitle: "Lia is seven!",
    date: "May 9, 2027 · Pasig",
    tier: "Free",
  },
] as const;

export function LandingConcept() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const activeTemplate = templates[selectedTemplate] ?? templates[0];

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className={styles.page}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className={styles.header}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>

        <nav aria-label="Main navigation" className={styles.desktopNav}>
          <a href="#templates">Templates</a>
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className={styles.headerActions}>
          <Link className={styles.loginLink} href="/login">
            Log in
          </Link>
          <Link className={styles.headerCta} href="/register">
            Create account
          </Link>
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
        <Link href="#features" onClick={closeMenu}>
          Features
        </Link>
        <Link href="#pricing" onClick={closeMenu}>
          Pricing
        </Link>
        <Link href="#faq" onClick={closeMenu}>
          FAQ
        </Link>
        <Link href="/login" onClick={closeMenu}>
          Log in
        </Link>
        <Link className={styles.mobileCta} href="/register" onClick={closeMenu}>
          Create account
        </Link>
      </nav>

      <main id="main-content">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Digital invitations for meaningful celebrations</p>
            <h1>Make your invitation feel as special as the event.</h1>
            <p className={styles.heroDescription}>
              Create a beautiful invitation website, share it with one link, and collect guest
              responses—all from your phone or computer.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#templates">
                Browse templates <ArrowRight />
              </a>
              <a className={styles.secondaryButton} href="#how-it-works">
                See how it works
              </a>
            </div>
            <p className={styles.heroNote}>Start for free · Guests do not need an account</p>
          </div>

          <div className={styles.previewPanel} id="sample-invitation">
            <div className={styles.previewTopline}>
              <span>Interactive invitation preview</span>
              <span>{activeTemplate.occasion}</span>
            </div>
            <button
              aria-expanded={invitationOpen}
              aria-label={invitationOpen ? "Close sample invitation" : "Open sample invitation"}
              className={styles.envelopeButton}
              data-open={invitationOpen}
              onClick={() => setInvitationOpen((current) => !current)}
              type="button"
            >
              <span className={styles.envelopeBack} />
              <span className={styles.envelopeLetter}>
                <small>You are invited</small>
                <strong>{activeTemplate.previewTitle}</strong>
                <span>{activeTemplate.date}</span>
              </span>
              <span className={styles.envelopeFront} />
              <span className={styles.envelopeFlap} />
              <span className={styles.envelopeSeal}>I</span>
            </button>
            <p aria-live="polite" className={styles.previewHint}>
              {invitationOpen
                ? "Invitation opened · Tap again to close"
                : "Tap the envelope to open"}
            </p>
          </div>
        </section>

        <section aria-label="Invitica benefits" className={styles.quickBenefits}>
          <p>
            <Check /> Easy to create on mobile
          </p>
          <p>
            <Check /> One link for every guest
          </p>
          <p>
            <Check /> RSVP and event details together
          </p>
        </section>

        <section className={styles.section} id="how-it-works">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionLabel}>How it works</p>
            <h2>From idea to invitation in three clear steps.</h2>
            <p>
              Invitica keeps the process simple while giving your event a polished guest experience.
            </p>
          </div>

          <ol className={styles.steps}>
            <li>
              <span>1</span>
              <h3>Choose a template</h3>
              <p>Browse designs created for weddings, debuts, birthdays, and other milestones.</p>
            </li>
            <li>
              <span>2</span>
              <h3>Add your details</h3>
              <p>Update your story, schedule, venue, photos, colors, and optional music.</p>
            </li>
            <li>
              <span>3</span>
              <h3>Publish and share</h3>
              <p>Send one private link and collect guest responses without requiring accounts.</p>
            </li>
          </ol>
        </section>

        <section className={styles.templateSection} id="templates">
          <div className={styles.templateHeading}>
            <div>
              <p className={styles.sectionLabel}>Popular templates</p>
              <h2>Start with a design made for the occasion.</h2>
            </div>
            <p>Preview a template below. You can change your choice before publishing.</p>
          </div>

          <div className={styles.templateGrid}>
            {templates.map((template, index) => (
              <article
                className={styles.templateCard}
                data-selected={selectedTemplate === index}
                key={template.name}
              >
                <div aria-hidden="true" className={styles.templateArtwork} data-index={index}>
                  <small>{template.occasion}</small>
                  <strong>{template.previewTitle}</strong>
                  <span>{template.date}</span>
                </div>
                <div className={styles.templateDetails}>
                  <div>
                    <p>
                      {template.occasion} · {template.tier}
                    </p>
                    <h3>{template.name}</h3>
                  </div>
                  <button
                    aria-pressed={selectedTemplate === index}
                    onClick={() => {
                      setSelectedTemplate(index);
                      setInvitationOpen(true);
                    }}
                    type="button"
                  >
                    {selectedTemplate === index ? "Selected" : "Preview"}
                  </button>
                </div>
              </article>
            ))}
          </div>

          <a className={styles.inlineLink} href="#sample-invitation">
            View the selected invitation preview <ArrowUpRight />
          </a>
        </section>

        <section className={styles.featureSection} id="features">
          <div className={styles.featureIntro}>
            <p className={styles.sectionLabel}>A better experience for everyone</p>
            <h2>Simple for you. Thoughtful for your guests.</h2>
          </div>

          <div className={styles.featureColumns}>
            <article>
              <p>For creators</p>
              <h3>Everything important stays easy to manage.</h3>
              <ul>
                <li>
                  <Check /> Edit from phone or computer
                </li>
                <li>
                  <Check /> Preview every screen size
                </li>
                <li>
                  <Check /> Keep event details and responses together
                </li>
              </ul>
            </article>
            <article>
              <p>For guests</p>
              <h3>Open, understand, and respond without friction.</h3>
              <ul>
                <li>
                  <Check /> No account or app download
                </li>
                <li>
                  <Check /> Clear schedule, venue, and map
                </li>
                <li>
                  <Check /> Accessible motion and music controls
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section className={styles.pricing} id="pricing">
          <div>
            <p className={styles.sectionLabel}>Simple publishing</p>
            <h2>Start designing for free.</h2>
            <p>
              Explore templates and build your invitation before paying. Choose a free design or
              purchase one premium publication when you are ready to share.
            </p>
          </div>
          <a className={styles.primaryButton} href="#templates">
            Browse templates <ArrowRight />
          </a>
        </section>

        <section className={styles.faq} id="faq">
          <div className={styles.faqHeading}>
            <p className={styles.sectionLabel}>Frequently asked questions</p>
            <h2>What would you like to know?</h2>
          </div>
          <div className={styles.accordion}>
            <details>
              <summary>Do guests need an Invitica account?</summary>
              <p>No. Guests can open the invitation and respond from the shared link.</p>
            </details>
            <details>
              <summary>Can I create and edit on my phone?</summary>
              <p>Yes. Invitica is designed for complete mobile and desktop creator workflows.</p>
            </details>
            <details>
              <summary>Can I change the invitation after publishing?</summary>
              <p>
                You will be able to publish an updated version without changing the link you already
                shared.
              </p>
            </details>
            <details>
              <summary>Can guests turn off music or animation?</summary>
              <p>
                Yes. Music waits for guest interaction, and visible controls and reduced-motion
                behavior are built in.
              </p>
            </details>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div>
            <p className={styles.sectionLabel}>Create your first invitation</p>
            <h2>Give your guests a beautiful place to begin.</h2>
          </div>
          <a className={styles.primaryButton} href="#templates">
            Browse templates <ArrowRight />
          </a>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <BrandMark />
          <p>Premium digital invitations for meaningful gatherings.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#templates">Templates</a>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <p>© 2026 Invitica · Made in the Philippines</p>
      </footer>
    </div>
  );
}
