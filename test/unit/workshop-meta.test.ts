import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchWorkshopMeta } from "@/lib/cs2/workshop-meta";

const ok = (body: unknown): typeof fetch =>
  (async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as unknown as typeof fetch;

describe("fetchWorkshopMeta", () => {
  it("reads the fields the map list needs", async () => {
    const meta = await fetchWorkshopMeta(
      "3070602404",
      ok({
        response: {
          publishedfiledetails: [
            {
              result: 1,
              title: "aim_botz - Training",
              preview_url: "https://images.steamusercontent.com/x.jpg",
              file_size: "12345",
              time_updated: 1700000000,
            },
          ],
        },
      }),
    );
    assert.equal(meta?.title, "aim_botz - Training");
    assert.equal(meta?.previewUrl, "https://images.steamusercontent.com/x.jpg");
    assert.equal(meta?.fileSize, 12345);
    assert.equal(meta?.timeUpdated, 1700000000);
  });

  it("returns null for a workshop id that does not exist", async () => {
    // Steam answers result 9 for a mistyped id rather than an HTTP error.
    const meta = await fetchWorkshopMeta(
      "1",
      ok({ response: { publishedfiledetails: [{ result: 9 }] } }),
    );
    assert.equal(meta, null);
  });

  it("returns null instead of throwing when offline", async () => {
    // A LAN panel with no internet must still be able to add a map.
    const offline = (async () => {
      throw new Error("ENOTFOUND api.steampowered.com");
    }) as unknown as typeof fetch;
    assert.equal(await fetchWorkshopMeta("3070602404", offline), null);
  });

  it("survives a malformed response", async () => {
    assert.equal(await fetchWorkshopMeta("1", ok({})), null);
    assert.equal(
      await fetchWorkshopMeta("1", ok({ response: { publishedfiledetails: [] } })),
      null,
    );
  });
});
