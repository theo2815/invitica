"use client";

import { CreatorRouteError } from "../../../src/components/dashboard/CreatorRouteError";

interface InvitationsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function InvitationsError({ reset }: InvitationsErrorProps) {
  return (
    <CreatorRouteError
      description="Your invitation data was not changed. Try loading this workspace again."
      reset={reset}
      title="Invitations could not be loaded."
    />
  );
}
