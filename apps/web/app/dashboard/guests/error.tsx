"use client";

import { CreatorRouteError } from "../../../src/components/dashboard/CreatorRouteError";

interface GuestsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GuestsError({ reset }: GuestsErrorProps) {
  return (
    <CreatorRouteError
      description="No guest information was changed. Try loading this workspace again."
      reset={reset}
      title="Guests and RSVPs could not be loaded."
    />
  );
}
