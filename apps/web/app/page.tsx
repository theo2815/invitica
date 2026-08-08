import { templateCatalog } from "@invitica/template-kit";

import { LandingConcept } from "../src/components/LandingConcept";
import { getOptionalConfirmedUser } from "../src/server/auth/session";

export default async function HomePage() {
  const session = await getOptionalConfirmedUser();

  return <LandingConcept authenticated={Boolean(session)} templates={templateCatalog} />;
}
