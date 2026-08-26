/**
 * Minimal CIDR matching for IPv4 and IPv6.
 *
 * Lives here rather than leaning on `node:net` because the caller
 * (`proxy.ts`) runs on the Edge runtime, where node builtins are unavailable.
 */

/**
 * Strips the decorations Node puts on a socket address: the `::ffff:` prefix on
 * IPv4-mapped IPv6 peers, and the `%eth0` zone id on link-local ones.
 */
export function normalizeAddr(addr: string): string {
  let out = addr.trim();
  const zone = out.indexOf("%");
  if (zone !== -1) out = out.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(out);
  return mapped ? mapped[1] : out;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    // Multiply rather than shift: `<<` works on signed 32-bit ints, so a
    // first octet above 127 would produce a negative number.
    n = n * 256 + v;
  }
  return n;
}

function ipv6ToBytes(ip: string): Uint8Array | null {
  if (ip.indexOf(":") === -1) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const expand = (chunk: string): number[] | null => {
    if (chunk === "") return [];
    const out: number[] = [];
    const groups = chunk.split(":");
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i];
      // A trailing dotted-quad, as in `::ffff:10.0.0.1`, occupies two groups.
      if (g.indexOf(".") !== -1) {
        if (i !== groups.length - 1) return null;
        const v4 = ipv4ToInt(g);
        if (v4 === null) return null;
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      out.push(Number.parseInt(g, 16));
    }
    return out;
  };

  const head = expand(halves[0]);
  const tail = halves.length === 2 ? expand(halves[1]) : [];
  if (head === null || tail === null) return null;

  let groups: number[];
  if (halves.length === 2) {
    const gap = 8 - head.length - tail.length;
    if (gap < 0) return null;
    groups = [...head, ...new Array<number>(gap).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    bytes[i * 2] = (groups[i] >>> 8) & 0xff;
    bytes[i * 2 + 1] = groups[i] & 0xff;
  }
  return bytes;
}

function bytesSharePrefix(a: Uint8Array, b: Uint8Array, bits: number): boolean {
  const whole = Math.floor(bits / 8);
  for (let i = 0; i < whole; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  const rest = bits % 8;
  if (rest === 0) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return (a[whole] & mask) === (b[whole] & mask);
}

/**
 * True when `addr` falls inside `cidr`. A bare address (no `/`) is treated as a
 * single host. Anything unparseable is a non-match rather than an error — a
 * typo in the config must never widen access.
 */
export function addrInCidr(addr: string, cidr: string): boolean {
  const target = normalizeAddr(addr);
  const slash = cidr.lastIndexOf("/");
  const network = normalizeAddr(slash === -1 ? cidr : cidr.slice(0, slash));
  const bitsRaw = slash === -1 ? null : cidr.slice(slash + 1);
  // `Number("")` is 0, so an empty suffix would otherwise read as `/0` and match
  // every address on the internet. A trailing-slash typo must never widen access.
  if (bitsRaw !== null && bitsRaw.trim() === "") return false;

  const t4 = ipv4ToInt(target);
  const n4 = ipv4ToInt(network);
  if (t4 !== null && n4 !== null) {
    const bits = bitsRaw === null ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const size = 2 ** (32 - bits);
    return Math.floor(t4 / size) === Math.floor(n4 / size);
  }

  const t6 = ipv6ToBytes(target);
  const n6 = ipv6ToBytes(network);
  if (t6 !== null && n6 !== null) {
    const bits = bitsRaw === null ? 128 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 128) return false;
    return bytesSharePrefix(t6, n6, bits);
  }

  // Mixed families, or either side unparseable.
  return false;
}

/** Splits a comma/whitespace separated CIDR list, dropping empty entries. */
export function parseCidrList(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}
