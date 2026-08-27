/**
 * Steam identity conversion.
 *
 * The panel stores `[U:1:12345]` everywhere — that is the only form RCON
 * `status` exposes, so the roster, the ban list and `match_players` are all
 * SteamID3. MatchZy match configs key their team rosters by **Steam64** and
 * accept nothing else. Getting this wrong does not fail loudly; it puts a
 * different person in the match.
 *
 * All arithmetic is BigInt. A Steam64 is ~7.6e16, past `Number.MAX_SAFE_INTEGER`
 * (9.007e15), so doing this with `+` on numbers silently rounds the low digits
 * and produces a valid-looking id belonging to somebody else. The same trap the
 * MatchZy stats reader hit.
 */

/** The base of the "individual" account universe: `STEAM_ID_BASE + accountid`. */
// BigInt("...") rather than a `76561197960265728n` literal: tsconfig targets
// ES2017, where BigInt literals are a syntax error. The value is identical.
const INDIVIDUAL_BASE = BigInt("76561197960265728");

/** `[U:1:12345]` — what RCON `status` prints, sometimes with a trailing tag. */
const ID3_RE = /^\[U:1:(\d+)(?::\d+)?\]$/i;

/** `STEAM_0:1:12345` / `STEAM_1:1:12345` — the CS:GO-era text form. */
const ID2_RE = /^STEAM_[0-5]:([01]):(\d+)$/i;

/** A bare Steam64, which is already what we want. */
const ID64_RE = /^\d{17}$/;

/**
 * Converts any Steam identity the panel might be holding into a Steam64 string.
 *
 * Returns `null` rather than guessing. A bot has no Steam identity, `status`
 * sometimes prints `BOT` or an empty column, and older panel rows fall back to
 * a player name — none of those are convertible, and inventing an id for them
 * would silently add a stranger to a match roster.
 */
export function toSteam64(id: string): string | null {
  const s = id.trim();
  if (s === "") return null;

  if (ID64_RE.test(s)) return s;

  const m3 = ID3_RE.exec(s);
  if (m3) {
    const account = BigInt(m3[1]);
    // Guards against `[U:1:0]`, which `status` prints for unassigned slots and
    // which would otherwise convert to the base id — a real, wrong account.
    if (account <= BigInt(0)) return null;
    return (INDIVIDUAL_BASE + account).toString();
  }

  const m2 = ID2_RE.exec(s);
  if (m2) {
    // accountid = z * 2 + y, where the id reads STEAM_X:y:z.
    const account = BigInt(m2[2]) * BigInt(2) + BigInt(m2[1]);
    if (account <= BigInt(0)) return null;
    return (INDIVIDUAL_BASE + account).toString();
  }

  return null;
}

/** Is this something `toSteam64` can actually convert? */
export function isConvertibleSteamId(id: string): boolean {
  return toSteam64(id) !== null;
}

/**
 * Steam64 back to the `[U:1:x]` form the rest of the panel speaks.
 *
 * Needed to line a MatchZy roster back up against the live `status` roster —
 * the panel matches players on SteamID3 everywhere else.
 */
export function toSteamId3(steam64: string): string | null {
  if (!ID64_RE.test(steam64.trim())) return null;
  const account = BigInt(steam64.trim()) - INDIVIDUAL_BASE;
  if (account <= BigInt(0)) return null;
  return `[U:1:${account}]`;
}
