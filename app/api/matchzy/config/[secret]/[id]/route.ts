import { NextResponse } from "next/server";
import { buildMatchConfig } from "@/lib/cs2/match-config";
import { getMatchConfig } from "@/lib/db/match-configs";
import { matchzyConfigSecret } from "@/lib/cs2/match-load";
import { safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The URL CS2 fetches when the panel runs `matchzy_loadmatch_url`.
 *
 * **This handler must be fast.** MatchZy loads a match by blocking the game
 * thread on the HTTP call's `.Result`, so every millisecond here is a
 * millisecond the server is frozen for everyone on it. One indexed SQLite read
 * and a pure transform, nothing else — no RCON, no Docker, no network.
 *
 * Authenticated by a secret in the path rather than a header, matching
 * `/api/ingest/logs/[secret]`. MatchZy does support header auth, but the panel
 * is the one handing out this URL over RCON, so the simpler shape the codebase
 * already uses wins. `proxy.ts` exempts this prefix for the same reason it
 * exempts the log sink: the game server carries no session cookie.
 *
 * A wrong or missing secret gets 404, not 401 — an unauthenticated caller
 * should not be able to confirm the endpoint exists.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ secret: string; id: string }> },
) {
  const { secret, id } = await params;

  const expected = matchzyConfigSecret();
  if (expected === "" || !safeEqual(secret, expected)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const stored = getMatchConfig(id);
  if (!stored) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Rebuilt rather than stored pre-rendered, so a definition saved by an older
  // panel build still gets today's schema — and so the `skip_veto` correction
  // is applied at fetch time rather than being baked into a stale row.
  const { config, errors } = buildMatchConfig(stored.definition);
  if (!config) {
    // 422, not 404: the match exists, it just cannot be expressed. CS2 will log
    // the failure, and the panel already refused to save an invalid definition,
    // so reaching here means the rules changed underneath it.
    return NextResponse.json({ error: "invalid match config", errors }, { status: 422 });
  }

  return NextResponse.json(config);
}
