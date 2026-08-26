import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeServerError } from "@/lib/api/route";

describe("describeServerError", () => {
  it("names the Docker socket proxy and what still works", () => {
    // What dockerode throws when the proxy container is gone. Previously this
    // reached the browser as a bare `500 Internal Server Error`, and the
    // lifecycle buttons simply did nothing.
    const msg = describeServerError(
      new Error("connect ECONNREFUSED docker-proxy:2375"),
    );
    assert.match(msg, /Docker socket proxy is unreachable/);
    assert.match(msg, /RCON, chat and the console are unaffected/);
  });

  it("does not blame Docker for an unrelated connection failure", () => {
    const msg = describeServerError(new Error("connect ECONNREFUSED 1.2.3.4:80"));
    assert.doesNotMatch(msg, /Docker socket proxy/);
    assert.match(msg, /unreachable/);
  });

  it("explains a missing container", () => {
    const msg = describeServerError(new Error("No such container: cs2"));
    assert.match(msg, /no container named/i);
  });

  it("passes RCON errors through — they already read well", () => {
    const msg = describeServerError(
      new Error('Command "quit" is not permitted from the panel'),
    );
    assert.equal(msg, 'Command "quit" is not permitted from the panel');
  });

  it("never returns an empty string", () => {
    assert.ok(describeServerError(new Error("")).length > 0);
    assert.ok(describeServerError(undefined).length > 0);
    assert.ok(describeServerError({}).length > 0);
  });
});
