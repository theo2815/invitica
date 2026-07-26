"use client";

import { CreatorRouteError } from "../../src/components/dashboard/CreatorRouteError";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ reset }: DashboardErrorProps) {
  return (
    <CreatorRouteError
      description="Your invitation data was not changed. Try loading the creator workspace again."
      reset={reset}
      title="The creator workspace could not be loaded."
    />
  );
}
