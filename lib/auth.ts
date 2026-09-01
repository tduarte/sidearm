/**
 * Shared auth constants and a constant-time comparison.
 *
 * The hand-rolled compare predates Next 16, when `proxy.ts` ran on the Edge
 * runtime and `node:crypto.timingSafeEqual` was unavailable. The proxy is on
 * the Node runtime now, but this is also imported by code that runs in several
 * places, and a correct 12-line compare is not worth the churn to replace.
 *
 * Identity itself lives in `lib/auth/` — this file holds only what the network
 * layer needs.
 */

import { addrInCidr, parseCidrList } from "@/lib/net/cidr";

/**
 * Header carrying the peer address of the TCP connection, stamped by the
 * custom server in `server.ts`.
 *
 * It exists because a Next request handler has no access to the socket.
 * `server.ts` deletes any inbound copy before setting it, so a client cannot
 * forge one. Never swap this for `X-Forwarded-For`: that header
 * is attacker-controlled, and trusting it would let anyone on the internet
 * claim a LAN address.
 */
export const PEER_HEADER = "x-sidearm-peer";

/** Compares two strings without leaking their contents through timing. */
export function safeEqual(a: string, b: string): boolean {
  // Length is not secret here (the operator chose it), but bail early to avoid
  // indexing past the end.
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Whether a break-glass bearer token is configured.
 *
 * This no longer decides whether the panel is protected — accounts do. The
 * token is an optional second credential for automation and for recovering an
 * install whose admin password is lost, and it doubles as the setup token that
 * proves possession of an existing deployment during first-run registration.
 */
export function breakGlassTokenConfigured(): boolean {
  return (process.env.PANEL_ADMIN_TOKEN ?? "") !== "";
}

/**
 * Networks granted an implicit read-only identity, from `PANEL_TRUSTED_CIDRS`.
 *
 * Empty (the default) means no bypass at all, so behaviour is unchanged unless
 * an operator opts in.
 */
export function trustedCidrs(): string[] {
  return parseCidrList(process.env.PANEL_TRUSTED_CIDRS ?? "");
}

/**
 * True when a peer sits in one of the trusted networks, which makes it a
 * `viewer` without signing in — see `lib/auth/identity.ts`.
 *
 * `addr` must be the real socket address. Note that behind a reverse proxy every
 * request appears to come *from the proxy*, so adding a proxy's own address here
 * would exempt the entire internet.
 */
export function isTrustedPeer(addr: string | null | undefined): boolean {
  if (!addr) return false;
  const cidrs = trustedCidrs();
  if (cidrs.length === 0) return false;
  return cidrs.some((cidr) => addrInCidr(addr, cidr));
}
