import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/api/creator/media/[assetId]/[rendition]/route";
import { getOptionalConfirmedUser } from "../src/server/auth/session";
import { R2MediaObjectStore } from "../src/server/media/object-store";

vi.mock("../src/server/auth/session", () => ({ getOptionalConfirmedUser: vi.fn() }));
vi.mock("../src/server/media/object-store", () => ({
  R2MediaObjectStore: vi.fn(),
  readR2MediaConfig: vi.fn().mockReturnValue({}),
}));

const assetId = "45000000-0000-4000-8000-000000000002";
const bytes = new Uint8Array([82, 73, 70, 70]);
const renditions = [
  { byteLength: 4, height: 480, sha256: "a".repeat(64), width: 320 },
  { byteLength: 9, height: 960, sha256: "b".repeat(64), width: 640 },
];

function mockSession(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const secondEq = vi.fn().mockReturnValue({ maybeSingle });
  const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
  const select = vi.fn().mockReturnValue({ eq: firstEq });
  const from = vi.fn().mockReturnValue({ select });

  vi.mocked(getOptionalConfirmedUser).mockResolvedValue({
    supabase: { from } as never,
    user: {} as never,
  });

  return { firstEq, from, select };
}

function mockStore(body: Uint8Array | null) {
  const get = vi.fn().mockResolvedValue(body);
  // The route constructs the store, so the stub has to be constructible too.
  vi.mocked(R2MediaObjectStore).mockImplementation(function stub() {
    return { get };
  } as never);
  return get;
}

function requestFor(id: string, rendition: string) {
  return GET(new Request(`https://invitica.app/api/creator/media/${id}/${rendition}`), {
    params: Promise.resolve({ assetId: id, rendition }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("owner-only creator media route", () => {
  it("streams the owner's private rendition without letting it be cached or sniffed", async () => {
    mockSession({ renditions });
    const get = mockStore(bytes);

    const response = await requestFor(assetId, "w640.webp");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(get).toHaveBeenCalledWith(`media/renditions/v1/${assetId}/w640.webp`);
  });

  it("refuses a signed-out request before touching storage", async () => {
    vi.mocked(getOptionalConfirmedUser).mockResolvedValue(null);
    const get = mockStore(bytes);

    const response = await requestFor(assetId, "w640.webp");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(get).not.toHaveBeenCalled();
  });

  it("treats another workspace's asset as absent", async () => {
    mockSession(null);
    const get = mockStore(bytes);

    const response = await requestFor(assetId, "w640.webp");

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("only serves widths the asset actually has", async () => {
    mockSession({ renditions });
    const get = mockStore(bytes);

    const response = await requestFor(assetId, "w1280.webp");

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects a malformed asset id or rendition name", async () => {
    mockSession({ renditions });
    mockStore(bytes);

    const badId = await requestFor("../../etc/passwd", "w640.webp");
    const badRendition = await requestFor(assetId, "original.jpg");

    expect([badId.status, badRendition.status]).toEqual([404, 404]);
  });

  it("returns the same bare 404 when the stored object is missing", async () => {
    mockSession({ renditions });
    mockStore(null);

    const response = await requestFor(assetId, "w320.webp");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("reads only the ready row for the requested asset", async () => {
    const { from, select, firstEq } = mockSession({ renditions });
    mockStore(bytes);

    await requestFor(assetId, "w320.webp");

    expect(from).toHaveBeenCalledWith("invitation_media_assets");
    expect(select).toHaveBeenCalledWith("renditions");
    expect(firstEq).toHaveBeenCalledWith("id", assetId);
  });
});
