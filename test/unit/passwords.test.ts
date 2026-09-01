import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "@/lib/auth/passwords";

describe("password hashing", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    assert.equal(await verifyPassword("correct-horse-battery", hash), true);
    assert.equal(await verifyPassword("Correct-horse-battery", hash), false);
    assert.equal(await verifyPassword("", hash), false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same-password-here");
    const b = await hashPassword("same-password-here");
    assert.notEqual(a, b);
    assert.equal(await verifyPassword("same-password-here", a), true);
    assert.equal(await verifyPassword("same-password-here", b), true);
  });

  it("stores its parameters, so the cost can be raised without a flag day", async () => {
    const hash = await hashPassword("some-password-x");
    const [scheme, n, r, p] = hash.split("$");
    assert.equal(scheme, "scrypt");
    assert.equal(Number(n), 16384);
    assert.equal(Number(r), 8);
    assert.equal(Number(p), 1);
    assert.equal(hash.split("$").length, 6);
  });

  it("normalises unicode, so the same typed password verifies either way", async () => {
    // U+00E9 vs e + U+0301 look identical and can differ by keyboard or OS.
    const composed = "café-password-1";
    const decomposed = composed.normalize("NFD");
    assert.notEqual(composed, decomposed);
    const hash = await hashPassword(composed);
    assert.equal(await verifyPassword(decomposed, hash), true);
  });

  it("returns false rather than throwing on a corrupt stored hash", async () => {
    for (const bad of ["", "nonsense", "scrypt$1$2$3", "scrypt$a$b$c$d$e", "argon2$1$2$3$4$5"]) {
      assert.equal(await verifyPassword("whatever", bad), false, bad);
    }
  });
});

describe("credential rules", () => {
  it("rejects passwords below the stated minimum", () => {
    assert.ok(validatePassword("x".repeat(MIN_PASSWORD_LENGTH - 1)));
    assert.equal(validatePassword("x".repeat(MIN_PASSWORD_LENGTH)), null);
  });

  it("rejects an absurdly long password rather than burning CPU on it", () => {
    assert.ok(validatePassword("x".repeat(257)));
  });

  it("accepts ordinary usernames and rejects ones that would confuse a URL", () => {
    for (const ok of ["thiago", "mod_2", "a.b-c", "ABC"]) {
      assert.equal(validateUsername(ok), null, ok);
    }
    for (const bad of ["ab", "x".repeat(33), "has space", "semi;colon", "sl/ash", ""]) {
      assert.ok(validateUsername(bad), bad);
    }
  });
});
