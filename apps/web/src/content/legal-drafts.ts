export interface LegalDraftSection {
  bullets?: readonly string[];
  id: string;
  paragraphs: readonly string[];
  reviewNote?: string;
  title: string;
}

export interface LegalDraftSource {
  href: string;
  label: string;
}

export interface LegalWorkingDraft {
  blockers: readonly string[];
  documentLabel: string;
  introduction: readonly string[];
  sections: readonly LegalDraftSection[];
  sources: readonly LegalDraftSource[];
}

export const termsWorkingDraft = {
  documentLabel: "Founder working draft",
  introduction: [
    "These proposed Terms are tailored to Invitica's current product and architecture. They are not in effect, cannot be accepted, and do not create the final agreement for using Invitica.",
    "The operational clauses below are a review scaffold. Controller identity, eligibility, dispute terms, liability allocation, and other legal consequences require a qualified Philippine lawyer before this document can receive an effective date.",
  ],
  blockers: [
    "Identify the person or registered entity operating Invitica, including its address and monitored legal contact.",
    "Confirm creator eligibility, minimum age, and whether a creator may act for an organization or another event host.",
    "Approve the content-removal, account-suspension, account-deletion, and appeal procedures.",
    "Approve a real retention and backup-deletion schedule that matches implemented behavior.",
    "Have counsel draft warranty, liability, indemnity, governing-law, venue, and dispute-resolution clauses.",
    "Add paid-publication, cancellation, refund, tax, and payment terms only when production payments are actually approved.",
  ],
  sections: [
    {
      id: "service",
      title: "1. The service",
      paragraphs: [
        "Invitica is a Philippines-first service for creating and publishing premium interactive digital invitations. Creators use an account to customize an invitation, publish a versioned guest website, manage invited parties, and review replies. Guests may open an invitation and, when personally invited, reply without creating an account.",
        "Invitica is currently a closed-beta product. Features described in product plans but not implemented—such as production payments, a template marketplace, custom domains, and general audio publication—are not part of this draft service description.",
      ],
      reviewNote:
        "Operator name, legal form, physical address, and monitored legal contact must be inserted before effectivity.",
    },
    {
      id: "accounts",
      title: "2. Creator accounts",
      paragraphs: [
        "A creator must provide accurate account information, keep sign-in credentials secure, and promptly report suspected unauthorized access. Email/password and Google sign-in are the supported identity paths; use of Google sign-in also remains subject to Google's own terms and privacy practices.",
        "Guests do not need Invitica accounts. A creator must not create an account for another person or represent authority that the creator does not have.",
      ],
      reviewNote:
        "Counsel and the founder must decide age, legal-capacity, and organization-authority rules.",
    },
    {
      id: "creator-responsibilities",
      title: "3. Creator responsibilities",
      paragraphs: [
        "Creators control the event information and guest data they place in Invitica. A creator should provide only information needed for the event and should have the authority and permissions needed to use names, photographs, messages, venue details, and other uploaded content.",
        "Creators are responsible for the accuracy of event details and for handling shared and personalized links carefully. An unlisted invitation is not the same as a confidential document: anyone who receives a working link may forward it.",
      ],
      bullets: [
        "Do not upload unlawful, abusive, deceptive, infringing, or privacy-invasive content.",
        "Do not upload malware, scripts, arbitrary HTML, unrestricted CSS, or material intended to interfere with Invitica or another service.",
        "Do not attempt to bypass access controls, rate limits, invitation-link safeguards, or another creator's workspace.",
        "Do not use Invitica for spam, impersonation, fraud, harassment, or an event the creator is not authorized to manage.",
      ],
    },
    {
      id: "content-permission",
      title: "4. Content ownership and service permission",
      paragraphs: [
        "The proposed position is that creators keep ownership of their content. To operate the service, a creator would give Invitica a limited permission to host, validate, resize, reproduce, and display that content only as needed to create, preview, publish, secure, and support the invitation.",
        "Invitica's software, brand, curated templates, renderer designs, and platform materials remain separate from creator content. Using the service would not transfer those platform rights to a creator.",
      ],
      reviewNote:
        "Counsel must approve the exact scope, duration, sublicensing, termination, and backup treatment of this proposed content licence.",
    },
    {
      id: "publication",
      title: "5. Publishing and sharing",
      paragraphs: [
        "Published invitations use immutable versioned snapshots. A creator may publish a newer version without changing the main shared URL, while an older publication may remain in delivery storage for rollback and operational recovery.",
        "Invitica uses high-entropy unlisted links, noindex instructions, and privacy-aware personalized fragments, but no technical measure can guarantee that a recipient will not copy, screenshot, or forward invitation content.",
        "Creators should verify names, dates, venue details, reply deadlines, photographs, and recipient wording before sharing a publication.",
      ],
    },
    {
      id: "guests",
      title: "6. Guests and replies",
      paragraphs: [
        "A creator may add guest names and party groupings and create a personalized link. A personally invited party may submit or revise a bounded attendance response before the invitation's reply deadline. General invitation links remain view-only.",
        "The creator—not Invitica—decides whom to invite and what guest information to provide. The allocation of privacy responsibilities between Invitica and creators must be confirmed before these Terms become effective.",
      ],
    },
    {
      id: "availability",
      title: "7. Beta availability and changes",
      paragraphs: [
        "Invitica is under active development and does not currently offer a contractual service-level agreement. The service may change, experience interruption, or require maintenance. Invitations should not be the only place a host keeps critical event information.",
        "Invitica may need to limit or suspend access to protect guests, creators, the platform, or its providers, or to respond to suspected misuse. The final notice, appeal, and restoration process is not yet approved.",
      ],
    },
    {
      id: "payments",
      title: "8. Paid services",
      paragraphs: [
        "Production payments are not active. Current price ideas are experiments, not offers or contractual prices. Paid-publication rights, taxes, cancellations, refunds, chargebacks, and payment-provider terms must be added only after Invitica has an approved business and merchant setup.",
      ],
    },
    {
      id: "ending-use",
      title: "9. Ending use of Invitica",
      paragraphs: [
        "The final Terms must explain how a creator closes an account, unpublishes an invitation, exports available data, and requests deletion. Current product deletion and retention behavior is not yet complete enough to promise a final timeline.",
      ],
      reviewNote:
        "Do not activate this section until deletion, revocation, retention, backups, and support procedures are implemented and verified.",
    },
    {
      id: "legal-clauses",
      title: "10. Clauses intentionally awaiting counsel",
      paragraphs: [
        "Warranty disclaimers, limitation of liability, indemnity, governing law, venue, dispute resolution, severability, assignment, force majeure, and formal notice clauses are intentionally not drafted as operative terms here. These clauses can materially change the founder's and users' rights and require legal advice.",
      ],
    },
    {
      id: "changes",
      title: "11. Document versions and acceptance",
      paragraphs: [
        "When approved documents become effective, Invitica is designed to record the creator's user ID, the exact Terms version, the Privacy Notice version presented with it, and a database timestamp. It does not need to record an IP address or user-agent string for this mechanism.",
        "The proposed approach is to request acceptance again only for a material Terms change. A new version must have an effective date and a clear explanation of what changed.",
      ],
    },
    {
      id: "contact",
      title: "12. Contact",
      paragraphs: [
        "A monitored legal and support contact has not yet been approved. The final Terms must name the operator and provide a reliable way to send legal notices and support requests.",
      ],
    },
  ],
  sources: [
    {
      href: "https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/",
      label: "National Privacy Commission — Data Privacy Act implementing rules",
    },
    {
      href: "https://developers.google.com/identity/protocols/oauth2/policies",
      label: "Google OAuth 2.0 policies",
    },
  ],
} as const satisfies LegalWorkingDraft;

export const privacyWorkingDraft = {
  documentLabel: "Founder working draft",
  introduction: [
    "This draft explains Invitica's current and proposed personal-data handling in plain language. It is not an effective Privacy Notice and must not be used to claim legal, National Privacy Commission, or Google OAuth compliance.",
    "Several facts required for a complete notice are unresolved. They are shown as review blockers so the product cannot silently activate consent around invented information.",
  ],
  blockers: [
    "Name the personal information controller, business or individual address, accountable privacy person or DPO, and monitored privacy-request email.",
    "Confirm the lawful basis for creator account data and for guest information supplied by event creators.",
    "Approve an implemented retention and secure-deletion schedule, including publication artifacts, deleted accounts, logs, and provider backups.",
    "Verify every current processor, subprocessor, contract, geographic processing location, and cross-border safeguard.",
    "Document access, correction, objection, erasure/blocking, portability, complaint, identity-verification, and response procedures.",
    "Complete a privacy impact assessment and determine DPO/data-processing-system registration obligations with qualified Philippine counsel.",
  ],
  sections: [
    {
      id: "scope",
      title: "1. Scope and roles",
      paragraphs: [
        "This draft covers creator accounts, invitation drafting and publication, guest-party management, personalized links, account-free replies, invitation delivery, and the public marketing site.",
        "Creators decide the event content and guest information they enter. Invitica operates the application, authentication, database, publication pipeline, and guest-delivery systems. The final notice must clearly state when Invitica acts as a personal information controller and whether any activity is performed only on a creator's instructions.",
      ],
      reviewNote:
        "The legal identity and contact details of Invitica's controller are not yet established.",
    },
    {
      id: "data",
      title: "2. Information Invitica handles",
      paragraphs: [
        "Creator account information may include name, email address, authentication identifiers, confirmation and recovery state, profile details, workspace membership, and the versions and time of legal acceptance.",
        "Invitation information may include event titles, hosts, dates, schedules, messages, venues and map coordinates, attire guidance, participant names, registry details, images, and the template and design choices used to render the invitation.",
        "Guest information may include recipient or household names, party members, invitation-link status, creator-recorded delivery state, reply attendance, party count, an optional short message, and reply revision history.",
        "Service information includes publication versions and job state, media metadata, aggregate daily invitation-view counts, and security or request-budget state. At the application database layer, Invitica's current aggregate view feature does not store a viewer's IP address, user-agent, referrer, account, raw URL, personalized token, or unique-person identifier. Hosting and security providers may still process ordinary request metadata under their own systems and contracts.",
      ],
    },
    {
      id: "sources",
      title: "3. Where information comes from",
      paragraphs: [
        "Information comes from creators, guests who submit replies, people who use the marketing or creator application, authentication providers, and the technical systems needed to deliver the service.",
        "A creator may provide another person's name or photograph without that person interacting with Invitica first. The lawful basis, notice timing, and responsibility for this creator-supplied guest data require legal review.",
      ],
    },
    {
      id: "google",
      title: "4. Google sign-in",
      paragraphs: [
        "Invitica uses Google only as an optional sign-in path through Supabase Auth. The intended use is basic identity information needed to authenticate an account, such as the provider account identifier, email address, and available profile name. Invitica does not currently request Google Drive, Gmail, Calendar, contacts, or advertising data.",
        "The exact production OAuth scopes and Google Cloud consent-screen configuration must be verified before this notice becomes effective. Invitica must limit its use of Google user data to what the final published notice accurately describes.",
      ],
    },
    {
      id: "purposes",
      title: "5. Why information is used",
      bullets: [
        "Authenticate creators and maintain secure creator sessions.",
        "Create, edit, validate, preview, publish, deliver, and support invitation websites.",
        "Let creators manage invited parties and let personally invited guests submit replies.",
        "Generate responsive media renditions, publication artifacts, and link-preview images.",
        "Protect accounts, links, public endpoints, and provider resources from misuse.",
        "Show creators aggregate operational results without guest-level open tracking.",
        "Maintain versioned acceptance evidence when approved legal documents become effective.",
      ],
      paragraphs: [
        "Invitica does not currently sell personal information, run advertising, install product analytics, perform session replay, or use guest-level open/read tracking. A future analytics or marketing feature would require a separate product and privacy review before collection begins.",
      ],
      reviewNote:
        "Counsel must assign and document the lawful basis for each purpose instead of treating Terms acceptance as blanket privacy consent.",
    },
    {
      id: "sharing",
      title: "6. Service providers and cross-border processing",
      paragraphs: [
        "Current architecture uses Supabase in Singapore for authentication and PostgreSQL, Cloudflare Workers and private R2 storage for published invitation and media delivery, a web-hosting platform for the creator application, Trigger.dev for publication jobs, MapTiler for maps loaded at a user's request, and Google for optional sign-in.",
        "Some providers and subprocessors may process data outside the Philippines. The final notice must identify appropriate recipient categories, verify geographic locations, link the current provider terms where useful, and describe the safeguards used for outsourcing and cross-border processing.",
      ],
      reviewNote:
        "The provider and subprocessor inventory, contracts, data processing agreements, and geographic data flows are not yet fully audited.",
    },
    {
      id: "links",
      title: "7. Published and personalized links",
      paragraphs: [
        "Published invitations use high-entropy unlisted URLs and noindex instructions, but anyone with a working link may view or forward it. Creators should avoid placing unnecessary sensitive information in an invitation.",
        "A personalized guest token is carried in the URL fragment, which browsers do not send in the ordinary page request or referrer. The hydrated invitation sends it in a bounded no-referrer request when resolving guest context. PostgreSQL uses a keyed hash for resolution; recoverable active-token material is separately encrypted for an owner-authorized creator copy action.",
      ],
    },
    {
      id: "cookies",
      title: "8. Cookies and similar storage",
      paragraphs: [
        "Invitica uses necessary cookies for Supabase authentication, session refresh, email recovery, and—once effective legal documents exist—a short-lived signed registration-acceptance handoff. These are operational cookies, not advertising cookies.",
        "No product analytics or advertising cookie is currently installed. Provider security and delivery systems may use their own necessary technologies; those must be verified in the processor audit.",
      ],
    },
    {
      id: "retention",
      title: "9. Retention and deletion",
      paragraphs: [
        "Invitica does not yet have a fully implemented and approved retention schedule. Product planning contains proposed periods, but proposals are not current behavior and are intentionally not presented here as promises.",
        "Before effectivity, Invitica must document and implement retention for creator accounts, guest records, reply history, invitation drafts, active and historical publications, media originals and renditions, request-security records, operational logs, legal-acceptance history, deleted data, and provider backups.",
      ],
      reviewNote: "This missing retention schedule is a release blocker for an effective notice.",
    },
    {
      id: "security",
      title: "10. Security approach",
      paragraphs: [
        "Current safeguards include verified creator sessions, workspace ownership checks, PostgreSQL row-level security, narrow server actions and database functions, strict runtime validation, high-entropy public identifiers, hash-based personalized-link resolution, encrypted active-link recovery, private media storage, immutable publication snapshots, and restrictive guest-viewer security headers.",
        "No system can promise absolute security. The final notice and internal procedures must name a monitored incident contact and define assessment, containment, notification, and data-subject support.",
      ],
    },
    {
      id: "rights",
      title: "11. Data-subject rights",
      paragraphs: [
        "Philippine data-protection rules describe rights that can include being informed, objecting, accessing data, correcting inaccuracies, erasure or blocking in qualifying circumstances, damages, portability in applicable cases, and lodging a complaint with the National Privacy Commission.",
        "The final notice must explain how a creator, guest, parent, guardian, or photographed person can make a request; how identity and authority are verified; when a creator must assist; the response process; and any lawful limitations.",
      ],
      reviewNote:
        "There is no approved monitored privacy mailbox or complete request-handling workflow yet.",
    },
    {
      id: "children",
      title: "12. Children and family-event content",
      paragraphs: [
        "Invitica is not designed as a service for children to operate directly, but invitations may include children's names or photographs for christenings, birthdays, and family events. Creators should upload such content only when they have appropriate authority and should avoid unnecessary sensitive details.",
      ],
      reviewNote:
        "Counsel must confirm age, parental-authority, consent, and sensitive-information requirements before effectivity.",
    },
    {
      id: "automated-decisions",
      title: "13. Automated decisions",
      paragraphs: [
        "Invitica does not currently use personal data for profiling or automated decisions that produce legal or similarly significant effects. Template validation, publication checks, request throttling, and security controls support the service but do not score a person's eligibility.",
      ],
    },
    {
      id: "changes-contact",
      title: "14. Changes, contact, and complaints",
      paragraphs: [
        "An effective Privacy Notice must carry a version and effective date. Material changes should be presented clearly, and the Terms mechanism is designed to record the Privacy Notice version shown when a creator accepts the Terms.",
        "A monitored privacy contact, controller identity, accountable privacy person or DPO, business address, and request procedure have not yet been approved. Data subjects may also have the right to lodge a complaint with the Philippine National Privacy Commission.",
      ],
    },
  ],
  sources: [
    {
      href: "https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/",
      label: "National Privacy Commission — Data Privacy Act implementing rules",
    },
    {
      href: "https://privacy.gov.ph/reminder-on-mandatory-data-protection-officer-and-data-processing-system-registration/",
      label: "National Privacy Commission — DPO and data-processing-system registration reminder",
    },
    {
      href: "https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification",
      label: "Google OAuth brand and privacy-policy verification",
    },
  ],
} as const satisfies LegalWorkingDraft;
