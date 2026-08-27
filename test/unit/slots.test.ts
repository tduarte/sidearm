import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MODE_SLOTS, suggestedSlots } from "@/lib/cs2/slots";

describe("suggestedSlots", () => {
  it("gives each mode its natural size on a big server", () => {
    assert.equal(suggestedSlots("competitive", 32), 10);
    assert.equal(suggestedSlots("wingman", 32), 4);
    assert.equal(suggestedSlots("deathmatch", 32), 16);
    assert.equal(suggestedSlots("casual", 32), 20);
  });

  it("never advertises more slots than the server actually has", () => {
    // Advertising 20 on a 10-slot server means players connect, get refused,
    // and blame the server. The ceiling is a launch argument and cannot move.
    assert.equal(suggestedSlots("casual", 10), 10);
    assert.equal(suggestedSlots("deathmatch", 10), 10);
    // A mode that already fits is left alone.
    assert.equal(suggestedSlots("competitive", 10), 10);
    assert.equal(suggestedSlots("wingman", 10), 4);
  });

  it("leaves `custom` alone", () => {
    // "Custom" means the operator is doing something bespoke. Overwriting their
    // slot count on a mode change would be exactly the wrong move.
    assert.equal(suggestedSlots("custom", 32), null);
  });

  it("suggests the natural size when the ceiling is unknown", () => {
    // Docker unreachable: maxPlayers is null. Guessing low would be as wrong as
    // guessing high, so suggest what the mode wants and let the server refuse.
    assert.equal(suggestedSlots("deathmatch", null), 16);
  });

  it("never suggests zero", () => {
    for (const mode of Object.keys(MODE_SLOTS) as (keyof typeof MODE_SLOTS)[]) {
      const s = suggestedSlots(mode, 1);
      if (s !== null) assert.ok(s >= 1, `${mode} suggested ${s}`);
    }
  });
});
