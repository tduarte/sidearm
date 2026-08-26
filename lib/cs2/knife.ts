/**
 * Knife round, as an honest cvar approximation.
 *
 * CS2 has no native knife round. It used to be a `MatchPhase` here, mapped to
 * an empty command list — nothing was sent and success was reported anyway.
 * This replaces that with something that actually runs, and says plainly what
 * it cannot do: the panel cannot detect who won or swap sides for you. A real
 * competitive flow needs Get5 or MatchZy, as HANDOFF.md already noted.
 *
 * The cvars are captured before they are overwritten so the change can be
 * undone. Restoring a captured baseline beats `exec gamemode_competitive.cfg`
 * because it assumes nothing about what Valve ships in that file, and it
 * survives a panel restart because it is persisted (lib/db/config.ts).
 */

/** Cvars the knife setup overwrites. Read before writing; restored on undo. */
export const KNIFE_CVARS = [
  "mp_ct_default_primary",
  "mp_ct_default_secondary",
  "mp_ct_default_melee",
  "mp_t_default_primary",
  "mp_t_default_secondary",
  "mp_t_default_melee",
  "mp_free_armor",
  "mp_give_player_c4",
  "mp_death_drop_gun",
  "mp_death_drop_grenade",
  "mp_death_drop_defuser",
  "mp_buytime",
  "mp_startmoney",
  "mp_maxmoney",
  "mp_respawn_immunitytime",
  "mp_warmuptime",
] as const;

/** The knife loadout: no guns, no armour drop, no bomb, no buying. */
export const KNIFE_SETUP: Readonly<Record<string, string>> = {
  mp_ct_default_primary: '""',
  mp_ct_default_secondary: '""',
  mp_ct_default_melee: '"weapon_knife"',
  mp_t_default_primary: '""',
  mp_t_default_secondary: '""',
  mp_t_default_melee: '"weapon_knife"',
  mp_free_armor: "1",
  mp_give_player_c4: "0",
  mp_death_drop_gun: "0",
  mp_death_drop_grenade: "0",
  mp_death_drop_defuser: "0",
  mp_buytime: "0",
  mp_startmoney: "0",
  mp_maxmoney: "0",
  mp_respawn_immunitytime: "0",
};

/**
 * Turns a captured baseline into the commands that put it back.
 *
 * Only cvars the server actually reported are restored: writing a guessed
 * default over a value we never read would be the same class of mistake this
 * whole area is fixing. A name the build does not have is simply skipped.
 */
export function restoreCommands(
  baseline: Readonly<Record<string, string>>,
): string[] {
  const cmds: string[] = [];
  for (const name of KNIFE_CVARS) {
    const value = baseline[name];
    if (value === undefined) continue;
    // An empty value must be re-quoted, or `mp_ct_default_primary` with no
    // argument reads the cvar instead of clearing it.
    cmds.push(`${name} ${value === "" ? '""' : value}`);
  }
  return cmds;
}

/** The commands that apply the knife loadout, in order. */
export function setupCommands(): string[] {
  return [
    "mp_warmup_end",
    ...Object.entries(KNIFE_SETUP).map(([name, value]) => `${name} ${value}`),
    "mp_restartgame 1",
  ];
}
