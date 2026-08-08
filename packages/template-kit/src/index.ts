export type {
  TemplateEditorKey,
  TemplateListing,
  TemplateManifest,
  TemplateOccasion,
  TemplateRendererKey,
} from "./manifest.js";
export {
  templateAccessTierSchema,
  templateEditorKeySchema,
  templateListingSchema,
  templateManifestSchema,
  templateOccasionSchema,
  templateQualityStatusSchema,
  templateRendererKeySchema,
  templateSectionTypeSchema,
  templateStarterDocument,
} from "./manifest.js";
export type { TemplateCatalogEntry } from "./registry.js";
export {
  createTemplateRegistry,
  DuplicateTemplateRegistrationError,
  InvalidTemplateUpgradeError,
  InvalidTemplateVersionChainError,
  migrateTemplateDocument,
  resolveTemplateById,
  resolveTemplateUpgrade,
  resolveTemplateVersion,
  templateCatalog,
  templateRegistry,
  UnknownTemplateError,
} from "./registry.js";
