/**
 * Invitica is in a closed production beta, so the deployed site does not yet accept new users.
 * While this gate is on, **new-account creation, Google sign-in, and password recovery are disabled
 * in production** — the controls are hidden, the routes redirect to sign-in, and the server actions
 * refuse. Existing accounts can still sign in with their email and password, and every flow stays
 * fully available in development so it can be built and tested.
 *
 * Detection uses `NODE_ENV`, the same production signal the rest of the app uses: `next dev` runs as
 * `development` (open), while a production build/deploy runs as `production` (locked). Remove this
 * gate — or change the condition — to reopen public sign-up when the beta ends.
 */
export function publicAuthLocked(): boolean {
  return process.env.NODE_ENV === "production";
}
