import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Keeps `.env.example` and the compose files honest about each other.
 *
 * Two failures this catches, both silent and both landing on the user rather
 * than on us:
 *
 *  - A `${VAR}` added to compose with no entry in `.env.example`. The user
 *    copies the example, the variable is empty, and the container starts with
 *    a blank password or a missing token.
 *  - A variable documented in `.env.example` that no compose file passes
 *    through. The user sets it, nothing happens, and there is no error to
 *    read. `MATCHZY_CONFIG_SECRET` shipped exactly like this.
 *
 * The panel is distributed software; `.env.example` is its interface.
 */
const root = process.cwd();
const read = (f: string) => readFileSync(path.join(root, f), "utf8");

/** `${FOO}`, `${FOO:-default}` — the name only. */
function composeVars(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/\$\{([A-Z0-9_]+)[:}-]/g)].map((m) => m[1]),
  );
}

/** Uncommented `NAME=` lines. */
function documentedVars(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]),
  );
}

const documented = documentedVars(read(".env.example"));
const prod = composeVars(read("docker-compose.yml"));
const dev = composeVars(read("docker-compose.dev.yml"));
const referenced = new Set([...prod, ...dev]);

describe(".env.example and docker-compose", () => {
  it("documents every variable the production stack reads", () => {
    // Production only. The dev stack is for contributors, self-defaults
    // everything, and is never run from a user's `.env` — putting its knobs in
    // the example would just be noise in the file people copy.
    const missing = [...prod].filter((v) => !documented.has(v)).sort();
    assert.deepEqual(
      missing,
      [],
      `docker-compose.yml reads these but .env.example never mentions them: ${missing.join(", ")}`,
    );
  });

  it("passes through every variable it documents", () => {
    // The inert-knob failure: a user sets it, nothing happens, nothing says so.
    const inert = [...documented].filter((v) => !referenced.has(v)).sort();
    assert.deepEqual(
      inert,
      [],
      `.env.example documents these but no compose file passes them to a container: ${inert.join(", ")}`,
    );
  });

  it("keeps the secrets that must not ship with a default", () => {
    // A default here would mean every install that skipped setup shares the
    // same RCON password and log secret.
    const text = read("docker-compose.yml");
    for (const secret of ["RCON_PASSWORD", "LOG_INGEST_SECRET"]) {
      assert.match(
        text,
        new RegExp(`\\$\\{${secret}\\}`),
        `${secret} must be \${${secret}} with no fallback default`,
      );
    }
  });

  it("documents every variable in the README's table", () => {
    // The table is what people actually read; a variable that exists only in
    // .env.example is one nobody discovers.
    const readme = read("README.md");
    const undocumented = [...documented]
      .filter((v) => !readme.includes(`\`${v}\``))
      .sort();
    assert.deepEqual(
      undocumented,
      [],
      `not mentioned anywhere in README.md: ${undocumented.join(", ")}`,
    );
  });
});
