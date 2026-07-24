"use server";

import { randomUUID } from "node:crypto";

import { MAX_IMAGE_UPLOAD_BYTES } from "@invitica/invitation-schema";

import { ensurePersonalWorkspace } from "../auth/session";
import { R2MediaObjectStore, readR2MediaConfig } from "./object-store";
import {
  invitationImageRoleSchema,
  MediaAuthorizationError,
  MediaConflictError,
  MediaValidationError,
  removeInvitationImage,
  uploadInvitationImage,
} from "./uploads";

export type UploadInvitationImageActionResult =
  | {
      readonly assetId: string;
      readonly height: number;
      readonly width: number;
      readonly status: "uploaded";
    }
  | { readonly message: string; readonly status: "error" };

export type RemoveInvitationImageActionResult =
  | { readonly status: "removed" }
  | { readonly message: string; readonly status: "error" };

export async function uploadInvitationImageAction(
  formData: FormData,
): Promise<UploadInvitationImageActionResult> {
  const invitationId = formData.get("invitationId");
  const roleValue = formData.get("role");
  const file = formData.get("file");

  const role = invitationImageRoleSchema.safeParse(roleValue);
  if (typeof invitationId !== "string" || !role.success || !(file instanceof File)) {
    return {
      message: "This image request is no longer valid. Refresh and try again.",
      status: "error",
    };
  }

  if (file.size === 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return { message: "Choose an image within the allowed size.", status: "error" };
  }

  const { error: workspaceError, workspaceId, supabase } = await ensurePersonalWorkspace();
  if (workspaceError || !workspaceId) {
    return { message: "Your workspace is unavailable. Refresh and try again.", status: "error" };
  }

  let store: R2MediaObjectStore;
  try {
    store = new R2MediaObjectStore(readR2MediaConfig());
  } catch {
    return { message: "Image uploads are not available right now.", status: "error" };
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const uploaded = await uploadInvitationImage(supabase, store, {
      assetId: randomUUID(),
      data,
      invitationId,
      role: role.data,
    });
    return { ...uploaded, status: "uploaded" };
  } catch (error: unknown) {
    if (error instanceof MediaValidationError) {
      return { message: error.message, status: "error" };
    }
    if (error instanceof MediaAuthorizationError || error instanceof MediaConflictError) {
      return { message: error.message, status: "error" };
    }
    return { message: "This image could not be uploaded. Try again.", status: "error" };
  }
}

export async function removeInvitationImageAction(
  input: unknown,
): Promise<RemoveInvitationImageActionResult> {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof (input as { assetId?: unknown }).assetId !== "string"
  ) {
    return { message: "This request is no longer valid.", status: "error" };
  }

  const { error: workspaceError, workspaceId, supabase } = await ensurePersonalWorkspace();
  if (workspaceError || !workspaceId) {
    return { message: "Your workspace is unavailable. Refresh and try again.", status: "error" };
  }

  try {
    await removeInvitationImage(supabase, { assetId: (input as { assetId: string }).assetId });
    return { status: "removed" };
  } catch (error: unknown) {
    if (error instanceof MediaAuthorizationError) {
      return { message: error.message, status: "error" };
    }
    return { message: "This image could not be removed. Try again.", status: "error" };
  }
}
