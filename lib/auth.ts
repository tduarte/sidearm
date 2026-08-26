/**
 * Shared auth constants and a constant-time comparison.
 *
 * Runs on the Edge runtime (middleware), so `node:crypto.timingSafeEqual` is not
 * available — hence the hand-rolled compare.
 */

import { addrInCidr, parseCidrList } from "@/lib/net/cidr";

export const AUTH_COOKIE = "sidearm_token";

/**
 * Header carrying the peer address of the TCP connection, stamped by the
 * custom server in `server.ts`.
 *
 * It exists because `proxy.ts` runs on the Edge runtime, which has no access
 * to the socket. `server.ts` deletes any inbound copy before setting it, so a
 * client cannot forge one. Never swap this for `X-Forwarded-For`: that header
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

/** Auth is opt-in: with no token configured the panel stays open. */
export function authRequired(): boolean {
  return (process.env.PANEL_ADMIN_TOKEN ?? "") !== "";
}

/**
 * Networks allowed to skip the token, from `PANEL_TRUSTED_CIDRS`.
 *
 * Empty (the default) means no bypass at all, so behaviour is unchanged unless
 * an operator opts in.
 */
export function trustedCidrs(): string[] {
  return parseCidrList(process.env.PANEL_TRUSTED_CIDRS ?? "");
}

/**
 * True when a peer sits in one of the trusted networks.
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
