"use client";

import { CreatorRouteError } from "../../../src/components/dashboard/CreatorRouteError";

interface SettingsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Loading settings reads the account; it changes nothing. Saying so is the useful part of this
 * message, because the page a creator failed to reach is the one that changes their password.
 */
export default function SettingsError({ reset }: SettingsErrorProps) {
  return (
    <CreatorRouteError
      description="Nothing about your account was changed — this page only reads it. Try loading your settings again."
      reset={reset}
      title="Your settings could not be loaded."
    />
  );
}
