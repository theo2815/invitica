import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LittleBlessingsImageField } from "../src/components/invitations/LittleBlessingsImageField";
import {
  removeInvitationImageAction,
  uploadInvitationImageAction,
} from "../src/server/media/actions";
import type { CreatorImageAsset } from "../src/server/media/library";

vi.mock("../src/server/media/actions", () => ({
  removeInvitationImageAction: vi.fn(),
  uploadInvitationImageAction: vi.fn(),
}));

const invitationId = "71000000-0000-4000-8000-000000000001";
const oldAsset = imageAsset("4a000000-0000-4000-8000-000000000001", "/old.webp");
const newAsset = imageAsset("4a000000-0000-4000-8000-000000000002", "/new.webp");

function imageAsset(id: string, url: string): CreatorImageAsset {
  return {
    height: 900,
    id,
    renditions: [{ height: 240, url, width: 320 }],
    role: "hero",
    width: 1200,
  };
}

function uploadResult(asset: CreatorImageAsset) {
  return {
    asset,
    assetId: asset.id,
    height: asset.height,
    status: "uploaded" as const,
    width: asset.width,
  };
}

function chooseFile(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Image input is missing");
  fireEvent.change(input, {
    target: { files: [new File(["image"], "portrait.jpg", { type: "image/jpeg" })] },
  });
  return input;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.mocked(removeInvitationImageAction).mockReset();
  vi.mocked(uploadInvitationImageAction).mockReset();
});

describe("Little Blessings image field", () => {
  it("makes a successful upload available immediately without a list refresh", async () => {
    vi.mocked(uploadInvitationImageAction).mockResolvedValue(uploadResult(newAsset));
    const onAssetRemoved = vi.fn();
    const onAssetUploaded = vi.fn();
    const onChange = vi.fn();
    const { container } = render(
      <LittleBlessingsImageField
        asset={undefined}
        assetId={null}
        imageRole="hero"
        invitationId={invitationId}
        label="the portrait"
        onAssetRemoved={onAssetRemoved}
        onAssetUploaded={onAssetUploaded}
        onChange={onChange}
      />,
    );

    chooseFile(container);

    await waitFor(() => expect(screen.getByText("Picture added.")).toBeDefined());
    expect(onAssetUploaded).toHaveBeenCalledWith(newAsset);
    expect(onChange).toHaveBeenCalledWith(newAsset.id);
    expect(onAssetRemoved).not.toHaveBeenCalled();
    expect(removeInvitationImageAction).not.toHaveBeenCalled();
  });

  it("keeps the existing picture visible and escalates honest copy during a slow replacement", async () => {
    vi.useFakeTimers();
    vi.mocked(uploadInvitationImageAction).mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <LittleBlessingsImageField
        asset={oldAsset}
        assetId={oldAsset.id}
        imageRole="hero"
        invitationId={invitationId}
        label="the portrait"
        onAssetRemoved={vi.fn()}
        onAssetUploaded={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    const input = chooseFile(container);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/old.webp");
    expect(screen.getByRole("button", { name: /Replacing/ }).hasAttribute("disabled")).toBe(true);
    expect(input.disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(screen.getByText(/Still adding this picture/)).toBeDefined();
  });

  it("reports replacement cleanup separately after the new upload succeeds", async () => {
    vi.mocked(uploadInvitationImageAction).mockResolvedValue(uploadResult(newAsset));
    vi.mocked(removeInvitationImageAction).mockResolvedValue({
      message: "Stored copy unavailable.",
      status: "error",
    });
    const onAssetRemoved = vi.fn();
    const onAssetUploaded = vi.fn();
    const onChange = vi.fn();
    const { container } = render(
      <LittleBlessingsImageField
        asset={oldAsset}
        assetId={oldAsset.id}
        imageRole="hero"
        invitationId={invitationId}
        label="the portrait"
        onAssetRemoved={onAssetRemoved}
        onAssetUploaded={onAssetUploaded}
        onChange={onChange}
      />,
    );

    chooseFile(container);

    await waitFor(() => expect(screen.getByText(/new picture is in place/)).toBeDefined());
    expect(onAssetUploaded).toHaveBeenCalledWith(newAsset);
    expect(onChange).toHaveBeenCalledWith(newAsset.id);
    expect(onAssetRemoved).not.toHaveBeenCalled();
  });

  it("keeps the current picture when the server rejects removal", async () => {
    vi.mocked(removeInvitationImageAction).mockResolvedValue({
      message: "This picture could not be removed.",
      status: "error",
    });
    const onAssetRemoved = vi.fn();
    const onChange = vi.fn();
    render(
      <LittleBlessingsImageField
        asset={oldAsset}
        assetId={oldAsset.id}
        imageRole="hero"
        invitationId={invitationId}
        label="the portrait"
        onAssetRemoved={onAssetRemoved}
        onAssetUploaded={vi.fn()}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));

    await waitFor(() =>
      expect(screen.getByText("This picture could not be removed.")).toBeDefined(),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(onAssetRemoved).not.toHaveBeenCalled();
  });
});
