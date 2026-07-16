import { templateCatalog } from "@invitica/template-kit";

import { LandingConcept } from "../src/components/LandingConcept";

export default function HomePage() {
  return <LandingConcept templates={templateCatalog} />;
}
