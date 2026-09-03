"use client";

/**
 * The practice knobs, on the stage, only while you are practising.
 *
 * These were a section of `/match` that every mode had to scroll past, which is
 * the shape the Broadcast direction rejects: the panel shows the controls that
 * belong to the thing the server is currently running, and infinite ammo
 * belongs to exactly one of the five modes. So the strip is mounted only when
 * the live mode is Practice — mounted, not hidden, because `useCvarGroup`
 * polls every three seconds and a hidden strip would poll forever on a
 * competitive night.
 *
 * The one thing that survives from the old tiles unchanged is the honesty
 * about state. A cvar the panel has not heard back about renders as *unknown*
 * rather than off; a cvar this CS2 build does not have says so; and a
 * cheat-protected cvar is disabled with the reason, because writing it while
 * `sv_cheats` is 0 echoes back unchanged and a tile that flips anyway is
 * lying.
 */

import { useCvarGroup } from "@/lib/hooks/use-cvar-group";
import { asBool, asInt } from "@/lib/cs2/cvars";
import { PRACTICE_CVARS, offValueFor } from "@/lib/cs2/practice";
import type { CvarSpec, CvarState } from "@/lib/api/types";

export function PracticeStrip({ enabled }: { enabled: boolean }) {
  const { query, setCvar, byName } = useCvarGroup("practice", enabled);
  const cheats = byName.get("sv_cheats");
  const cheatsOn = cheats ? asBool(cheats.value ?? undefined) : null;
  const pending = setCvar.isPending;

  if (!enabled) return null;

  return (
    <div className="bc__prac">
      <span className="bc__pracTag">Practice</span>

      <Toggle
        label="Cheats"
        name="sv_cheats"
        on={cheatsOn}
        pending={pending}
        // Not itself cheat-protected — it is the gate the others wait on, so
        // it is the one control here that is never locked.
        locked={false}
        onToggle={() =>
          setCvar.mutate({ name: "sv_cheats", value: cheatsOn ? "0" : "1" })
        }
      />

      {PRACTICE_CVARS.map((spec) => {
        const state = byName.get(spec.name);
        return (
          <Control
            key={spec.name}
            spec={spec}
            state={state}
            cheatsOn={cheatsOn}
            pending={pending}
            onSet={(value) => setCvar.mutate({ name: spec.name, value })}
          />
        );
      })}

      {query.data?.readAt === null && (
        <span className="bc__pracNote">
          No answer from the server — these read back over RCON.
        </span>
      )}
    </div>
  );
}

function Control({
  spec,
  state,
  cheatsOn,
  pending,
  onSet,
}: {
  spec: CvarSpec;
  state: CvarState | undefined;
  cheatsOn: boolean | null;
  pending: boolean;
  onSet: (value: string) => void;
}) {
  if (state && !state.supported) {
    return (
      <span className="bc__pracDead" title={`${spec.name} — unknown command`}>
        {spec.label} · not on this build
      </span>
    );
  }

  const raw = state?.value ?? null;
  const locked = spec.cheatProtected && cheatsOn !== true;

  if (spec.kind === "stepper") {
    const value = raw === null ? null : asInt(raw);
    return (
      <span
        className={`bc__limit${locked ? " bc__limit--locked" : ""}`}
        title={locked ? "needs sv_cheats 1" : spec.name}
      >
        <label className="bc__limitLabel" htmlFor={`bc-prac-${spec.name}`}>
          {spec.label}
        </label>
        <input
          id={`bc-prac-${spec.name}`}
          className="bc__limitInput"
          type="number"
          min={spec.min}
          max={spec.max}
          step={1}
          disabled={locked || pending || value === null}
          value={value ?? ""}
          placeholder="?"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isInteger(n)) return;
            if (spec.min !== undefined && n < spec.min) return;
            if (spec.max !== undefined && n > spec.max) return;
            onSet(String(n));
          }}
        />
      </span>
    );
  }

  const on = asBool(raw ?? undefined);
  return (
    <Toggle
      label={spec.label}
      name={spec.name}
      on={on}
      pending={pending}
      locked={locked}
      onToggle={() => onSet(on ? offValueFor(spec, state?.baseline ?? null) : spec.on)}
    />
  );
}

/**
 * `on` is three-valued on purpose. `null` is "the server has not said", and
 * rendering that as off is how someone ends up turning on what is already on.
 */
function Toggle({
  label,
  name,
  on,
  pending,
  locked,
  onToggle,
}: {
  label: string;
  name: string;
  on: boolean | null;
  pending: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on ?? false}
      disabled={locked || pending || on === null}
      title={locked ? "needs sv_cheats 1" : name}
      className={`bc__switch${on ? " bc__switch--on" : ""}${on === null ? " bc__switch--unknown" : ""}`}
      onClick={onToggle}
    >
      <span className="bc__track" aria-hidden>
        <span className="bc__knob" />
      </span>
      {label}
      {on === null && <span className="bc__switchWhy">no answer yet</span>}
    </button>
  );
}
