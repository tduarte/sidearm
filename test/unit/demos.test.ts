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

  it("finds demos MatchZy wrote one level down", async () => {
    // matchzy_demo_path defaults to `MatchZy/`, so a plugin-recorded demo lands
    // in a subdirectory. Reading only the top level made installing MatchZy
    // silently empty the Demos card while the files sat right there.
    const demoDir = path.join(dir, "demos");
    mkdirSync(path.join(demoDir, "MatchZy"), { recursive: true });
    writeFileSync(path.join(demoDir, "MatchZy", "pug.dem"), "ccc");

    process.env.CS2_DEMO_DIR = demoDir;
    const { listDemos } = await import("@/lib/cs2/demos");
    const demos = await listDemos();

    const found = demos.find((d) => d.name === "MatchZy/pug.dem");
    assert.ok(found, "expected the subdirectory demo to be listed");
    assert.equal(found.sizeBytes, 3);
    // The panel's own tv_record demos are still there alongside them.
    assert.ok(demos.some((d) => d.name === "new.dem"));
  });

  it("serves a demo from a subdirectory", async () => {
    process.env.CS2_DEMO_DIR = path.join(dir, "demos");
    const { openDemo } = await import("@/lib/cs2/demos");
    const opened = await openDemo("MatchZy/pug.dem");
    assert.ok(opened, "expected a stream for the subdirectory demo");
    assert.equal(opened.sizeBytes, 3);
    opened.stream.on("error", () => {});
    (opened.stream as import("node:fs").ReadStream).destroy();
  });

  it("does not walk further than one level down", async () => {
    // The mount is 70 GB of game files. Finding where a recorder put its demos
    // is the job; crawling the whole tree is not.
    const deep = path.join(dir, "demos", "MatchZy", "backups");
    mkdirSync(deep, { recursive: true });
    writeFileSync(path.join(deep, "buried.dem"), "d");

    process.env.CS2_DEMO_DIR = path.join(dir, "demos");
    const { listDemos } = await import("@/lib/cs2/demos");
    const demos = await listDemos();
    assert.ok(!demos.some((d) => d.name.includes("buried.dem")));
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
