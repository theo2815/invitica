"use client";

import {
  MAX_IMAGE_UPLOAD_BYTES,
  UPLOADABLE_IMAGE_CONTENT_TYPES,
} from "@invitica/invitation-schema";
import { useId, useRef, useState } from "react";

import {
  removeInvitationImageAction,
  uploadInvitationImageAction,
} from "../../server/media/actions";
import type { CreatorImageAsset } from "../../server/media/library";
import styles from "./LittleBlessingsDraftEditor.module.css";

type UploadState = "failed" | "idle" | "removing" | "uploading";

interface LittleBlessingsImageFieldProps {
  /** Hidden when the collection row above already owns removal. */
  allowRemove?: boolean;
  assetId: string | null;
  /** The resolved asset when its renditions are already known to the editor. */
  asset: CreatorImageAsset | undefined;
  disabled?: boolean;
  invitationId: string;
  /** Names this slot for assistive technology, e.g. "the baby portrait". */
  label: string;
  onAssetsChanged: () => Promise<void>;
  onChange: (assetId: string | null) => void;
  /** Not the ARIA role: the media role migration `0015` records for the asset. */
  imageRole: "gallery" | "gift" | "hero";
}

const acceptedTypes = UPLOADABLE_IMAGE_CONTENT_TYPES.join(",");
const maximumMegabytes = Math.floor(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024));

/**
 * One creator image slot: choose, replace, and remove, wired to the owner-
 * authorized Batch 2 media actions. Thumbnails come from the same private
 * renditions the editor preview uses, through the owner-only media route.
 *
 * Replacing records a new asset first and only then releases the old one, so a
 * failed upload never leaves the invitation without its picture.
 */
export function LittleBlessingsImageField({
  allowRemove = true,
  asset,
  assetId,
  disabled = false,
  imageRole,
  invitationId,
  label,
  onAssetsChanged,
  onChange,
}: LittleBlessingsImageFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const thumbnail = asset?.renditions[0]?.url ?? null;
  const busy = disabled || state === "uploading" || state === "removing";

  async function releasePreviousAsset(previousAssetId: string) {
    const result = await removeInvitationImageAction({ assetId: previousAssetId });
    return result.status === "removed";
  }

  async function upload(file: File) {
    if (file.size === 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setState("failed");
      setMessage(`Choose a JPEG, PNG, or WebP image under ${maximumMegabytes} MB.`);
      return;
    }

    const previousAssetId = assetId;
    setState("uploading");
    setMessage(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("invitationId", invitationId);
    formData.set("role", imageRole);

    try {
      const result = await uploadInvitationImageAction(formData);

      if (result.status === "error") {
        setState("failed");
        setMessage(result.message);
        return;
      }

      onChange(result.assetId);
      await onAssetsChanged();
      setState("idle");

      if (previousAssetId && !(await releasePreviousAsset(previousAssetId))) {
        setMessage("The new picture is in place. The previous copy could not be released yet.");
      } else {
        setMessage(null);
      }
    } catch {
      setState("failed");
      setMessage("Check your connection and try adding this picture again.");
    }
  }

  async function remove() {
    if (!assetId) return;

    setState("removing");
    setMessage(null);
    onChange(null);

    try {
      if (!(await releasePreviousAsset(assetId))) {
        setMessage("The picture was removed here. Its stored copy could not be released yet.");
      }
      await onAssetsChanged();
    } catch {
      setMessage("The picture was removed here. Its stored copy could not be released yet.");
    }

    setState("idle");
  }

  return (
    <div className={styles.imageSlot}>
      <div className={styles.imageFrame}>
        {thumbnail ? (
          // The visible label beside this control names the picture, so the
          // thumbnail itself adds nothing a screen reader needs. It stays a
          // plain <img>: next/image would route this owner-only, no-store draft
          // rendition through the shared image optimizer.
          // biome-ignore lint/performance/noImgElement: owner-only private media, not optimizable
          <img alt="" height={asset?.height} src={thumbnail} width={asset?.width} />
        ) : (
          <span>{state === "uploading" ? "Adding…" : "No picture yet"}</span>
        )}
      </div>

      <div className={styles.imageControls}>
        <input
          accept={acceptedTypes}
          className={styles.visuallyHidden}
          id={inputId}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
          ref={inputRef}
          type="file"
        />

        <div className={styles.imageActions}>
          <button
            className={styles.imageButton}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {assetId ? "Replace" : "Add"}
            <span className={styles.visuallyHidden}> {label}</span>
          </button>
          {assetId && allowRemove ? (
            <button
              className={styles.imageButton}
              disabled={busy}
              onClick={() => void remove()}
              type="button"
            >
              Remove
              <span className={styles.visuallyHidden}> {label}</span>
            </button>
          ) : null}
        </div>

        <p
          aria-live="polite"
          className={styles.imageStatus}
          data-kind={state === "failed" ? "error" : "info"}
        >
          {state === "uploading"
            ? "Adding this picture. Larger photographs take longer on mobile data."
            : state === "removing"
              ? "Removing this picture…"
              : (message ?? `JPEG, PNG, or WebP up to ${maximumMegabytes} MB.`)}
        </p>
      </div>
    </div>
  );
}
