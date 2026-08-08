/**
 * Invitica's effective Terms of Service and Privacy Notice.
 *
 * Every operational statement here is written against implemented behavior. When the product
 * changes what it collects, who processes it, or how long it is kept, this file changes in the same
 * task and `LEGAL_DOCUMENTS` in `@invitica/renderer/legal-documents` gets a new version.
 */

export interface LegalDocumentTable {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}

export interface LegalDocumentSection {
  bullets?: readonly string[];
  id: string;
  paragraphs: readonly string[];
  table?: LegalDocumentTable;
  title: string;
}

export interface LegalDocumentSource {
  href: string;
  label: string;
}

export interface LegalDocumentContent {
  documentLabel: string;
  introduction: readonly string[];
  sections: readonly LegalDocumentSection[];
  sources: readonly LegalDocumentSource[];
  sourcesNote: string;
}

const OPERATOR = "Theo Cedric Chan";
const OPERATOR_ADDRESS = "Tuyan, Naga City, Cebu, Philippines";
const CONTACT_EMAIL = "invitica.support@gmail.com";

export const termsDocument = {
  documentLabel: "Invitica",
  introduction: [
    `These Terms are the agreement between you and ${OPERATOR}, who operates Invitica. They apply when you create an Invitica account, build an invitation, publish it, or share it with guests.`,
    "Read them before you accept. If you do not agree with them, do not create an account and do not publish an invitation.",
  ],
  sections: [
    {
      id: "operator",
      title: "1. Who operates Invitica",
      paragraphs: [
        `Invitica is operated by ${OPERATOR}, an individual based in the Philippines. In these Terms, "Invitica", "we", and "us" mean that person operating this service, and "you" means the person who holds a creator account.`,
        `Postal address: ${OPERATOR_ADDRESS}. Email for support, legal notices, and privacy requests: ${CONTACT_EMAIL}. Email is the fastest way to reach us and the address we use for formal notice.`,
      ],
    },
    {
      id: "acceptance",
      title: "2. Accepting these Terms",
      paragraphs: [
        "You accept these Terms by ticking the acceptance box when you create an account, or by accepting them when we ask you again after a material change. Using Invitica without accepting is not possible: the acceptance checkpoint sits in front of your creator workspace.",
        "When you accept, Invitica records your user ID, the exact version of these Terms, the exact version of the Privacy Notice shown alongside them, and the time the acceptance was stored. It does not record your IP address or your browser's user-agent string for this purpose.",
        "We ask again only when a change is material. A routine correction that does not change your rights or obligations is published without a new acceptance.",
      ],
    },
    {
      id: "eligibility",
      title: "3. Who may create an account",
      paragraphs: [
        "You must be at least 18 years old, or the age of majority where you live if that age is higher. Invitica is not designed for children to operate.",
        "You may use Invitica on behalf of another host — a couple whose wedding you are planning, a parent whose child's celebration you are organizing, a client who has engaged you. If you do, you confirm that you have their authority to act for them and to handle the information you enter about them and their guests. You remain the account holder and remain responsible under these Terms.",
      ],
    },
    {
      id: "account",
      title: "4. Your account",
      paragraphs: [
        "Give accurate account information, keep your sign-in credentials secure, and tell us promptly at the address above if you think someone else has reached your account.",
        "Invitica supports email and password sign-in and optional Google sign-in. If you sign in with Google, Google's own terms and privacy practices also apply to that step. You are responsible for what happens through your account, including what anyone you allow to use it does.",
        "Guests do not need an account. Do not create an Invitica account in another person's name.",
      ],
    },
    {
      id: "service",
      title: "5. What Invitica does",
      paragraphs: [
        "Invitica lets you customize an invitation from a curated template, publish it as a versioned guest website at an unlisted address, manage the parties you invite, and read their replies. Guests open an invitation without an account, and a personally invited party may reply before the deadline you set.",
        "Invitica is in closed beta and under active development. Features may be added, changed, or withdrawn. Anything described in our public materials as planned — production payments, a template marketplace, custom domains, general music publishing — is not part of the service you are agreeing to today.",
      ],
    },
    {
      id: "your-content",
      title: "6. Your content and the permission you give Invitica",
      paragraphs: [
        "You keep ownership of everything you put into Invitica: your event details, your words, your photographs, your guest list. Nothing in these Terms transfers ownership to us.",
        "To run the service, you give Invitica a non-exclusive, worldwide, royalty-free permission to host, store, validate, resize, reproduce, transmit, and display your content — only as needed to create, preview, publish, deliver, secure, back up, and support your invitation, and only for as long as we hold it under the Privacy Notice. We do not use your content to advertise, to promote Invitica publicly, or to train any model.",
        "This permission ends when you delete the content or your account, except for copies that remain in provider backups for a limited period and for published files that other invitations share, which the Privacy Notice explains.",
      ],
    },
    {
      id: "guest-data",
      title: "7. Guest information: your role and ours",
      paragraphs: [
        "You decide who is invited, what information about them you enter, and how long their invitation stays published. Under the Data Privacy Act, that makes you the personal information controller for the guest information you put into Invitica. Invitica stores, processes, and delivers that information on your instructions, as your personal information processor.",
        "By entering guest information you confirm that you have a lawful basis to collect and share it — usually because you are inviting people you know to your own event — and that you will tell them about their information if they ask.",
        "Invitica will process guest information only to provide the service to you and to keep it secure, will not use it for its own marketing, will keep it confidential, will use the providers listed in the Privacy Notice to hold and deliver it, will help you respond if a guest asks about their information, and will delete it when you delete the invitation or your account. If you ask us to do something with guest information that we believe would be unlawful, we may refuse.",
        "Invitica is the personal information controller in its own right for your creator account, for authentication, for security and abuse prevention, and for the aggregate counts described in the Privacy Notice.",
      ],
    },
    {
      id: "publishing",
      title: "8. Publishing and sharing",
      paragraphs: [
        "A published invitation is an immutable snapshot. Publishing again replaces what guests see at the same shared address, while the earlier snapshot may remain in storage for rollback and recovery.",
        "Invitation links are unlisted and hard to guess, and published pages ask search engines not to index them. That is not the same as confidential. Anyone who receives a working link can open it, forward it, screenshot it, or post it. Do not put information in an invitation that would harm someone if it travelled further than you intended.",
        "Check names, dates, venues, reply deadlines, photographs, and personalized wording before you share. Once a link is out, you cannot recall what has already been seen.",
      ],
    },
    {
      id: "guests",
      title: "9. Guests and replies",
      paragraphs: [
        "You may add guest names, group them into parties, and create a personalized link for each party. A personally invited party may submit and revise a bounded attendance reply — attending or not, a party count within the capacity you set, and an optional short message — until the reply deadline passes. A general link is view-only.",
        "Invitica does not track whether a guest opened an invitation. Delivery status reflects what you recorded and what you did, not what the guest did.",
      ],
    },
    {
      id: "ai",
      title: "10. Invi, the AI assistant",
      paragraphs: [
        "Invi is an optional assistant available only inside your signed-in creator account. It never appears on a published invitation and guests never interact with it. It answers questions about Invitica, drafts invitation wording, and turns a pasted guest list into rows you can edit.",
        "Invi proposes; it never saves. Nothing it produces reaches your invitation, your guest list, or a published page until you review it and apply it yourself. Its output can be wrong, incomplete, or oddly worded — check it the way you would check a draft written by anyone else. You remain responsible for what you publish.",
        "Your messages, and the invitation or guest list you ask about, are sent to our AI provider to produce an answer. The Privacy Notice names that provider and explains what is sent. Do not paste names, contact details, photographs, or private information you do not have permission to use.",
        "Use is capped at 20 messages per account per day. We may change the cap, change the underlying model, or withdraw the feature.",
      ],
    },
    {
      id: "acceptable-use",
      title: "11. Acceptable use",
      paragraphs: [
        "Use Invitica for real invitations to real events you are authorized to organize. The following are not allowed:",
      ],
      bullets: [
        "Uploading unlawful, abusive, deceptive, infringing, or privacy-invasive content.",
        "Uploading malware, scripts, arbitrary HTML, unrestricted CSS, or anything meant to interfere with Invitica or a provider we use.",
        "Bypassing access controls, rate limits, link safeguards, or another creator's workspace, or testing them without our written permission.",
        "Spam, impersonation, fraud, harassment, or running an event you have no authority to run.",
        "Reselling, sublicensing, or systematically copying Invitica's templates, renderer designs, or platform materials.",
        "Automated scraping or bulk downloading of any part of the service.",
      ],
    },
    {
      id: "enforcement",
      title: "12. Content removal, suspension, and appeal",
      paragraphs: [
        "We may remove content, take an invitation offline, or suspend an account when we reasonably believe it breaks these Terms, breaks the law, endangers guests or other creators, or threatens the service or a provider we depend on. Where a risk is urgent we may act first.",
        `We will tell you what we removed or suspended and why, by email, unless the law prevents us. You may appeal by replying to that email or writing to ${CONTACT_EMAIL}. We will look at an appeal ourselves and restore what should not have been removed. While Invitica is in beta we do not promise a fixed response time, and we do promise to answer.`,
        "You may also report content that concerns you at the same address.",
      ],
    },
    {
      id: "availability",
      title: "13. Availability and changes to the service",
      paragraphs: [
        "Invitica is provided as it is, without a service-level agreement. It may be interrupted for maintenance, may change, and may have faults. Keep your event's critical information somewhere other than your invitation, and give guests another way to reach you.",
        "We may change or discontinue features. If we discontinue something you rely on, we will give you reasonable notice by email where we can.",
      ],
    },
    {
      id: "fees",
      title: "14. Fees and paid publication",
      paragraphs: [
        "Invitica charges nothing today. Every template and every publication in the current beta is free, and no payment method is collected. This section sets out the terms that will apply when paid publication becomes available; until then, no amount is payable.",
        "When paid publication launches, a price will be shown in Philippine pesos before you pay, and payment will buy a licence to publish one event rather than ownership of a template. Any taxes required by law will be shown before you pay. We will publish the seller information the law then requires of us.",
        "A publication licence is digital content delivered as soon as your invitation is published. Because of that, a publication fee is not refundable once the invitation has been published. Before you publish, you may cancel and receive a full refund. If we fail to deliver what you paid for — your published invitation never becomes reachable, or we take it down for a reason that is not your fault — you may choose a full refund or a replacement publication.",
        "Nothing in this section removes rights the Consumer Act of the Philippines or other Philippine law gives you and that cannot be waived.",
        "If a payment is reversed or charged back, we may suspend the affected publication until it is resolved.",
      ],
    },
    {
      id: "ending",
      title: "15. Ending your use of Invitica",
      paragraphs: [
        "You may delete an invitation at any time. Deleting a published invitation takes its guest link down first, so a shared link stops working, and then removes its records. You may stop using Invitica at any time by deleting your account in Settings.",
        "Deleting your account takes two deliberate steps: you confirm in Settings, then follow a single-use link we email you, which expires after 30 minutes and only works while you are still signed in to that same account. Once confirmed, deletion is immediate and cannot be undone. Every invitation you published is taken offline first, then your account and its records are removed. There is no grace period and no way for us to restore an account afterwards.",
        "We may close an account that has broken these Terms, following section 12. If we do, we will take your published invitations offline.",
      ],
    },
    {
      id: "our-rights",
      title: "16. Invitica's own materials",
      paragraphs: [
        "Invitica's software, name, brand, curated templates, renderer designs, illustrations, and written materials belong to us or our licensors. These Terms give you permission to use the service, not a licence to reuse those materials elsewhere.",
        'Published invitations carry a small "Powered by Invitica" attribution in the footer, which links to our public site and, once effective, to this Privacy Notice.',
      ],
    },
    {
      id: "warranties",
      title: "17. Warranties and disclaimers",
      paragraphs: [
        'Invitica is provided on an "as is" and "as available" basis. To the extent Philippine law allows, we do not give warranties that the service will be uninterrupted, error-free, or fit for a particular purpose, and we do not warrant that a guest will open, read, or reply to an invitation.',
        "Philippine law gives consumers rights that cannot be excluded. Nothing here excludes those rights, and nothing here excludes liability for fraud, willful misconduct, or gross negligence.",
      ],
    },
    {
      id: "liability",
      title: "18. Limitation of liability",
      paragraphs: [
        "To the extent Philippine law allows, Invitica's total liability to you for all claims connected to the service is limited to the greater of the amounts you paid us in the 12 months before the claim arose, or PHP 5,000.",
        "To the same extent, we are not liable for indirect or consequential loss, lost profits or opportunities, loss of goodwill, or the cost of substitute arrangements, and we are not liable for the consequences of a guest forwarding a link, of information you chose to put into an invitation, or of an event outcome.",
        "The limits in this section do not apply to fraud, willful misconduct, gross negligence, or liability that Philippine law does not permit us to limit.",
      ],
    },
    {
      id: "indemnity",
      title: "19. Your responsibility for what you upload",
      paragraphs: [
        "You will cover Invitica against claims, losses, and reasonable costs arising from the content you upload, the guest information you enter, your use of the service in breach of these Terms, and any claim that you had no authority or lawful basis for information you entered about another person.",
        "We will tell you promptly about any such claim, will not settle it without asking you, and will let you take the lead in defending it.",
      ],
    },
    {
      id: "governing-law",
      title: "20. Governing law and where disputes are heard",
      paragraphs: [
        "These Terms are governed by the laws of the Republic of the Philippines.",
        `Talk to us first — most problems are quicker to fix at ${CONTACT_EMAIL} than anywhere else. If a dispute cannot be resolved that way, it will be heard by the competent courts of Cebu City, Philippines, and you and Invitica agree to that venue, without preventing either of us from seeking urgent relief elsewhere where the law allows.`,
      ],
    },
    {
      id: "changes",
      title: "21. Changes to these Terms",
      paragraphs: [
        "We may update these Terms. Every version carries a version number and an effective date, and the current version is always published at this address.",
        "For a material change we will ask you to accept the new version before you continue using your creator workspace, and we will say plainly what changed. For a minor correction we will publish the updated document and change its date. If you do not want to accept a new version, you may delete your account instead.",
      ],
    },
    {
      id: "general",
      title: "22. General",
      paragraphs: [
        "If a court finds part of these Terms unenforceable, the rest still applies. If we do not enforce something immediately, we do not lose the right to enforce it later.",
        "You may not transfer your rights under these Terms without our written consent. We may transfer ours if Invitica is reorganized, registered as a business, or acquired, and we will tell you if that happens.",
        "Neither of us is responsible for a failure caused by something genuinely outside our control, such as a natural disaster, a nationwide network failure, or the failure of a provider we depend on.",
        "These Terms and the Privacy Notice are the whole agreement between you and Invitica about the service, and replace any earlier draft or discussion.",
      ],
    },
    {
      id: "contact",
      title: "23. How to reach us",
      paragraphs: [
        `Invitica, operated by ${OPERATOR}. ${OPERATOR_ADDRESS}. Email: ${CONTACT_EMAIL}.`,
        "Use this address for support, for a complaint, for an appeal under section 12, and for formal legal notice.",
      ],
    },
  ],
  sources: [
    {
      href: "https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/",
      label: "National Privacy Commission — Data Privacy Act implementing rules",
    },
    {
      href: "https://lawphil.net/statutes/repacts/ra2000/ra_8792_2000.html",
      label: "Electronic Commerce Act of 2000",
    },
    {
      href: "https://lawphil.net/statutes/repacts/ra1992/ra_7394_1992.html",
      label: "Consumer Act of the Philippines",
    },
    {
      href: "https://ecommerce.dti.gov.ph/ra11967/",
      label: "Department of Trade and Industry — Internet Transactions Act of 2023",
    },
    {
      href: "https://developers.google.com/identity/protocols/oauth2/policies",
      label: "Google OAuth 2.0 policies",
    },
  ],
  sourcesNote:
    "These are the primary Philippine laws and provider policies Invitica followed when writing this document. They are published here so you can read them yourself.",
} as const satisfies LegalDocumentContent;

export const privacyDocument = {
  documentLabel: "Invitica",
  introduction: [
    "This notice explains what personal information Invitica handles, why, who else touches it, how long it is kept, and what you can ask us to do about it. It covers creator accounts, invitations, guests, replies, our AI assistant, and our public site.",
    "It describes what the product actually does today. Where a safeguard is not built yet, this notice says so rather than promising it.",
  ],
  sections: [
    {
      id: "who-we-are",
      title: "1. Who is responsible for your information",
      paragraphs: [
        `Invitica is operated by ${OPERATOR}, an individual based in the Philippines, who is the personal information controller for the information described in section 2 as Invitica's own.`,
        `Accountable person for privacy: ${OPERATOR}. Address: ${OPERATOR_ADDRESS}. Email for any privacy question, request, or complaint: ${CONTACT_EMAIL}.`,
      ],
    },
    {
      id: "roles",
      title: "2. When Invitica decides, and when you do",
      paragraphs: [
        "Invitica is the personal information controller for your creator account, for authentication and session security, for abuse prevention and rate limiting, for account emails, and for the aggregate view counts described below. We decide what is collected for those purposes and why.",
        "For the guest information you enter — names, party groupings, personalized links, replies — you are the personal information controller and Invitica is your personal information processor. You choose whom to invite and what to record about them. We store, process, and deliver that information on your instructions, under section 7 of the Terms of Service.",
        "This matters for a guest who wants to ask a question. We will answer, and we will also tell the creator, because for most guest information the creator is the person who decides.",
      ],
    },
    {
      id: "information",
      title: "3. What information Invitica handles",
      paragraphs: [
        "Creator account information: your name, email address, authentication identifiers, email-confirmation and password-recovery state, your Google account identifier and profile name if you sign in with Google, your workspace, your display preferences, and the record of which document versions you accepted and when.",
        "Invitation information: event titles, host names, dates, schedules, messages, venue names and map coordinates, attire guidance, participant and entourage names, gift or registry details, photographs, and the template and design choices used to render the invitation.",
        "Guest information: recipient or household names, the members of each party, the status of each personalized link, the delivery state you recorded yourself, and each reply — attending or not, party count, an optional short message, and the history of revisions to that reply.",
        "Assistant conversations: the messages you send to Invi, its answers, and — when you use it to organize a guest list — the names in the list you pasted. These are saved to your account so you can return to a conversation, and you can delete them.",
        "Service information: publication versions and job state, media file metadata, daily aggregate view counts per invitation, request-budget and abuse-prevention state, single-use account-deletion tokens stored as a hash, and operational logs.",
        "Invitica's own view counting stores no viewer identifier of any kind — no IP address, user agent, referrer, account, raw URL, personalized token, or unique-person identifier. It counts opens per invitation per day and nothing else. The providers listed in section 8 still process ordinary request data under their own systems.",
      ],
    },
    {
      id: "sources",
      title: "4. Where the information comes from",
      paragraphs: [
        "Most of it comes from you. Some comes from guests who reply. Some comes from Google, if you choose to sign in that way. The rest is generated by the systems that run the service.",
        "A creator may enter another person's name or photograph before that person has any contact with Invitica. That is normal for an invitation, and it is why section 7 of the Terms asks you to confirm you have a basis for it. If you are named in someone's invitation and want to know what is held about you, write to us and we will help.",
      ],
    },
    {
      id: "purposes",
      title: "5. Why the information is used, and on what basis",
      paragraphs: [
        "Philippine data-protection law requires a lawful basis for each purpose. Accepting the Terms of Service is not treated as blanket consent to everything below.",
      ],
      table: {
        headers: ["What we do", "Whose information", "Lawful basis"],
        rows: [
          [
            "Create and run your creator account, confirm your email, and let you recover your password",
            "Creator",
            "Necessary to perform our contract with you",
          ],
          [
            "Store, validate, preview, publish, and deliver your invitation",
            "Creator, and people named in the invitation",
            "Our contract with you; for people you name, your own lawful basis as the controller of that content",
          ],
          [
            "Hold guest parties and personalized links, and receive replies",
            "Guests",
            "Processed on your instructions, on your lawful basis as controller",
          ],
          [
            "Answer your requests to Invi and save your conversations",
            "Creator, and any names you type or paste",
            "Our contract with you for a feature you chose to use",
          ],
          [
            "Send account emails, including the account-deletion link",
            "Creator",
            "Necessary to perform our contract with you",
          ],
          [
            "Record which document versions you accepted, and when",
            "Creator",
            "Our legal obligation to show a lawful basis, and our legitimate interest in accountability",
          ],
          [
            "Show creators how many times an invitation was opened each day",
            "Nobody — the count identifies no person",
            "Our legitimate interest in a useful product",
          ],
          [
            "Protect accounts, links, and public endpoints from abuse",
            "Creators, guests, visitors",
            "Our legitimate interest in a secure service",
          ],
          [
            "Respond to a lawful request from an authority",
            "Anyone concerned",
            "Our legal obligation",
          ],
        ],
      },
    },
    {
      id: "not-done",
      title: "6. What Invitica does not do",
      paragraphs: [
        "Invitica does not sell personal information, does not show advertising, and has no advertising partners.",
        "It runs no product analytics, no session replay, and no guest-level open, read, or click tracking. It does not tell a creator whether a particular guest opened their invitation, because it does not know.",
        "It does not use your content, your guests' information, or your conversations with Invi to train any AI model.",
        "If any of this changes, it will be a new version of this notice with a clear explanation, not a quiet edit.",
      ],
    },
    {
      id: "google",
      title: "7. Google sign-in",
      paragraphs: [
        "Google sign-in is optional and runs through Supabase Auth. Invitica asks Google only for the basic identity needed to sign you in: your Google account identifier, your email address, and your profile name where available.",
        "Invitica does not request or receive your Google Drive files, Gmail, Calendar, contacts, or advertising data, and uses Google user data only to authenticate your account and identify it afterwards. If you would rather not involve Google, use email and password instead.",
      ],
    },
    {
      id: "ai",
      title: "8. Invi and our AI provider",
      paragraphs: [
        "Invi is available only inside a signed-in creator account and never on a published invitation. When you send it a message, the message is sent to Anthropic, our AI provider, along with Invitica's own help material and — depending on what you asked — the invitation you have selected or the guest list you pasted.",
        "Invitica's account with Anthropic is a paid one with model training on our data switched off. Anthropic processes the request to produce an answer and does not use it to train models.",
        "Invi proposes and never writes. Nothing it produces changes your invitation, your guest list, or a published page until you apply it yourself.",
        "Your conversations, including any guest names in them, are saved in Invitica's database so you can return to them. They are visible only to you, you can delete them, and they are removed with your account. They are never linked to your published invitation or shown to any guest.",
        "Invitica logs that an assistant request happened, which kind it was, and whether it succeeded. It does not log your message or the answer.",
      ],
    },
    {
      id: "providers",
      title: "9. Providers and processing outside the Philippines",
      paragraphs: [
        "Invitica is run by one person on managed services. These providers process personal information on our behalf:",
      ],
      table: {
        headers: ["Provider", "What it does for Invitica", "Where it processes"],
        rows: [
          [
            "Supabase",
            "Authentication and the main database, including accounts, invitations, guests, replies, and assistant conversations",
            "Singapore",
          ],
          [
            "Cloudflare",
            "Stores published invitation files and media in private storage, and serves published invitations to guests",
            "Global edge network, outside the Philippines",
          ],
          ["Vercel", "Hosts the creator application and the public site", "Singapore"],
          [
            "Trigger.dev",
            "Runs the background jobs that publish an invitation",
            "Outside the Philippines",
          ],
          [
            "MapTiler",
            "Supplies map tiles, loaded only when someone opens a map",
            "Outside the Philippines",
          ],
          ["Google", "Optional sign-in only", "United States and elsewhere"],
          ["Anthropic", "Produces the AI assistant's answers", "United States"],
          [
            "Resend",
            "Sends Invitica's account emails, including confirmation, password recovery, and the account-deletion link",
            "Asia Pacific (Tokyo)",
          ],
        ],
      },
    },
    {
      id: "transfers",
      title: "10. How we handle transfers abroad",
      paragraphs: [
        "Most of the providers above process information outside the Philippines. Philippine law allows this, and it keeps us accountable to you for information we hand to them.",
        "We choose providers that publish security and data-processing commitments, we pass them only what a task needs, and we remain responsible to you for what happens to it. If you want to know more about a particular provider before you use a feature, write to us.",
      ],
    },
    {
      id: "links",
      title: "11. Published links and personalized links",
      paragraphs: [
        "Published invitations sit at unlisted, hard-to-guess addresses and ask search engines not to index them. Anyone holding a working link can open and forward it. Treat an invitation as shareable, not private, and leave sensitive details out of it.",
        "A personalized guest link carries its token in the part of the address after the `#`, which browsers do not send to a server in an ordinary page request and do not pass on as a referrer. The invitation sends it once, in a no-referrer request, to work out which party is reading. Our database resolves it through a keyed hash rather than by storing the token, and the material needed to rebuild an active link for your own copy button is separately encrypted and reachable only through your signed-in account.",
      ],
    },
    {
      id: "cookies",
      title: "12. Cookies and similar storage",
      paragraphs: [
        "Invitica uses only cookies that the service needs to work. There is no advertising cookie and no product-analytics cookie anywhere in the application.",
      ],
      table: {
        headers: ["Cookie", "What it is for", "How long"],
        rows: [
          [
            "Supabase authentication cookies",
            "Keep you signed in and refresh your session",
            "Until you sign out or the session expires",
          ],
          [
            "invitica-recovery-email, invitica-recovery-verified",
            "Carry a password recovery from one step to the next",
            "The recovery attempt only",
          ],
          [
            "invitica-pending-terms-acceptance",
            "Carries the acceptance you already gave at registration through to email confirmation, signed so it cannot be altered",
            "Up to 24 hours",
          ],
          [
            "invitica-theme",
            "Remembers whether you chose the light or dark appearance",
            "One year",
          ],
        ],
      },
    },
    {
      id: "retention",
      title: "13. How long information is kept",
      paragraphs: [
        "The table below is what the product does today, not a target. Where nothing deletes something automatically, it says so.",
      ],
      table: {
        headers: ["What", "How long it is kept"],
        rows: [
          [
            "Creator account and profile",
            "Until you delete your account. Deletion is immediate and cannot be undone.",
          ],
          [
            "Invitation drafts",
            "Until you delete the invitation or your account. Nothing deletes an inactive draft automatically.",
          ],
          [
            "Guest parties, personalized links, and replies",
            "For the life of the invitation. Deleted with it, and with your account.",
          ],
          [
            "Published invitation files",
            "The guest link is taken down as soon as you delete the invitation or your account. Image files are stored by their content, so a file two invitations happen to share is not removed while the other invitation still needs it.",
          ],
          [
            "Invi conversations",
            "Until you delete them. Deleted with your account. Nothing expires them automatically.",
          ],
          [
            "Account-deletion links",
            "The link expires 30 minutes after it is sent and works once. Only a hash of it is stored.",
          ],
          [
            "Record of which documents you accepted",
            "While your account exists. It is deleted with your account.",
          ],
          [
            "Operational logs",
            "Held by the providers in section 9 under their own default retention. We do not extend it.",
          ],
          [
            "Provider backups",
            "Copies may remain in a provider's backups for a limited period after deletion, then age out.",
          ],
        ],
      },
    },
    {
      id: "security",
      title: "14. How information is protected",
      paragraphs: [
        "Access to creator data is enforced in the database itself through row-level security, so a request that is not yours returns nothing rather than relying on the application to remember. Server actions and database functions are narrow and check ownership. All input is validated at runtime.",
        "Public identifiers are high-entropy and non-sequential. Personalized links resolve through a keyed hash. Recoverable link material is encrypted. Media is stored privately and served through controlled routes. Published snapshots are immutable and served with restrictive security headers.",
        "No system is perfectly secure, and Invitica is one person's service in beta. If something matters more than an invitation should carry, keep it somewhere else.",
      ],
    },
    {
      id: "rights",
      title: "15. Your rights and how to use them",
      paragraphs: [
        "Under the Data Privacy Act you may be informed about how your information is used, object to processing, get a copy of what is held, correct what is wrong, ask for erasure or blocking where the law allows, ask for a portable copy where it applies, claim damages for a violation, and complain to the National Privacy Commission.",
        `Write to ${CONTACT_EMAIL} and say what you want. We will acknowledge you and respond within 15 working days. If a request is complex we will tell you why it needs longer and how much longer.`,
        "Before acting we need to know you are who you say you are. For a creator, replying from your registered email address and confirming one detail of your account is normally enough. For a guest or someone named in an invitation, we will ask for enough to link you to the record without collecting more than we need.",
        "If your request concerns information a creator entered — your name on someone's guest list, your photograph in their invitation — we will answer you and pass the request to that creator, because they decide what the invitation holds. Where we hold the information as a processor, we will act on their instruction and we will not simply ignore you.",
      ],
    },
    {
      id: "children",
      title: "16. Children and family events",
      paragraphs: [
        "You must be 18 or older to hold an Invitica account. Invitica is not for children to use.",
        "Invitations for christenings, birthdays, and family gatherings often name children or show their photographs. If you are the creator, upload that content only when you hold parental authority or the parent's permission, and leave out details a child does not need published — a school, a home address, a routine.",
        `A parent or guardian who wants a child's name or photograph removed from an invitation can write to ${CONTACT_EMAIL}. We will contact the creator, and where the content is in a published invitation we can take that publication offline while it is resolved.`,
      ],
    },
    {
      id: "breach",
      title: "17. If something goes wrong",
      paragraphs: [
        "If a security incident affects personal information and is likely to put someone at real risk, Invitica will notify the National Privacy Commission and the people affected within 72 hours of learning about it, as Philippine rules require. We will say what happened, what information was involved, what we have done, and what you can do.",
        `Report a suspected problem to ${CONTACT_EMAIL}. Say what you saw and when. We would rather look at a false alarm than miss a real one.`,
      ],
    },
    {
      id: "automated",
      title: "18. Automated decisions",
      paragraphs: [
        "Invitica does not use personal information for profiling or for automated decisions that produce legal or similarly significant effects. Template validation, publication checks, rate limits, and abuse controls keep the service working; they do not score a person or decide anything about their rights.",
      ],
    },
    {
      id: "changes",
      title: "19. Changes to this notice",
      paragraphs: [
        "Every version of this notice carries a version number and an effective date. When we change what we collect, why, who processes it, or how long it is kept, we publish a new version.",
        "For a material change we will ask creators to accept it alongside the Terms before continuing, and we will say what changed. Earlier versions are available on request.",
      ],
    },
    {
      id: "complaints",
      title: "20. Complaints",
      paragraphs: [
        `If you are unhappy with how Invitica handled your information, tell us first at ${CONTACT_EMAIL} — we can usually fix it faster than anyone else.`,
        "You also have the right to complain to the National Privacy Commission of the Philippines, whether or not you have come to us first.",
      ],
    },
    {
      id: "contact",
      title: "21. How to reach us",
      paragraphs: [
        `Invitica, operated by ${OPERATOR}. ${OPERATOR_ADDRESS}. Email: ${CONTACT_EMAIL}.`,
        `${OPERATOR} is the accountable person for privacy and answers privacy requests at that address.`,
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
      label: "National Privacy Commission — DPO and data-processing-system registration",
    },
    {
      href: "https://developers.google.com/identity/protocols/oauth2/policies",
      label: "Google OAuth 2.0 policies",
    },
    {
      href: "https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification",
      label: "Google OAuth brand and privacy-policy verification",
    },
  ],
  sourcesNote:
    "These are the primary Philippine rules and provider policies Invitica followed when writing this notice. They are published here so you can read them yourself.",
} as const satisfies LegalDocumentContent;
