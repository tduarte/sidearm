import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * No `"use client"` module may reach a Node built-in, however indirectly.
 *
 * This is not a bundle-size rule. `components/auth-gate.tsx` imported one
 * constant, `MIN_PASSWORD_LENGTH`, from `lib/auth/passwords.ts`; that module
 * imports `node:crypto`, so the browser evaluated `promisify(undefined)` and
 * threw `The "original" argument must be of type Function` *during hydration*.
 * React then unmounted the tree, and every page in the panel rendered "This
 * page couldn't load" — including pages that have nothing to do with
 * passwords. Nothing else catches it: `tsc` and `eslint` both pass, the server
 * render is fine, and the failure only appears in a real browser.
 *
 * The import graph is walked transitively because the bug was one hop deep,
 * and the next one will be two.
 */
const root = process.cwd();

/** Roots that can contain client components. */
const ROOTS = ["app", "components", "hooks", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = ROOTS.filter((r) => existsSync(path.join(root, r))).flatMap((r) =>
  walk(path.join(root, r)),
);

const source = new Map<string, string>();
for (const f of files) source.set(f, readFileSync(f, "utf8"));

const isClient = (f: string) => /^\s*["']use client["']/m.test(source.get(f) ?? "");

/**
 * Value imports of `@/...` only. `import type` and `{ type X }` specifiers are
 * erased before the bundler sees them, so they cannot drag anything in — and
 * treating them as edges would flag every client component that names a
 * server-side type.
 */
function valueImports(text: string): string[] {
  const out: string[] = [];
  const re = /import\s+(type\s+)?([\s\S]*?)from\s*["'](@\/[^"']+)["']/g;
  for (const m of text.matchAll(re)) {
    const [, typeKeyword, clause, spec] = m;
    if (typeKeyword) continue;
    const named = clause.match(/\{([\s\S]*)\}/)?.[1];
    if (named !== undefined) {
      const specifiers = named
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const bare = clause.slice(0, clause.indexOf("{")).replace(/,/g, "").trim();
      // `import { type A, type B } from` erases entirely; `import x, { type A }`
      // does not, because the default binding survives.
      if (!bare && specifiers.length > 0 && specifiers.every((s) => s.startsWith("type "))) {
        continue;
      }
    }
    out.push(spec);
  }
  return out;
}

function resolve(spec: string): string | null {
  const base = path.join(root, spec.slice(2));
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (source.has(candidate)) return candidate;
  }
  return null;
}

/** `node:*`, plus the bare names that are still Node built-ins. */
const NODE_BUILTIN =
  /from\s*["'](node:[^"']+|fs|path|crypto|util|os|child_process|net|http|https|dns|worker_threads|better-sqlite3|ws)["']/;

function nodeImport(text: string): string | null {
  return text.match(NODE_BUILTIN)?.[1] ?? null;
}

describe("client bundle", () => {
  it("never reaches a Node built-in from a client component", () => {
    const offenders: string[] = [];

    for (const entry of files.filter(isClient)) {
      // path[0] is the client component; the rest is how it got there.
      const queue: string[][] = [[entry]];
      const seen = new Set([entry]);

      while (queue.length > 0) {
        const trail = queue.shift()!;
        const file = trail[trail.length - 1];
        const text = source.get(file)!;

        const builtin = nodeImport(text);
        if (builtin) {
          const chain = trail.map((f) => path.relative(root, f)).join("\n    → ");
          offenders.push(`${chain}\n    → imports ${builtin}`);
          break;
        }

        for (const spec of valueImports(text)) {
          const next = resolve(spec);
          if (next && !seen.has(next)) {
            seen.add(next);
            queue.push([...trail, next]);
          }
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `Client components reaching server-only modules:\n\n  ${offenders.join("\n\n  ")}\n\n` +
        "Move the shared value into a module with no node imports " +
        "(see lib/auth/credentials.ts).",
    );
  });

  it("recognises a client component at all", () => {
    // A guard on the guard: if `"use client"` detection breaks, the test above
    // passes vacuously and stops protecting anything.
    assert.ok(files.filter(isClient).length > 20);
  });
});
