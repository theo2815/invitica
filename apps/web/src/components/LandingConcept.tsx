import type { TemplateCatalogEntry } from "@invitica/template-kit";
import Image from "next/image";
import Link from "next/link";

import { BrandMark } from "./BrandMark";
import { ArrowRight, Check } from "./Icons";
import styles from "./LandingConcept.module.css";
import { LandingNavigation } from "./LandingNavigation";

interface LandingConceptProps {
  authenticated?: boolean;
  /** When true (production beta), account creation is closed, so the CTA points to sign-in instead. */
  betaLocked?: boolean;
  templates: readonly TemplateCatalogEntry[];
}

const templateStills: Readonly<Record<string, string>> = {
  "garden-promise": "/landing/templates/garden-promise.jpg",
  "golden-hour": "/landing/templates/golden-hour.jpg",
  "sunday-joy": "/landing/templates/sunday-joy.jpg",
  "little-blessings": "/landing/templates/little-blessings.jpg",
};

const featuredPreviewHref = "/templates/little-blessings/preview";

export function LandingConcept({
  authenticated = false,
  betaLocked = false,
  templates,
}: LandingConceptProps) {
  return (
    <div className={styles.page}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <LandingNavigation authenticated={authenticated} betaLocked={betaLocked} />

      <main id="main-content">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Invitation websites, made in the Philippines</p>
            <h1>An invitation they will remember opening.</h1>
            <p className={styles.heroDescription}>
              Bring your story, event details, and guest response into one considered, mobile-first
              experience.
            </p>
            <div className={styles.heroActions}>
              <Link
                className={styles.primaryButton}
                href={featuredPreviewHref}
                rel="noreferrer"
                target="_blank"
              >
                Preview a real invitation <ArrowRight />
              </Link>
              <a className={styles.textLink} href="#templates">
                Explore four designs
              </a>
            </div>
            <ul aria-label="Invitica highlights" className={styles.heroProof}>
              <li>
                <Check /> No app for guests
              </li>
              <li>
                <Check /> Designed for phones
              </li>
              <li>
                <Check /> One shareable link
              </li>
            </ul>
          </div>

          <Link
            aria-label="Open the Little Blessings invitation preview in a new tab"
            className={styles.heroPreview}
            href={featuredPreviewHref}
            rel="noreferrer"
            target="_blank"
          >
            <span className={styles.previewKicker}>A real guest view</span>
            <span className={styles.heroImageFrame}>
              <Image
                alt="A blush pink Little Blessings invitation closed with a ribbon and personalised guest card"
                height="1280"
                preload
                sizes="(max-width: 720px) 78vw, 22rem"
                src="/landing/templates/little-blessings.jpg"
                width="720"
              />
            </span>
            <span className={styles.previewCaption}>
              <span>
                <small>Little Blessings</small>
                Baptism
              </span>
              <span className={styles.previewAction}>
                Open preview <ArrowRight />
              </span>
            </span>
          </Link>
        </section>

        <section className={styles.templateSection} id="templates">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionLabel}>The invitation collection</p>
            <h2>Begin with the feeling.</h2>
            <p>
              Each image below is captured from the same renderer guests see. Open any design to
              experience the complete invitation.
            </p>
          </div>

          <div className={styles.templateGrid}>
            {templates.map((template) => {
              const still = templateStills[template.id];
              if (!still) {
                return null;
              }

              return (
                <article className={styles.templateCard} key={template.id}>
                  <Link
                    aria-label={`${template.name} preview invitation (opens in a new tab)`}
                    className={styles.templateLink}
                    href={`/templates/${template.id}/preview`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className={styles.templateImageFrame}>
                      <Image
                        alt=""
                        height="1280"
                        loading="lazy"
                        sizes="(max-width: 720px) calc(50vw - 1rem), (max-width: 980px) calc(50vw - 2rem), 25vw"
                        src={still}
                        width="720"
                      />
                    </span>
                    <span className={styles.templateDetails}>
                      <span>
                        <small>{template.occasion}</small>
                        <strong>{template.name}</strong>
                      </span>
                      <span className={styles.templateAction}>
                        Preview <ArrowRight />
                      </span>
                    </span>
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.processSection} id="how-it-works">
          <div className={styles.processIntro}>
            <p className={styles.sectionLabel}>From first look to shared link</p>
            <h2>A simple path to something personal.</h2>
          </div>

          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNumber}>01</span>
              <div>
                <h3>Choose a direction</h3>
                <p>Open the full previews and find the design that feels right for your event.</p>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber}>02</span>
              <div>
                <h3>Make it yours</h3>
                <p>
                  Personalise the names, story, schedule, place, photographs, and guest details.
                </p>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber}>03</span>
              <div>
                <h3>Publish and share</h3>
                <p>Send one invitation link that guests can open and respond to without an app.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className={styles.detailSection} id="details">
          <div className={styles.detailStatement}>
            <p className={styles.sectionLabel}>One thoughtful place</p>
            <h2>More than a date and a pin on the map.</h2>
          </div>

          <div className={styles.detailList}>
            <article>
              <span>Story</span>
              <h3>Set the tone before the celebration begins.</h3>
              <p>Pair considered typography with your message and photographs.</p>
            </article>
            <article>
              <span>Details</span>
              <h3>Make the day easy to understand.</h3>
              <p>Keep the schedule, venue, map, and important notes together.</p>
            </article>
            <article>
              <span>Response</span>
              <h3>Give guests a clear next step.</h3>
              <p>Let invited guests respond from the invitation without creating an account.</p>
            </article>
          </div>
        </section>

        <section className={styles.faq} id="faq">
          <div className={styles.faqHeading}>
            <p className={styles.sectionLabel}>Good to know</p>
            <h2>Questions before you open one?</h2>
          </div>
          <div className={styles.accordion}>
            <details>
              <summary>Do guests need an Invitica account?</summary>
              <p>No. Guests can open the invitation and respond from their invitation link.</p>
            </details>
            <details>
              <summary>Can I create and edit on my phone?</summary>
              <p>Yes. The creator flow is designed for both phone and desktop use.</p>
            </details>
            <details>
              <summary>Can I update an invitation after publishing?</summary>
              <p>
                Yes. You can edit and publish an updated version while keeping the active invitation
                link.
              </p>
            </details>
            <details>
              <summary>Are these template images mockups?</summary>
              <p>
                No. They are generated from Invitica's shared invitation renderer and show the
                closed invitation guests receive.
              </p>
            </details>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div>
            <p className={styles.sectionLabel}>See it as a guest</p>
            <h2>The best place to begin is with the invitation itself.</h2>
          </div>
          <Link
            className={styles.inverseButton}
            href={featuredPreviewHref}
            rel="noreferrer"
            target="_blank"
          >
            Preview a real invitation <ArrowRight />
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <BrandMark />
          <p>Premium digital invitations for meaningful gatherings.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#templates">Templates</a>
          <a href="#how-it-works">How it works</a>
          <a href="#details">What is included</a>
          <a href="#faq">FAQ</a>
        </nav>
        <p className={styles.copyright}>© 2026 Invitica · Made in the Philippines</p>
      </footer>
    </div>
  );
}
