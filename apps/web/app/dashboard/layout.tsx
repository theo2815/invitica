import type { ReactNode } from "react";

import { CreatorShell } from "../../src/components/dashboard/CreatorShell";
import { requireConfirmedUser } from "../../src/server/auth/session";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user } = await requireConfirmedUser();

  return (
    <CreatorShell email={user.email} metadata={user.user_metadata}>
      {children}
    </CreatorShell>
  );
}
