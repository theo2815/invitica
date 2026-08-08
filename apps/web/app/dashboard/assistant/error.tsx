"use client";

import { CreatorRouteError } from "../../../src/components/dashboard/CreatorRouteError";

interface AssistantErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * The route's own boundary, which it did not have.
 *
 * Every other creator route carries one; this page threw into the dashboard's generic
 * handler instead, so a workspace that would not load produced a message about the
 * dashboard rather than about Invi. The reassurance is worth stating plainly here: this
 * page reads invitations and writes nothing at all, so a failure to load it cannot have
 * changed an invitation, a draft, or a saved conversation.
 */
export default function AssistantError({ reset }: AssistantErrorProps) {
  return (
    <CreatorRouteError
      description="No invitation, draft, or saved conversation was changed — this page only reads them. Try loading Invi again."
      reset={reset}
      title="Invi could not be loaded."
    />
  );
}
