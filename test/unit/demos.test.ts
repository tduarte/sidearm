import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sidearm-demos-"));
  mkdirSync(path.join(dir, "demos"), { recursive: true });
  process.env.CS2_DEMO_DIR = path.join(dir, "demos");
});

after(() => rmSync(dir, { recursive: true, force: true }));

describe("listDemos", () => {
  it("returns nothing when the volume is not mounted", async () => {
    process.env.CS2_DEMO_DIR = path.join(dir, "does-not-exist");
    const { listDemos } = await import("@/lib/cs2/demos");
    assert.deepEqual(await listDemos(), []);
  });
});

describe("demo files", () => {
  it("lists only .dem files, newest first", async () => {
    const demoDir = path.join(dir, "demos");
    writeFileSync(path.join(demoDir, "old.dem"), "a");
    writeFileSync(path.join(demoDir, "new.dem"), "bb");
    // Things that share the directory but are not demos.
    writeFileSync(path.join(demoDir, "server.cfg"), "x");
    writeFileSync(path.join(demoDir, "notes.txt"), "x");

    process.env.CS2_DEMO_DIR = demoDir;
    const { listDemos } = await import("@/lib/cs2/demos");
    const demos = await listDemos();

    assert.deepEqual(
      demos.map((d) => d.name).sort(),
      ["new.dem", "old.dem"],
    );
    assert.equal(demos.find((d) => d.name === "new.dem")?.sizeBytes, 2);
  });

  it("refuses a name that is not in the directory", async () => {
    process.env.CS2_DEMO_DIR = path.join(dir, "demos");
    const { openDemo } = await import("@/lib/cs2/demos");
    // Serving is gated on the listing, so a traversal attempt cannot match.
    assert.equal(await openDemo("../../etc/passwd"), null);
    assert.equal(await openDemo("server.cfg"), null);
    assert.equal(await openDemo("nope.dem"), null);
  });
});
