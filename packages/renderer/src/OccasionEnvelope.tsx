"use client";

import type { ReactElement } from "react";

import type { OccasionTemplateVariant } from "./OccasionTemplateRenderer.js";

/**
 * The closed-envelope art direction for the three occasion families.
 *
 * `RibbonEnvelopeOpening` owns the layers, the lifecycle, the scroll gate, and the focus handoff.
 * This module owns only what those layers look like and how they move, and every rule below is
 * scoped under `.ot-root[data-template="…"]` so Little Blessings, Garden Promise v1, and the
 * warm-editorial landing sample keep the envelope they already ship.
 *
 * Each family is a different paper object, per the 2026-07-24 uniqueness decision:
 *
 * - Garden Promise — a deep-flap baronial envelope, cross-tied in narrow sage grosgrain, closed
 *   with a pressed-wax seal carrying the same sprig the hero mounts.
 * - Golden Hour — a portrait card sleeve with a stepped deco lip. One wide brass band, no bow, held
 *   by a slide that carries the numeral. The card rises out of the sleeve rather than a flap opening.
 * - Sunday Joy — a square craft envelope with a rounded flap and cut-paper edges, tied off-centre
 *   with an oversized floppy bow.
 */

function EnvelopeAddress({
  recipient,
  variant,
}: {
  recipient: string;
  variant: OccasionTemplateVariant;
}) {
  // Golden Hour is a sleeve, not a pocket envelope: the card's own edge stands above the lip and
  // carries the name, so a second address block on the sleeve would print it twice.
  if (variant === "golden-hour") return null;

  return (
    <span className="oe-address">
      <i />
      <strong>{recipient}</strong>
    </span>
  );
}

/**
 * The wax seal that holds Garden Promise's flap shut. It is mounted on the flap rather than inside
 * the closure so it stays legible beside the bow and turns away with the paper it seals.
 */
function GardenPromiseSeal() {
  return (
    <svg aria-hidden="true" className="oe-seal" focusable="false" viewBox="0 0 100 100">
      <path className="oe-seal-drip" d="M24 68c-8 6-11 17-4 22s18 1 21-9Z" />
      <circle className="oe-seal-body" cx="50" cy="50" r="39" />
      <circle className="oe-seal-rim" cx="50" cy="50" r="30" />
      <path
        className="oe-seal-sprig"
        d="M50 74V26M50 62c8-2 17-9 22-19-12 0-20 8-22 19Zm0-16c-8-2-17-9-22-19 12 0 20 8 22 19Z"
      />
      <ellipse className="oe-seal-bud" cx="50" cy="21" rx="4" ry="7" />
    </svg>
  );
}

/**
 * Sage grosgrain tied below the seal. Loops and tails are separate paths so the knot can cinch, the
 * loops can fall open asymmetrically, and the tails can follow with lag — the four default CSS
 * boxes cannot describe a curve that reads as cloth at 320 px.
 */
function GardenPromiseClosure() {
  return (
    <svg aria-hidden="true" className="oe-knot oe-gp-knot" focusable="false" viewBox="0 0 200 200">
      <path className="oe-loop oe-loop-left" d="M100 88C66 58 14 66 11 95s55 24 89 6Z" />
      <path
        className="oe-loop oe-loop-left oe-fold"
        d="M100 90C79 79 55 76 36 82c21-2 45 3 64 13Z"
      />
      <path className="oe-loop oe-loop-right" d="M100 88c34-30 86-22 89 7s-55 24-89 6Z" />
      <path
        className="oe-loop oe-loop-right oe-fold"
        d="M100 90c21-11 45-14 64-8-21-2-45 3-64 13Z"
      />
      <path
        className="oe-tail oe-tail-left"
        d="M95 100c-6 32-17 60-38 84l-11 13 3-22-17 6c20-27 38-53 49-85Z"
      />
      <path
        className="oe-tail oe-tail-right"
        d="M105 100c6 32 17 60 38 84l11 13-3-22 17 6c-20-27-38-53-49-85Z"
      />
      <rect className="oe-cinch" height="30" rx="7" width="22" x="89" y="81" />
    </svg>
  );
}

/**
 * A brass slide, not a bow. Deco closures are rectilinear, so plain elements are cheaper than SVG
 * and the numeral stays real text at full opacity instead of a watermark a band can bisect.
 */
function GoldenHourClosure() {
  return (
    <span aria-hidden="true" className="oe-knot oe-gh-knot">
      <b>XVIII</b>
    </span>
  );
}

/** Wide floppy loops and wavy notched tails, tied off-centre like a present a child wrapped. */
function SundayJoyClosure() {
  return (
    <svg aria-hidden="true" className="oe-knot oe-sj-knot" focusable="false" viewBox="0 0 200 200">
      <path className="oe-loop oe-loop-left" d="M102 86C70 44 12 48 6 90c-6 41 56 37 96 14Z" />
      <path
        className="oe-loop oe-loop-left oe-fold"
        d="M100 92C76 74 46 68 24 76c24-3 51 4 76 20Z"
      />
      <path className="oe-loop oe-loop-right" d="M98 86c32-42 90-38 96 4 6 41-56 37-96 14Z" />
      <path
        className="oe-loop oe-loop-right oe-fold"
        d="M100 92c24-18 54-24 76-16-24-3-51 4-76 20Z"
      />
      <path
        className="oe-tail oe-tail-left"
        d="M94 106c-14 22-5 41-26 58l-14 17 3-22-18 9c21-19 11-40 33-65Z"
      />
      <path
        className="oe-tail oe-tail-right"
        d="M106 106c14 22 5 41 26 58l14 17-3-22 18 9c-21-19-11-40-33-65Z"
      />
      <rect className="oe-cinch" height="34" rx="12" width="34" x="83" y="79" />
    </svg>
  );
}

const closures: Record<OccasionTemplateVariant, () => ReactElement> = {
  "garden-promise": GardenPromiseClosure,
  "golden-hour": GoldenHourClosure,
  "sunday-joy": SundayJoyClosure,
};

export function OccasionEnvelopeClosure({ variant }: { variant: OccasionTemplateVariant }) {
  const Closure = closures[variant];
  return <Closure />;
}

/** Mounted on the flap, so it swings away with it. Only Garden Promise seals its flap. */
export function OccasionEnvelopeCoverMark({ variant }: { variant: OccasionTemplateVariant }) {
  return variant === "garden-promise" ? <GardenPromiseSeal /> : null;
}

export function OccasionEnvelopeAddress({
  recipient,
  variant,
}: {
  recipient: string;
  variant: OccasionTemplateVariant;
}) {
  return <EnvelopeAddress recipient={recipient} variant={variant} />;
}

export const occasionEnvelopeStyles = `
/* ---------------------------------------------------------------------------------------------
   Shared occasion envelope behaviour. Every rule is scoped to .ot-root, so no other family sees it.
   --------------------------------------------------------------------------------------------- */

.ot-root .ie-scene { perspective: 62rem; }

/* The scene box is barely larger than the envelope, so decoration pinned to its edges lands under
   the envelope, which paints above it. Spreading the box past the scene puts the marks in the air
   around the object where they can be seen. */
.ot-root .ot-scene-decoration { inset: -13% -9%; }

/* A family's resting tilt, composed into every state transform rather than replaced by it. Sunday
   Joy sits at 1.5\xB0, and a bare scale() dropped that tilt on press and again on untie, so the
   envelope straightened and snapped back mid-sequence. */
.ot-root .ie-envelope { --oe-rest: rotate(0deg); }

/* Acknowledge the press before anything releases. Pointer-driven, so it fires on touch, which the
   existing hover lift never did. */
.ot-root .ie-scene:active:not([aria-disabled="true"]) .ie-envelope {
  transition-duration: 120ms;
  transform: var(--oe-rest) scale(0.985);
}
.ot-root .ie-scene:active:not([aria-disabled="true"]) .ie-ribbon-horizontal { transform: scaleX(1.012); }
.ot-root .ie-scene:active:not([aria-disabled="true"]) .ie-ribbon-vertical { transform: scaleY(1.012); }

/* The letter sits inside the envelope while closed. The shared default translates it 22% down, which
   put its lower edge past the envelope and left a pale shelf under every closed capture. */
.ot-root .ie-letter {
  inset: 7% 9% 11%;
  transform: translate3d(0, 6%, 0);
  /* Opacity is transitioned so the card dissolves into the real hero during the takeover instead of
     being cut to zero on the frame the phase changes. */
  transition:
    transform 900ms cubic-bezier(0.2, 0.75, 0.2, 1),
    opacity 420ms ease;
}

/* The lift. The card comes out and finishes fully visible in front of the envelope, which is the
   clean read Little Blessings gets by swinging its cover clear sideways. These families flip the
   flap up instead, parking it directly above the envelope, exactly where the card is rising, so the
   card has to pass in front of it.

   Stacking order alone cannot do that: the envelope is a preserve-3d context, and against a flap
   rotated in 3D the browser sorts siblings by depth rather than by z-index. That is why the flap
   surfaced through the card. The card is therefore given real forward depth. */
.ot-root .ie-root[data-opening-state="opening"] .ie-letter {
  z-index: 7;
  transform: translate3d(0, -46%, 8px);
  /* 240 ms of lag behind the flap plus 620 ms of travel fits inside the 900 ms phase. The base
     900 ms transition did not, so the card was still climbing when the takeover interrupted it and
     the guest never saw it arrive. */
  transition:
    transform 620ms cubic-bezier(0.2, 0.75, 0.2, 1) 240ms,
    opacity 420ms ease;
}

/* The takeover grows the card as it dissolves. It keeps the same depth so the flap cannot surface
   through it on the last frames. */
.ot-root .ie-root:is([data-opening-state="letter-revealing"], [data-opening-state="opened"]) .ie-letter {
  z-index: 7;
  transform: translate3d(0, -46%, 8px) scale(1.06);
}

/* The addressed pocket and the surrounding opener copy yield at the opening boundary. The card
   starts rising 240 ms later, so the recipient appears only once and the turned flap cannot split
   the kicker behind it. Closed and untying states stay unchanged. */
.ot-root .ie-root[data-opening-state='opening'] .ie-opening-kicker,
.ot-root .ie-root[data-opening-state='opening'] .ie-recipient-line,
.ot-root .ie-root[data-opening-state='opening'] .ie-opening-hint,
.ot-root .ie-root[data-opening-state='opening'] .oe-address,
.ot-root .ie-root[data-opening-state='letter-revealing'] .oe-address,
.ot-root .ie-root[data-opening-state='opened'] .oe-address {
  opacity: 0;
}

/* The skip control is the one piece of opening chrome the shared takeover never fades, because no
   family that reaches this phase used to offer one. Left opaque it sits on top of the invitation
   while the scene overlays the hero. */


/* Bands carry a woven sheen and cast a shadow onto the paper, so they read as cloth laid over a
   surface rather than tape printed on it. */
.ot-root .ie-ribbon {
  box-shadow:
    inset 0 0.08rem 0 rgb(255 255 255 / 22%),
    inset 0 -0.08rem 0 rgb(0 0 0 / 14%);
  transition:
    opacity 300ms ease 420ms,
    transform 880ms cubic-bezier(0.32, 0.06, 0.2, 1);
}
.ot-root .ie-ribbon::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    var(--oe-sheen-angle, 180deg),
    rgb(255 255 255 / 20%) 0 18%,
    transparent 34% 66%,
    rgb(0 0 0 / 12%) 82% 100%
  );
  content: "";
}
.ot-root .ie-ribbon-vertical { --oe-sheen-angle: 90deg; }

/* Centred on its own box, so a family's top offset is the point the closure sits on rather than a
   value skewed by the shared -35% nudge. Every state transform below keeps the same -50%. */
.ot-root .ie-ribbon-knot {
  width: 34%;
  height: auto;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  transition:
    opacity 260ms ease 520ms,
    transform 880ms cubic-bezier(0.32, 0.06, 0.2, 1);
}
.ot-root .oe-knot {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.ot-root .oe-loop,
.ot-root .oe-tail,
.ot-root .oe-cinch,
.ot-root .oe-gp-seal {
  transform-box: view-box;
  transition: transform 820ms cubic-bezier(0.24, 0.7, 0.26, 1), opacity 300ms ease;
}
.ot-root .oe-loop,
.ot-root .oe-tail,
.ot-root .oe-cinch { transform-origin: 50% 46%; }
/* The fold that separates a loop's near face from its far face. Without it a solid loop reads as a
   leaf; with it, the cloth turns. */
.ot-root .oe-fold {
  fill: none;
  stroke: color-mix(in srgb, var(--ie-ink) 26%, transparent);
  stroke-width: 1.6;
}

/* The addressed name. Real text inside the decorative envelope, and the recipient line under the
   scene still carries it for assistive technology. */
.ot-root .oe-address {
  position: absolute;
  right: 8%;
  bottom: 14%;
  left: 8%;
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  text-align: center;
}
.ot-root .oe-address i { width: 2.2rem; border-top: 1px solid currentcolor; opacity: 0.5; }
.ot-root .oe-address strong {
  overflow-wrap: anywhere;
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(0.72rem, 2.6cqi, 1.05rem);
  font-weight: 460;
  line-height: 1.15;
}

/* A skip control exists for all three now that the sequence runs 2.65 s. The shared stylesheet
   never defined one, so this is the only place these families can get a 44 px target. */
.ot-root .ie-skip-opening {
  min-height: 2.75rem;
  margin-top: 1.1rem;
  padding: 0.55rem 1.1rem;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 55%, transparent);
  background: transparent;
  color: var(--ie-ribbon-text);
  font: inherit;
  font-size: 0.7rem;
  font-weight: 760;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
}
.ot-root .ie-skip-opening:focus-visible {
  outline: 3px solid var(--ie-ink);
  outline-offset: 0.2rem;
}
/* The skip control is the one piece of opening chrome the shared takeover never fades, because no
   family that reaches this phase used to offer one. Left opaque it sits on top of the invitation
   while the scene overlays the hero. */
.ot-root .ie-root[data-envelope-takeover="true"][data-opening-state="letter-revealing"] .ie-skip-opening {
  opacity: 0;
  pointer-events: none;
}

/* The flap turns to show its own underside. The shared default hides the backface, so past 90\xB0 the
   flap vanished and the opened envelope read flat. */
.ot-root .ie-envelope-flap {
  backface-visibility: visible;
  transition:
    opacity 420ms ease,
    transform 900ms cubic-bezier(0.62, 0.02, 0.24, 1),
    filter 900ms ease;
}
.ot-root .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .ie-envelope-flap {
  filter: brightness(0.93);
  transform: rotateX(180deg);
}
/* Keep the turn visible long enough to read, then clear the flap while the letter rises. Leaving it
   opaque for the whole phase makes the lifted card look caught on the opened flap tip. */
.ot-root .ie-root[data-opening-state='opening'] .ie-envelope-flap {
  opacity: 0;
  transition:
    opacity 220ms ease 240ms,
    transform 900ms cubic-bezier(0.62, 0.02, 0.24, 1),
    filter 900ms ease;
}

/* Nothing fades during untying. The bands slacken and the closure releases; the release itself
   happens in the opening phase, and opacity only arrives once separation is already legible. */
.ot-root .ie-root[data-opening-state="untying"] .ie-envelope { transform: var(--oe-rest) scale(0.994); }
.ot-root .ie-root[data-opening-state="untying"] .ie-ribbon-horizontal { transform: translateY(0.09rem) scaleX(0.978); }
.ot-root .ie-root[data-opening-state="untying"] .ie-ribbon-vertical { transform: translateX(-0.07rem) scaleY(0.982); }
.ot-root .ie-root[data-opening-state="untying"] .ie-ribbon-knot { transform: translate(-50%, -50%) scale(1.04); }
.ot-root .ie-root[data-opening-state="untying"] .oe-cinch { transform: scaleY(0.7) scaleX(1.12); }
.ot-root .ie-root[data-opening-state="untying"] .oe-loop-left { transform: rotate(-15deg) translate(-11px, 9px) scale(1.1); }
.ot-root .ie-root[data-opening-state="untying"] .oe-loop-right { transform: rotate(9deg) translate(13px, 5px) scale(1.06); }
.ot-root .ie-root[data-opening-state="untying"] .oe-tail-left { transform: rotate(11deg) translate(-4px, 5px); }
.ot-root .ie-root[data-opening-state="untying"] .oe-tail-right { transform: rotate(-7deg) translate(5px, 4px); }

/* Release. Bands travel along their own axes and only start fading in the last third of the move. */
.ot-root .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .ie-ribbon-horizontal {
  opacity: 0;
  transform: translateX(-118%) rotate(-3deg);
}
.ot-root .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .ie-ribbon-vertical {
  opacity: 0;
  transform: translateY(-118%) rotate(2deg);
}
.ot-root .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .ie-ribbon-knot {
  opacity: 0;
  transform: translate(-50%, -12%) rotate(-9deg) scale(0.92);
}
.ot-root .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .oe-loop-left {
  transform: rotate(-46deg) translate(-30px, 34px) scale(0.86);
}
.ot-root .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .oe-loop-right {
  transform: rotate(38deg) translate(32px, 30px) scale(0.9);
}
.ot-root .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .oe-tail-left {
  transform: rotate(26deg) translate(-10px, 22px);
}
.ot-root .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .oe-tail-right {
  transform: rotate(-22deg) translate(11px, 20px);
}

/* ---------------------------------------------------------------------------------------------
   Garden Promise \u2014 deep-flap baronial, sage grosgrain, pressed-wax seal.
   --------------------------------------------------------------------------------------------- */

.ot-root[data-template="garden-promise"] .ie-envelope {
  width: min(88%, 25rem);
  aspect-ratio: 1.38;
}
.ot-root[data-template="garden-promise"] .ie-envelope-back {
  /* The interior. This is what shows behind the flap once it turns, so it has to be darker than
     the pocket or the open envelope reads as one flat card. */
  border-color: color-mix(in srgb, var(--ie-ribbon) 34%, transparent);
  background: color-mix(in srgb, var(--ie-ink) 13%, var(--ie-paper));
  box-shadow:
    0 0.15rem 0.45rem -0.1rem color-mix(in srgb, var(--ie-ink) 20%, transparent),
    0 1.6rem 3.2rem -0.8rem color-mix(in srgb, var(--ie-ink) 30%, transparent);
}
/* A plain rectangle. The V where the side flaps meet belongs to an envelope's back; carrying it on
   the front made no difference while the flap covered it, but once the flap lifted it became a
   keyhole that cut the rising card's text in half. */
.ot-root[data-template="garden-promise"] .ie-envelope-front {
  clip-path: none;
  border-color: color-mix(in srgb, var(--ie-ribbon) 30%, transparent);
  /* The pocket the flap closes over: a laid-paper wash and the shadow the flap casts on it. The
     old corner-to-corner seams were drawn on the front, where a real envelope has none, and read
     as one large X across the paper. */
  background:
    radial-gradient(86% 34% at 50% 0%, color-mix(in srgb, var(--ie-ink) 11%, transparent), transparent 74%),
    color-mix(in srgb, var(--ie-paper) 97%, var(--ie-background));
  color: var(--ie-ribbon-text);
}
.ot-root[data-template="garden-promise"] .ie-envelope-flap {
  clip-path: polygon(0 0, 100% 0, 50% 50%);
  border-color: color-mix(in srgb, var(--ie-ribbon) 30%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ie-ink) 5%, transparent), transparent 42%),
    color-mix(in srgb, var(--ie-paper) 99%, var(--ie-ink));
  filter: drop-shadow(0 0.14rem 0.2rem color-mix(in srgb, var(--ie-ink) 16%, transparent));
}
/* A blind-embossed rule inset from the flap edges, the way pressed stationery is finished. */
.ot-root[data-template="garden-promise"] .ie-envelope-flap::before {
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 26%, transparent);
  clip-path: polygon(3.5% 3%, 96.5% 3%, 50% 45%);
  content: "";
}
.ot-root[data-template="garden-promise"] .ie-letter {
  border-color: color-mix(in srgb, var(--ie-ribbon) 26%, transparent);
}
/* Three clear bands down the envelope: flap to 50%, the addressed name at 58%, then the tie. A
   second crossing band would run straight through the name, so the folio is tied once. */
.ot-root[data-template="garden-promise"] .ie-ribbon-horizontal {
  top: 68%;
  right: -4%;
  left: -4%;
  height: 5%;
}
.ot-root[data-template="garden-promise"] .ie-ribbon-vertical { display: none; }
.ot-root[data-template="garden-promise"] .ie-ribbon-knot {
  top: 70.5%;
  width: 44%;
}
/* Sized and placed to sit wholly inside the flap triangle: at a top of 18% and a width of 15% of
   the envelope, the widest point of the seal still clears the clip-path's converging edges. */
.ot-root[data-template="garden-promise"] .oe-seal {
  position: absolute;
  top: 18%;
  left: 50%;
  width: 15%;
  height: auto;
  aspect-ratio: 1;
  overflow: visible;
  transform: translateX(-50%);
}
.ot-root[data-template="garden-promise"] .oe-address {
  top: 52%;
  right: 9%;
  bottom: auto;
  left: 9%;
}
.ot-root[data-template="garden-promise"] .oe-seal-body {
  fill: color-mix(in srgb, var(--ie-ribbon) 86%, var(--ie-ink));
  filter: drop-shadow(0 0.1rem 0.16rem color-mix(in srgb, var(--ie-ink) 28%, transparent));
}
.ot-root[data-template="garden-promise"] .oe-seal-drip {
  fill: color-mix(in srgb, var(--ie-ribbon) 80%, var(--ie-ink));
}
.ot-root[data-template="garden-promise"] .oe-seal-rim {
  fill: none;
  stroke: color-mix(in srgb, var(--ie-paper) 30%, transparent);
  stroke-width: 2;
}
.ot-root[data-template="garden-promise"] .oe-seal-sprig {
  fill: color-mix(in srgb, var(--ie-paper) 58%, transparent);
  stroke: color-mix(in srgb, var(--ie-paper) 70%, transparent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}
.ot-root[data-template="garden-promise"] .oe-seal-bud {
  fill: color-mix(in srgb, var(--ie-paper) 62%, transparent);
}
.ot-root[data-template="garden-promise"] .oe-loop,
.ot-root[data-template="garden-promise"] .oe-tail,
.ot-root[data-template="garden-promise"] .oe-cinch {
  fill: var(--ie-ribbon);
}
.ot-root[data-template="garden-promise"] .oe-loop { fill: color-mix(in srgb, var(--ie-ribbon) 94%, white); }
.ot-root[data-template="garden-promise"] .oe-tail { fill: color-mix(in srgb, var(--ie-ribbon) 92%, var(--ie-ink)); }
.ot-root[data-template="garden-promise"] .oe-cinch { fill: color-mix(in srgb, var(--ie-ribbon) 84%, var(--ie-ink)); }
/* The seal breaks only once the band that crossed it has gone, then the flap it held can turn. */
.ot-root[data-template="garden-promise"] .oe-seal {
  transition: transform 620ms cubic-bezier(0.3, 0.72, 0.24, 1), opacity 420ms ease 200ms;
}
.ot-root[data-template="garden-promise"] .ie-root[data-opening-state="untying"] .oe-seal {
  transform: translateX(-50%) scale(1.04);
}
.ot-root[data-template="garden-promise"] .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .oe-seal {
  opacity: 0;
  transform: translateX(-50%) translateY(14%) rotate(-14deg) scale(0.92);
}
.ot-root[data-template="garden-promise"] .ot-scene-decoration i {
  top: 12%;
  width: 1.6rem;
  height: 1rem;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 40%, transparent);
  border-radius: 100% 0;
  background: color-mix(in srgb, var(--ie-ribbon) 9%, transparent);
}
.ot-root[data-template="garden-promise"] .ot-scene-decoration i:nth-child(1) { left: 4%; transform: rotate(-28deg); }
.ot-root[data-template="garden-promise"] .ot-scene-decoration i:nth-child(2) { right: 5%; top: 76%; transform: rotate(142deg); }
.ot-root[data-template="garden-promise"] .ot-scene-decoration i:nth-child(3) { right: 12%; top: 8%; transform: rotate(18deg) scale(0.72); }

/* ---------------------------------------------------------------------------------------------
   Golden Hour \u2014 portrait card sleeve, one brass band, a deco slide carrying the numeral.
   --------------------------------------------------------------------------------------------- */

.ot-root[data-template="golden-hour"] .ie-envelope {
  /* Portrait, and capped against the short axis so a landscape phone cannot push the sleeve past
     the locked viewport. */
  width: min(74%, 20rem, 46svh);
  aspect-ratio: 0.86;
  transform: none;
}
/* The shared variant rule paints a large diamond outline over the whole scene. Against a sleeve it
   crossed the card and the band; here it sits behind the object and reads as a room, not a frame. */
.ot-root[data-template="golden-hour"] .ie-opening::after {
  z-index: 0;
  width: min(52cqi, 15rem);
  border-color: color-mix(in srgb, var(--ie-ribbon) 18%, transparent);
}
.ot-root[data-template="golden-hour"] .ie-scene { z-index: 1; }
.ot-root[data-template="golden-hour"] .ie-envelope-back {
  /* The card, showing above the sleeve lip. */
  inset: 0 4% 6%;
  border-color: color-mix(in srgb, var(--ie-ribbon) 62%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ie-ribbon) 12%, transparent), transparent 30%),
    color-mix(in srgb, var(--ie-paper) 62%, var(--ie-background));
  box-shadow: 0 1.6rem 3rem color-mix(in srgb, black 42%, transparent);
}
.ot-root[data-template="golden-hour"] .ie-envelope-back::after {
  position: absolute;
  inset: 3% 5% auto;
  height: 0;
  border-top: 1px solid color-mix(in srgb, var(--ie-ribbon) 52%, transparent);
  box-shadow: 0 0.22rem 0 -0.01rem color-mix(in srgb, var(--ie-ribbon) 30%, transparent);
  content: "";
}
/* The sleeve. A stepped deco lip with a raised centre notch, brass-ruled along the top edge. */
.ot-root[data-template="golden-hour"] .ie-envelope-front {
  inset: 30% 0 0;
  clip-path: polygon(0 5%, 40% 5%, 44% 0, 56% 0, 60% 5%, 100% 5%, 100% 100%, 0 100%);
  border: 0;
  /* Darkened toward black, not toward --ie-ink: on this palette the ink is a light cream, so
     mixing with it turned the sleeve into a grey slab lighter than the card it holds. */
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ie-ribbon) 72%, transparent) 0 1.4%, transparent 1.4%),
    linear-gradient(180deg, color-mix(in srgb, var(--ie-ribbon) 30%, transparent) 0 3.4%, transparent 3.4%),
    linear-gradient(162deg, color-mix(in srgb, white 9%, transparent), transparent 48%),
    color-mix(in srgb, black 46%, var(--ie-background));
  box-shadow:
    inset 0 0.55rem 1.2rem color-mix(in srgb, black 55%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--ie-ribbon) 26%, transparent);
  color: var(--ie-ribbon);
}
/* A deco double rule set into the sleeve face, so the pocket below the band is a panel rather than
   an empty black field. */
.ot-root[data-template="golden-hour"] .ie-envelope-front::before {
  position: absolute;
  inset: 12% 9% 7%;
  border: 1px solid color-mix(in srgb, var(--ie-ribbon) 30%, transparent);
  outline: 1px solid color-mix(in srgb, var(--ie-ribbon) 15%, transparent);
  outline-offset: 0.3rem;
  content: "";
}
.ot-root[data-template="golden-hour"] .ie-envelope-flap { display: none; }
/* The card. Only its top edge stands above the lip, so the lead and the name are set to the top and
   the rest of the card stays in the sleeve until it rises. */
.ot-root[data-template="golden-hour"] .ie-letter {
  inset: 3% 8% 16%;
  padding: 5% 9%;
  border-color: color-mix(in srgb, var(--ie-ribbon) 40%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ie-paper) 74%, transparent), transparent 26%),
    color-mix(in srgb, var(--ie-paper) 52%, var(--ie-background));
  align-content: start;
  transform: translateY(0);
}
.ot-root[data-template="golden-hour"] .ie-letter small { display: none; }
.ot-root[data-template="golden-hour"] .ie-ribbon-horizontal {
  top: 62%;
  right: -5%;
  left: -5%;
  height: 9%;
}
.ot-root[data-template="golden-hour"] .ie-ribbon-vertical { display: none; }
.ot-root[data-template="golden-hour"] .ie-ribbon-knot {
  top: 66.5%;
  width: 32%;
  aspect-ratio: 1.5;
}
.ot-root[data-template="golden-hour"] .oe-gh-knot {
  display: grid;
  width: 100%;
  height: 100%;
  border: 1px solid color-mix(in srgb, var(--ie-background) 55%, var(--ie-ribbon));
  background:
    linear-gradient(158deg, color-mix(in srgb, white 34%, var(--ie-ribbon)), var(--ie-ribbon) 46%, color-mix(in srgb, var(--ie-ink) 26%, var(--ie-ribbon)));
  clip-path: polygon(0 22%, 9% 0, 91% 0, 100% 22%, 100% 78%, 91% 100%, 9% 100%, 0 78%);
  place-items: center;
  transition: transform 820ms cubic-bezier(0.24, 0.7, 0.26, 1);
}
.ot-root[data-template="golden-hour"] .oe-gh-knot b {
  color: color-mix(in srgb, var(--ie-background) 88%, var(--ie-ink));
  font-family: "Fraunces Variable", Georgia, serif;
  font-size: clamp(0.6rem, 2.5cqi, 1rem);
  font-weight: 520;
  letter-spacing: 0.06em;
}
.ot-root[data-template="golden-hour"] .ie-root[data-opening-state="untying"] .oe-gh-knot {
  transform: rotate(-6deg) scale(1.05);
}
.ot-root[data-template="golden-hour"] .ie-root:is([data-opening-state="opening"], [data-opening-state="letter-revealing"], [data-opening-state="opened"]) .oe-gh-knot {
  transform: rotate(-22deg) translateY(30%) scale(0.9);
}
/* No flap turns here. Once the band is off, the card rises out of the sleeve \u2014 and it stays behind
   the sleeve while it does, which is the whole point of a pocket. Stacking is the shared rule's job
   now; only the travel differs, because a sleeve is deeper than a pocket. */
.ot-root[data-template="golden-hour"] .ie-root[data-opening-state="opening"] .ie-letter {
  transform: translate3d(0, -30%, 8px);
}
.ot-root[data-template="golden-hour"] .ie-root:is([data-opening-state="letter-revealing"], [data-opening-state="opened"]) .ie-letter {
  transform: translate3d(0, -30%, 8px) scale(1.06);
}
.ot-root[data-template="golden-hour"] .ot-scene-decoration i {
  top: 8%;
  bottom: 8%;
  width: 1px;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--ie-ribbon) 42%, transparent) 30% 70%, transparent);
}
.ot-root[data-template="golden-hour"] .ot-scene-decoration i:nth-child(1) { left: 14%; }
.ot-root[data-template="golden-hour"] .ot-scene-decoration i:nth-child(2) { right: 14%; }
.ot-root[data-template="golden-hour"] .ot-scene-decoration i:nth-child(3) {
  top: 50%;
  right: 6%;
  bottom: auto;
  left: 6%;
  width: auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ie-ribbon) 30%, transparent) 40% 60%, transparent);
}

/* ---------------------------------------------------------------------------------------------
   Sunday Joy \u2014 square craft envelope, rounded flap, oversized off-centre bow.
   --------------------------------------------------------------------------------------------- */

.ot-root[data-template="sunday-joy"] .ie-envelope {
  --oe-rest: rotate(1.5deg);
  width: min(88%, 23rem);
  aspect-ratio: 1.14;
  transform: var(--oe-rest);
}
.ot-root[data-template="sunday-joy"] .ie-envelope-back {
  border: 2px solid color-mix(in srgb, var(--ie-ink) 22%, transparent);
  border-radius: 1.1rem;
  background: color-mix(in srgb, var(--ie-ink) 10%, var(--ie-paper));
  box-shadow: 0.7rem 0.8rem 0 color-mix(in srgb, var(--ie-ribbon) 40%, transparent);
}
/* The pocket. Its top edge is a straight cut, so the only arc on the envelope is the flap's own \u2014
   two stacked curves read as a cloud rather than as paper. */
.ot-root[data-template="sunday-joy"] .ie-envelope-front {
  inset: 44% 0 0;
  clip-path: none;
  border: 2px solid color-mix(in srgb, var(--ie-ink) 22%, transparent);
  border-radius: 0 0 1.1rem 1.1rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ie-ink) 8%, transparent), transparent 22%),
    var(--ie-paper);
  color: color-mix(in srgb, var(--ie-ink) 74%, transparent);
}
.ot-root[data-template="sunday-joy"] .ie-envelope-flap {
  clip-path: none;
  height: 50%;
  border: 2px solid color-mix(in srgb, var(--ie-ink) 22%, transparent);
  border-radius: 1.1rem 1.1rem 3.4rem 3.4rem;
  background:
    linear-gradient(180deg, transparent 58%, color-mix(in srgb, var(--ie-ink) 7%, transparent)),
    var(--ie-paper);
  filter: drop-shadow(0 0.22rem 0.3rem color-mix(in srgb, var(--ie-ink) 16%, transparent));
}
.ot-root[data-template="sunday-joy"] .ie-letter {
  border-radius: 0.5rem;
  border-color: color-mix(in srgb, var(--ie-ink) 18%, transparent);
}
/* Tied off-centre, the way a present actually gets wrapped. */
.ot-root[data-template="sunday-joy"] .ie-ribbon-horizontal {
  top: 56%;
  height: 8%;
  transform: rotate(-1.5deg);
}
.ot-root[data-template="sunday-joy"] .ie-ribbon-vertical {
  left: 26.5%;
  width: 6.5%;
}
.ot-root[data-template="sunday-joy"] .ie-ribbon-knot {
  top: 60%;
  left: 29.5%;
  width: 46%;
}
/* Clear of the vertical band, which crosses the pocket at 26.5%. */
.ot-root[data-template="sunday-joy"] .oe-address {
  right: 6%;
  bottom: 8%;
  left: 40%;
}
.ot-root[data-template="sunday-joy"] .oe-loop { fill: color-mix(in srgb, var(--ie-ribbon) 92%, white); }
.ot-root[data-template="sunday-joy"] .oe-tail { fill: color-mix(in srgb, var(--ie-ribbon) 94%, var(--ie-ink)); }
.ot-root[data-template="sunday-joy"] .oe-cinch { fill: color-mix(in srgb, var(--ie-ribbon) 82%, var(--ie-ink)); }
/* A shade more overshoot than the other two, and it stops there. Cloth is soft; it is not rubber. */
.ot-root[data-template="sunday-joy"] .oe-loop,
.ot-root[data-template="sunday-joy"] .oe-tail {
  transition-timing-function: cubic-bezier(0.2, 0.92, 0.3, 1.06);
}
.ot-root[data-template="sunday-joy"] .ot-scene-decoration i {
  width: 0.85rem;
  height: 0.85rem;
  background: color-mix(in srgb, var(--ie-ribbon) 42%, transparent);
}
.ot-root[data-template="sunday-joy"] .ot-scene-decoration i:nth-child(1) {
  top: 14%;
  left: 6%;
  border-radius: 50%;
  background: color-mix(in srgb, #f6c94c 78%, transparent);
}
.ot-root[data-template="sunday-joy"] .ot-scene-decoration i:nth-child(2) {
  top: 72%;
  right: 8%;
  transform: rotate(20deg);
  background: color-mix(in srgb, #79b9d4 72%, transparent);
}
.ot-root[data-template="sunday-joy"] .ot-scene-decoration i:nth-child(3) {
  top: 6%;
  right: 16%;
  width: 0;
  height: 0;
  border-right: 0.5rem solid transparent;
  border-bottom: 0.9rem solid color-mix(in srgb, var(--ie-ribbon) 52%, transparent);
  border-left: 0.5rem solid transparent;
  background: none;
  transform: rotate(-14deg);
}

/* ---------------------------------------------------------------------------------------------
   Small viewports and reduced motion.
   --------------------------------------------------------------------------------------------- */

@container (max-width: 26rem) {
  .ot-root[data-template="garden-promise"] .ie-envelope,
  .ot-root[data-template="sunday-joy"] .ie-envelope { width: 94%; }
  .ot-root[data-template="golden-hour"] .ie-envelope { width: min(80%, 15rem, 38svh); }
  .ot-root .oe-address strong { font-size: 0.72rem; }
}

@media (prefers-reduced-motion: reduce) {
  /* No press scale, but the resting tilt is composition, not motion, so it stays. */
  .ot-root .ie-scene:active:not([aria-disabled="true"]) .ie-envelope { transform: var(--oe-rest); }
}
`;
