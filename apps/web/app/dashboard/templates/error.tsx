"use client";

import { CreatorRouteError } from "../../../src/components/dashboard/CreatorRouteError";

interface TemplatesErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TemplatesError({ reset }: TemplatesErrorProps) {
  return (
    <CreatorRouteError
      description="Your invitation data was not changed. Try loading the template collection again."
      reset={reset}
      title="Templates could not be loaded."
    />
  );
}
