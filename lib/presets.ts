import type { GameMode, ServerConfig } from "@/lib/api/types";

/**
 * Game-mode presets: "we're playing Wingman tonight" as one choice instead of
 * six.
 *
 * Setting a server up correctly means knowing that Wingman is 2v2 so four
 * slots is right, that GOTV eats one of them so the launch argument is five,
 * and that Deathmatch wants roughly twenty-four. None of that is discoverable
 * from a form with a number field in it. The numbers are written down here
 * once, with the reasoning, and every surface that offers a preset reads them
 * from this file.
 *
 * THE SPLIT THAT MATTERS. Two of the settings a mode implies are cvars, and
 * two are launch arguments:
 *
 *  - `live` applies over RCON, now, to the running server. Nobody is
 *    disconnected.
 *  - `boot` is `-maxplayers` and friends, baked into the container's command
 *    line. Changing it needs `docker compose up -d --force-recreate cs2`,
 *    which drops everyone connected. The panel cannot do that to itself and
 *    must not pretend otherwise, so it prints the exact `.env` lines and the
 *    exact command instead of offering a button that would lie.
 *
 * `TV_ENABLE=1` on every preset is deliberate: GOTV is how the panel records
 * demos, and keeping it constant means switching presets only ever changes the
 * slot count and the two mode numbers.
 */
export interface ModePreset {
  id: string;
  label: string;
  /** The one-line reason you would pick this. */
  tagline: string;
  /** Team shape, e.g. `2v2`. */
  shape: string;
  /** Cvars — applied immediately over RCON. */
  live: ServerConfig["gameplay"];
  /** Launch arguments — a container recreate. */
  boot: {
    /**
     * `-maxplayers`. Always the human count plus one: with `TV_ENABLE=1` the
     * server occupies slot 0 with a `CSTV` client, so a 10 here fits only nine
     * players and a 5v5 does not start.
     */
    CS2_MAXPLAYERS: number;
    CS2_GAMETYPE: number;
    CS2_GAMEMODE: number;
    TV_ENABLE: number;
  };
  /** How the numbers above were arrived at. Shown in the UI, not hidden here. */
  why: string;
}

/** `game_type` / `game_mode`, the pair CS2 uses to select a mode. */
const MODE_NUMBERS: Record<GameMode, [number, number]> = {
  casual: [0, 0],
  competitive: [0, 1],
  wingman: [0, 2],
  deathmatch: [1, 2],
  practice: [0, 0],
  custom: [3, 0],
};

function boot(mode: GameMode, humans: number): ModePreset["boot"] {
  const [gt, gm] = MODE_NUMBERS[mode];
  return {
    // +1 for GOTV. This is the single most common way a new server is set up
    // wrong, so it is arithmetic here rather than a note in a README.
    CS2_MAXPLAYERS: humans + 1,
    CS2_GAMETYPE: gt,
    CS2_GAMEMODE: gm,
    TV_ENABLE: 1,
  };
}

export const PRESETS: ModePreset[] = [
  {
    id: "competitive",
    label: "Competitive 5v5",
    tagline: "Standard matchmaking rules, MR12.",
    shape: "5v5",
    live: {
      mode: "competitive",
      visibleMaxPlayers: 10,
      botsEnabled: false,
      botDifficulty: 2,
      botQuota: 0,
    },
    boot: boot("competitive", 10),
    why: "Ten players plus a GOTV slot. Bots off — an empty slot is better than a bot in a match that counts.",
  },
  {
    id: "wingman",
    label: "Wingman 2v2",
    tagline: "Two-a-side on the short bombsite maps.",
    shape: "2v2",
    live: {
      mode: "wingman",
      visibleMaxPlayers: 4,
      botsEnabled: false,
      botDifficulty: 2,
      botQuota: 0,
    },
    boot: boot("wingman", 4),
    why: "Wingman is 2v2, so four slots is the whole game. Five with GOTV.",
  },
  {
    id: "deathmatch",
    label: "Deathmatch",
    tagline: "Free-for-all warmup, instant respawn.",
    shape: "24 players",
    live: {
      mode: "deathmatch",
      visibleMaxPlayers: 24,
      botsEnabled: true,
      botDifficulty: 2,
      botQuota: 8,
    },
    boot: boot("deathmatch", 24),
    why: "Deathmatch is busy by design; 24 is the usual ceiling before spawns start fighting each other. Bots fill it out when few people are on.",
  },
  {
    id: "casual",
    label: "Casual 10v10",
    tagline: "Bomb defusal with relaxed rules.",
    shape: "10v10",
    live: {
      mode: "casual",
      visibleMaxPlayers: 20,
      botsEnabled: true,
      botDifficulty: 1,
      botQuota: 10,
    },
    boot: boot("casual", 20),
    why: "Twenty players, easy bots to keep both sides full while people join.",
  },
  {
    id: "practice",
    label: "Practice",
    tagline: "Nade lineups and retakes, nobody keeping score.",
    shape: "up to 10",
    live: {
      mode: "practice",
      visibleMaxPlayers: 10,
      botsEnabled: false,
      botDifficulty: 1,
      botQuota: 0,
    },
    boot: boot("practice", 10),
    why: "Same slots as competitive so you can switch between them without recreating the container. The grenade helpers and cheats live on Match Control, not here — they are per-session, not server setup.",
  },
];

export function findPreset(id: string): ModePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * Whether a preset's launch arguments already match what the container was
 * started with.
 *
 * Only `-maxplayers` is observable at runtime (`ServerStatus.maxPlayers`); the
 * mode numbers are cvars that the live tier rewrites anyway, and `TV_ENABLE`
 * has no readback. So this answers the one question that has a real answer,
 * and answers `null` — "cannot tell" — rather than guessing when the server
 * has not reported a slot count yet.
 */
export function bootDiffers(
  preset: ModePreset,
  installedMaxPlayers: number | null | undefined,
): boolean | null {
  if (typeof installedMaxPlayers !== "number") return null;
  return installedMaxPlayers !== preset.boot.CS2_MAXPLAYERS;
}

/** The exact lines to paste into `.env`, in the order `.env.example` has them. */
export function envLines(preset: ModePreset): string[] {
  return [
    `CS2_MAXPLAYERS=${preset.boot.CS2_MAXPLAYERS}`,
    `CS2_GAMETYPE=${preset.boot.CS2_GAMETYPE}`,
    `CS2_GAMEMODE=${preset.boot.CS2_GAMEMODE}`,
    `TV_ENABLE=${preset.boot.TV_ENABLE}`,
  ];
}

/**
 * The one command that applies them.
 *
 * `up -d --force-recreate cs2`, not `restart`: launch arguments are fixed when
 * the container is created, so a restart re-runs the old command line and the
 * new `.env` appears to do nothing. Never `docker compose pull` — that would
 * replace a locally built panel image with CI's.
 */
export const BOOT_APPLY_COMMAND = "docker compose up -d --force-recreate cs2";
