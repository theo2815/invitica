import type { InvitationDocument } from "@invitica/invitation-schema";
import type { TemplateRendererKey } from "@invitica/template-kit";

import type { InvitationPublicationStatus } from "../../server/invitations/publications";
import type { CreatorImageAsset } from "../../server/media/library";
import type { AvailableTemplateUpgrade } from "./TemplateUpgradePanel";

export interface InvitationEditorProps {
  initialAssets?: readonly CreatorImageAsset[];
  initialDocument: InvitationDocument;
  initialPublication?: InvitationPublicationStatus;
  initialRevision: number;
  invitationId: string;
  rendererKey: TemplateRendererKey;
  templateUpgrade?: AvailableTemplateUpgrade | null;
}
