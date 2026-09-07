import type { GameMode, ServerConfig } from "@/lib/api/types";
import type { ModePreset } from "@/lib/presets";

/**
 * The dashboard as something you edit, not something you read.
 *
 * The panel used to split "what the server is doing" from "what the server is
 * set to": a read-only dashboard, and a Config page with a form of the same
 * facts written out again. So the mode appeared twice, the map appeared twice,
 * and changing either meant leaving the page you noticed it on.
 *
 * Here the live values *are* the controls. Two rules make that safe:
 *
 *  1. **Nothing is sent until you save.** Firing a cvar per keystroke leaves a
 *     server in a half-applied state that nobody asked for — bots on, quota
 *     still zero — and each one costs an RCON round trip. Edits stage into a
 *     draft and go out together.
 *  2. **The map goes last.** Changing the level disconnects nothing but does
 *     reload it, so anything else in the same save has to already be applied
 *     when it happens, or it lands on the map you just left.
 */

/** Everything the panel can show and change, in one shape. */
export interface PanelValues {
  hostname: string;
  map: string;
  mode: GameMode;
  serverPassword: string;
  botsEnabled: boolean;
  botQuota: number;
  botDifficulty: ServerConfig["gameplay"]["botDifficulty"];
  /**
   * `sv_visiblemaxplayers`. Not shown as a row — it is a Config-page number
   * nobody sets by hand — but it belongs here because a preset moves it, and a
   * save that changed the mode without it would advertise ten slots for a
   * twenty-player casual game.
   */
  visibleMaxPlayers: number;
  /** `null` when the server has not answered yet; not editable until it has. */
  maxRounds: number | null;
  overtime: boolean | null;
}

export type FieldKey = keyof PanelValues;

/** A staged edit: only the keys someone actually touched. */
export type Draft = Partial<PanelValues>;

/**
 * Which fields a mode is allowed to show.
 *
 * Complexity follows the mode. A round limit and overtime are the machinery of
 * a match that counts, and the modes that count rounds are the ones that show
 * them: competitive (MR12, `mp_maxrounds 24`), wingman (MR8, 16) and casual
 * (15, first to 8) all end on a round number.
 *
 * Two modes do not. Deathmatch ends on `mp_timelimit` — ten minutes, no rounds
 * to limit — and practice keeps no score at all, so on those a round limit is
 * a number that governs nothing, sitting beside the only two things anyone
 * came to change: the mode and the map.
 */
const ROUNDLESS: ReadonlySet<GameMode> = new Set<GameMode>(["deathmatch", "practice"]);

export function fieldsForMode(mode: GameMode): FieldKey[] {
  const always: FieldKey[] = [
    "mode",
    "map",
    "hostname",
    "serverPassword",
    "botsEnabled",
    "botQuota",
    "botDifficulty",
    "visibleMaxPlayers",
  ];
  return ROUNDLESS.has(mode) ? always : [...always, "maxRounds", "overtime"];
}

/** The keys whose staged value differs from what the server reports. */
export function changedKeys(current: PanelValues, draft: Draft): FieldKey[] {
  const keys = Object.keys(draft) as FieldKey[];
  return keys.filter((k) => draft[k] !== undefined && draft[k] !== current[k]);
}

/**
 * One step of a save.
 *
 * Deliberately a list rather than a single call: the panel tells you what it is
 * about to do before it does it, and a partial failure can say which step
 * failed instead of leaving you to guess.
 */
export type ApplyStep =
  | { kind: "cvar"; name: string; value: string; label: string }
  | { kind: "config"; config: ServerConfig; label: string }
  | { kind: "map"; name: string; label: string };

/**
 * Turns a draft into the ordered work that applies it.
 *
 * Cvars first (cheap, instant), then the config write, then the map — see the
 * ordering rule at the top of this file. Returns an empty list when nothing
 * changed, so the Save button has something honest to disable itself on.
 */
export function planApply(
  current: PanelValues,
  draft: Draft,
  baseConfig: ServerConfig,
): ApplyStep[] {
  const changed = new Set(changedKeys(current, draft));
  if (changed.size === 0) return [];

  const steps: ApplyStep[] = [];

  if (changed.has("maxRounds") && draft.maxRounds != null) {
    steps.push({
      kind: "cvar",
      name: "mp_maxrounds",
      value: String(draft.maxRounds),
      label: `Round limit → ${draft.maxRounds}`,
    });
  }
  if (changed.has("overtime") && draft.overtime != null) {
    steps.push({
      kind: "cvar",
      name: "mp_overtime_enable",
      value: draft.overtime ? "1" : "0",
      label: `Overtime → ${draft.overtime ? "on" : "off"}`,
    });
  }

  const configKeys: FieldKey[] = [
    "hostname",
    "serverPassword",
    "mode",
    "botsEnabled",
    "botQuota",
    "botDifficulty",
    "visibleMaxPlayers",
  ];
  if (configKeys.some((k) => changed.has(k))) {
    steps.push({
      kind: "config",
      label: configKeys
        .filter((k) => changed.has(k))
        .map((k) => LABELS[k])
        .join(", "),
      config: {
        ...baseConfig,
        identity: {
          ...baseConfig.identity,
          hostname: draft.hostname ?? current.hostname,
        },
        access: {
          ...baseConfig.access,
          serverPassword: draft.serverPassword ?? current.serverPassword,
        },
        gameplay: {
          ...baseConfig.gameplay,
          mode: draft.mode ?? current.mode,
          botsEnabled: draft.botsEnabled ?? current.botsEnabled,
          botQuota: draft.botQuota ?? current.botQuota,
          botDifficulty: draft.botDifficulty ?? current.botDifficulty,
          visibleMaxPlayers: draft.visibleMaxPlayers ?? current.visibleMaxPlayers,
        },
      },
    });
  }

  if (changed.has("map") && draft.map) {
    steps.push({ kind: "map", name: draft.map, label: `Map → ${draft.map}` });
  }

  return steps;
}

const LABELS: Record<FieldKey, string> = {
  hostname: "Server name",
  map: "Map",
  mode: "Mode",
  serverPassword: "Password",
  botsEnabled: "Bots",
  botQuota: "Bot count",
  botDifficulty: "Bot difficulty",
  maxRounds: "Round limit",
  overtime: "Overtime",
  visibleMaxPlayers: "Advertised slots",
};

export function fieldLabel(key: FieldKey): string {
  return LABELS[key];
}

/**
 * Whether a save will visibly do nothing until the level reloads.
 *
 * `game_type` and `game_mode` are read when a map loads, so switching mode on
 * its own leaves the server playing the old one and the panel looking broken.
 * Changing the map in the same save hides the problem; not changing it means
 * the panel owes the operator a sentence about it.
 */
export function modeNeedsMapReload(current: PanelValues, draft: Draft): boolean {
  const changed = new Set(changedKeys(current, draft));
  return changed.has("mode") && !changed.has("map");
}

/**
 * A preset, as a staged edit.
 *
 * One tap has to be one tap — "we're playing Wingman tonight" instead of six
 * fields — but it must not also be an immediate write. A preset stages like
 * anything else, so what it is about to change is listed in the save bar and
 * can be discarded, and so a preset plus a map change go out as one save with
 * the map last.
 *
 * Deliberately silent about the map: presets say how to play, not where, and a
 * preset that also moved everyone to a different map would make picking one
 * mid-session something you do not dare press.
 */
export function presetDraft(preset: ModePreset, current: PanelValues): Draft {
  const wanted: Draft = { ...presetGameplay(preset) };

  /**
   * The round limit rides along, so picking Wingman does not leave a 2v2
   * running to 13. Only when the preset has one and the server has already
   * reported its current value: staging a limit against a `null` we have not
   * read yet would claim a change we cannot describe.
   */
  if (preset.maxRounds !== null && current.maxRounds !== null) {
    wanted.maxRounds = preset.maxRounds;
  }

  // Keys already correct are dropped, so the save bar counts what will really
  // change rather than always claiming five.
  const draft: Draft = {};
  for (const key of changedKeys(current, wanted)) {
    Object.assign(draft, { [key]: wanted[key] });
  }
  return draft;
}

function presetGameplay(preset: ModePreset): Draft {
  return {
    mode: preset.live.mode,
    botsEnabled: preset.live.botsEnabled,
    botQuota: preset.live.botQuota,
    botDifficulty: preset.live.botDifficulty,
    visibleMaxPlayers: preset.live.visibleMaxPlayers,
  };
}

/**
 * Whether the server is already set up the way a preset describes.
 *
 * The round limit is deliberately not part of the answer. It is a number the
 * operator is free to change — a 30-round scrim is still competitive — and
 * counting it would leave the mode menu showing nothing selected for a server
 * that is plainly in one of these modes.
 */
export function presetActive(preset: ModePreset, current: PanelValues): boolean {
  return changedKeys(current, presetGameplay(preset)).length === 0;
}
