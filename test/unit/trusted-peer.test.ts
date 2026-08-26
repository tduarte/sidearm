import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addrInCidr, normalizeAddr, parseCidrList } from "@/lib/net/cidr";
import { isTrustedPeer } from "@/lib/auth";

/** Runs `fn` with PANEL_TRUSTED_CIDRS set, restoring it afterwards. */
function withCidrs(value: string | undefined, fn: () => void) {
  const prev = process.env.PANEL_TRUSTED_CIDRS;
  if (value === undefined) delete process.env.PANEL_TRUSTED_CIDRS;
  else process.env.PANEL_TRUSTED_CIDRS = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.PANEL_TRUSTED_CIDRS;
    else process.env.PANEL_TRUSTED_CIDRS = prev;
  }
}

describe("normalizeAddr", () => {
  it("unwraps IPv4-mapped IPv6, which is what Node reports on a dual-stack socket", () => {
    assert.equal(normalizeAddr("::ffff:192.168.4.31"), "192.168.4.31");
    assert.equal(normalizeAddr("::FFFF:10.0.0.1"), "10.0.0.1");
  });

  it("strips the zone id off link-local addresses", () => {
    assert.equal(normalizeAddr("fe80::1%eth0"), "fe80::1");
  });

  it("leaves plain addresses alone", () => {
    assert.equal(normalizeAddr("192.168.4.31"), "192.168.4.31");
    assert.equal(normalizeAddr("2001:db8::1"), "2001:db8::1");
  });
});

describe("addrInCidr — IPv4", () => {
  it("matches inside the prefix and rejects outside it", () => {
    assert.equal(addrInCidr("192.168.4.31", "192.168.4.0/22"), true);
    assert.equal(addrInCidr("192.168.7.255", "192.168.4.0/22"), true);
    assert.equal(addrInCidr("192.168.8.1", "192.168.4.0/22"), false);
    assert.equal(addrInCidr("192.168.3.255", "192.168.4.0/22"), false);
  });

  it("handles a first octet above 127, where a signed shift would go negative", () => {
    assert.equal(addrInCidr("200.0.0.5", "200.0.0.0/24"), true);
    assert.equal(addrInCidr("200.0.1.5", "200.0.0.0/24"), false);
  });

  it("treats a bare address as a single host", () => {
    assert.equal(addrInCidr("10.0.0.7", "10.0.0.7"), true);
    assert.equal(addrInCidr("10.0.0.8", "10.0.0.7"), false);
  });

  it("honours /32 and /0", () => {
    assert.equal(addrInCidr("10.0.0.7", "10.0.0.7/32"), true);
    assert.equal(addrInCidr("10.0.0.8", "10.0.0.7/32"), false);
    assert.equal(addrInCidr("8.8.8.8", "0.0.0.0/0"), true);
  });

  it("matches an IPv4-mapped peer against an IPv4 CIDR", () => {
    assert.equal(addrInCidr("::ffff:192.168.4.31", "192.168.4.0/22"), true);
  });
});

describe("addrInCidr — IPv6", () => {
  it("matches on the prefix", () => {
    assert.equal(addrInCidr("2001:db8::1", "2001:db8::/32"), true);
    assert.equal(addrInCidr("2001:db9::1", "2001:db8::/32"), false);
    assert.equal(addrInCidr("fd00::5", "fd00::/8"), true);
  });

  it("compares sub-byte prefix lengths correctly", () => {
    assert.equal(addrInCidr("2001:db8:8000::1", "2001:db8:8000::/33"), true);
    assert.equal(addrInCidr("2001:db8:0000::1", "2001:db8:8000::/33"), false);
  });
});

describe("addrInCidr — hostile and malformed input", () => {
  it("never matches across address families", () => {
    assert.equal(addrInCidr("192.168.4.31", "2001:db8::/32"), false);
    assert.equal(addrInCidr("2001:db8::1", "192.168.4.0/22"), false);
  });

  it("rejects rather than widens on a malformed CIDR", () => {
    for (const bad of ["", "garbage", "192.168.4.0/", "192.168.4.0/33",
                       "192.168.4.0/-1", "192.168.4.0/abc", "999.1.1.1/24"]) {
      assert.equal(addrInCidr("192.168.4.31", bad), false, `should reject ${bad}`);
    }
  });

  it("rejects a malformed peer address", () => {
    for (const bad of ["", "not-an-ip", "192.168.4", "192.168.4.999"]) {
      assert.equal(addrInCidr(bad, "192.168.4.0/22"), false, `should reject ${bad}`);
    }
  });
});

describe("parseCidrList", () => {
  it("splits on commas and whitespace, dropping blanks", () => {
    assert.deepEqual(parseCidrList("10.0.0.0/8, 192.168.0.0/16"), ["10.0.0.0/8", "192.168.0.0/16"]);
    assert.deepEqual(parseCidrList("  10.0.0.0/8 ,,  fd00::/8  "), ["10.0.0.0/8", "fd00::/8"]);
    assert.deepEqual(parseCidrList(""), []);
  });
});

describe("isTrustedPeer", () => {
  it("denies everything when unconfigured, so the default is unchanged", () => {
    withCidrs(undefined, () => {
      assert.equal(isTrustedPeer("192.168.4.31"), false);
      assert.equal(isTrustedPeer("127.0.0.1"), false);
    });
  });

  it("denies everything when configured empty", () => {
    withCidrs("", () => assert.equal(isTrustedPeer("192.168.4.31"), false));
  });

  it("trusts a peer in any one of several ranges", () => {
    withCidrs("192.168.4.0/22, 10.9.0.0/16", () => {
      assert.equal(isTrustedPeer("192.168.5.10"), true);
      assert.equal(isTrustedPeer("10.9.1.1"), true);
      assert.equal(isTrustedPeer("10.10.1.1"), false);
      assert.equal(isTrustedPeer("8.8.8.8"), false);
    });
  });

  it("denies a missing address", () => {
    withCidrs("192.168.4.0/22", () => {
      assert.equal(isTrustedPeer(null), false);
      assert.equal(isTrustedPeer(undefined), false);
      assert.equal(isTrustedPeer(""), false);
    });
  });

  it("does not let a public peer inherit trust from a listed private range", () => {
    withCidrs("192.168.4.0/22", () => {
      // The exact shape of a spoof attempt: a WAN address that merely *contains*
      // trusted-looking text must not match.
      assert.equal(isTrustedPeer("203.0.113.9"), false);
      assert.equal(isTrustedPeer("192.168.4.31.evil.com"), false);
    });
  });
});
