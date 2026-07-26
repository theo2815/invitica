"use client";

import {
  MAX_IMAGE_UPLOAD_BYTES,
  UPLOADABLE_IMAGE_CONTENT_TYPES,
} from "@invitica/invitation-schema";
import { useEffect, useId, useRef, useState } from "react";

import {
  removeInvitationImageAction,
  uploadInvitationImageAction,
} from "../../server/media/actions";
import type { CreatorImageAsset } from "../../server/media/library";
import styles from "./LittleBlessingsDraftEditor.module.css";

type UploadState = "failed" | "idle" | "removing" | "replacing" | "uploading";
type StatusMessage = {
  readonly kind: "error" | "success" | "warning";
  readonly text: string;
};

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
  onAssetRemoved: (assetId: string) => void;
  onAssetUploaded: (asset: CreatorImageAsset) => void;
  onChange: (assetId: string | null) => void;
  /** Not the ARIA role: the media role migration `0015` records for the asset. */
  imageRole: "gallery" | "gift" | "hero";
}

const acceptedTypes = UPLOADABLE_IMAGE_CONTENT_TYPES.join(",");
const maximumMegabytes = Math.floor(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024));
const LONG_UPLOAD_NOTICE_MS = 8_000;

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
  onAssetRemoved,
  onAssetUploaded,
  onChange,
}: LittleBlessingsImageFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const operationInFlightRef = useRef(false);
  const [isTakingLonger, setIsTakingLonger] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const thumbnail = asset?.renditions[0]?.url ?? null;
  const busy = disabled || state === "uploading" || state === "replacing" || state === "removing";
  const chooseButtonLabel =
    state === "uploading"
      ? assetId
        ? "Replacing…"
        : "Adding…"
      : state === "replacing"
        ? "Finishing…"
        : assetId
          ? "Replace"
          : "Add";

  useEffect(() => {
    if (state !== "uploading") {
      setIsTakingLonger(false);
      return;
    }

    const timer = window.setTimeout(() => setIsTakingLonger(true), LONG_UPLOAD_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function upload(file: File) {
    if (disabled || operationInFlightRef.current) return;

    if (file.size === 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setState("failed");
      setMessage({
        kind: "error",
        text: `Choose a JPEG, PNG, or WebP image under ${maximumMegabytes} MB.`,
      });
      return;
    }

    operationInFlightRef.current = true;
    const previousAssetId = assetId;
    setState("uploading");
    setMessage(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("invitationId", invitationId);
    formData.set("role", imageRole);

    let result: Awaited<ReturnType<typeof uploadInvitationImageAction>>;
    try {
      result = await uploadInvitationImageAction(formData);
    } catch {
      setState("failed");
      setMessage({
        kind: "error",
        text: "Check your connection and try adding this picture again.",
      });
      operationInFlightRef.current = false;
      return;
    }

    if (result.status === "error") {
      setState("failed");
      setMessage({ kind: "error", text: result.message });
      operationInFlightRef.current = false;
      return;
    }

    onAssetUploaded(result.asset);
    onChange(result.assetId);

    let previousAssetWasReleased = true;
    if (previousAssetId) {
      setState("replacing");
      try {
        const removal = await removeInvitationImageAction({ assetId: previousAssetId });
        previousAssetWasReleased = removal.status === "removed";
        if (previousAssetWasReleased) onAssetRemoved(previousAssetId);
      } catch {
        previousAssetWasReleased = false;
      }
    }

    setState("idle");
    setMessage(
      previousAssetWasReleased
        ? { kind: "success", text: previousAssetId ? "Picture replaced." : "Picture added." }
        : {
            kind: "warning",
            text: "The new picture is in place. The previous copy could not be released yet.",
          },
    );
    operationInFlightRef.current = false;
  }

  async function remove() {
    if (!assetId || disabled || operationInFlightRef.current) return;

    operationInFlightRef.current = true;
    setState("removing");
    setMessage(null);

    try {
      const result = await removeInvitationImageAction({ assetId });
      if (result.status === "error") {
        setState("failed");
        setMessage({ kind: "error", text: result.message });
        return;
      }

      onChange(null);
      onAssetRemoved(assetId);
      setState("idle");
      setMessage({ kind: "success", text: "Picture removed." });
    } catch {
      setState("failed");
      setMessage({
        kind: "error",
        text: "Check your connection and try removing this picture again.",
      });
    } finally {
      operationInFlightRef.current = false;
    }
  }

  return (
    <div
      aria-busy={state === "uploading" || state === "replacing" || state === "removing"}
      className={styles.imageSlot}
    >
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
          disabled={busy}
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
            {chooseButtonLabel}
            <span className={styles.visuallyHidden}> {label}</span>
          </button>
          {assetId && allowRemove ? (
            <button
              className={styles.imageButton}
              disabled={busy}
              onClick={() => void remove()}
              type="button"
            >
              {state === "removing" ? "Removing…" : "Remove"}
              <span className={styles.visuallyHidden}> {label}</span>
            </button>
          ) : null}
        </div>

        <p
          aria-live="polite"
          className={styles.imageStatus}
          data-kind={message?.kind ?? (state === "failed" ? "error" : "info")}
          role="status"
        >
          {state === "uploading"
            ? isTakingLonger
              ? "Still adding this picture. Keep this tab open; larger photographs need more time on mobile data."
              : "Adding this picture. Larger photographs take longer on mobile data."
            : state === "replacing"
              ? "The new picture is ready. Finishing the replacement…"
              : state === "removing"
                ? "Removing this picture…"
                : (message?.text ?? `JPEG, PNG, or WebP up to ${maximumMegabytes} MB.`)}
        </p>
      </div>
    </div>
  );
}
