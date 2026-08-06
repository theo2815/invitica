import { account } from "./account";
import { assistant } from "./assistant";
import { editing } from "./editing";
import { gettingStarted } from "./getting-started";
import { guests } from "./guests";
import { publishing } from "./publishing";
import { rsvps } from "./rsvps";

/**
 * The curated help material the assistant answers from, and nothing else.
 *
 * The order is written out rather than derived, because this string is the cached prefix
 * of every assistant request. A prefix that reorders itself — because a directory listing
 * came back differently, or an import was sorted — is a prefix that never gets a cache hit
 * and quietly costs full price on every message.
 *
 * What belongs here: what a creator can do, where the control is, what a limit is, and
 * what Invitica does not do yet. What does not: how any of it is built, which provider
 * stores what, any credential, and anything from the project's internal notes. The
 * assistant repeats this material to creators, so treat every line as published copy.
 */
export const HELP_CORPUS = [gettingStarted, editing, publishing, guests, rsvps, assistant, account]
  .join("\n\n")
  .trim();
