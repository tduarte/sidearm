import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPlayableMapName,
  mapDisplayName,
  parseMapList,
} from "@/lib/cs2/maps";

/**
 * A representative slice of a real `maps *` reply from a live CS2 server,
 * keeping one of every shape the filter has to reject.
 */
const REAL_MAPS = `
	ar_baggage
	ar_baggage_vanity
	ar_pool_day
	cs_italy
	cs_italy_vanity
	cs_shelter
	de_ancient
	de_ancient_night
	de_cache
	de_dust2
	de_dust2_vanity
	de_mirage
	error
	graphics_settings
	lobby_mapveto
	prefabs/de_mirage/3dskybox_mirage
	prefabs/misc/team_select
	templates/env_sun_entity_template
	ui/buy_menu
	ui/match_mvp
	editor/zoo/script_zoo
	warehouse_vanity
	workshop_preview_dust2
`;

describe("parseMapList", () => {
  const maps = parseMapList(REAL_MAPS);

  it("keeps the maps you could actually host", () => {
    assert.deepEqual(maps, [
      "ar_baggage",
      "ar_pool_day",
      "cs_italy",
      "cs_shelter",
      "de_ancient",
      "de_ancient_night",
      "de_cache",
      "de_dust2",
      "de_mirage",
    ]);
  });

  it("finds maps the old hardcoded list did not have", () => {
    // The panel shipped 13 names copied into mock.ts; this server has more.
    assert.ok(maps.includes("de_cache"));
    assert.ok(maps.includes("cs_shelter"));
    assert.ok(maps.includes("de_ancient_night"));
  });

  it("rejects every non-map shape seen in the real listing", () => {
    for (const junk of [
      "prefabs/de_mirage/3dskybox_mirage",
      "ui/buy_menu",
      "templates/env_sun_entity_template",
      "editor/zoo/script_zoo",
      "de_dust2_vanity",
      "warehouse_vanity",
      "workshop_preview_dust2",
      "error",
      "graphics_settings",
      "lobby_mapveto",
      "",
      "   ",
    ]) {
      assert.equal(isPlayableMapName(junk), false, junk);
    }
  });

  it("does not require a de_/cs_ prefix, so hand-installed maps survive", () => {
    // Exclusion-based on purpose: an allowlist of Valve prefixes would hide a
    // community map dropped into the maps folder.
    assert.equal(isPlayableMapName("aim_botz"), true);
    assert.equal(isPlayableMapName("surf_beginner"), true);
  });

  it("de-duplicates and sorts", () => {
    assert.deepEqual(parseMapList("de_nuke\nde_nuke\nde_cache\n"), [
      "de_cache",
      "de_nuke",
    ]);
  });
});

describe("mapDisplayName", () => {
  it("uses the real name where prettifying would get it wrong", () => {
    assert.equal(mapDisplayName("de_dust2"), "Dust II");
    assert.equal(mapDisplayName("de_eldorado"), "El Dorado");
    assert.equal(mapDisplayName("ar_shoots_night"), "Shoots (Night)");
  });

  it("prettifies anything else rather than leaving it missing", () => {
    // A map added in a future CS2 update should still get a sane label.
    assert.equal(mapDisplayName("de_mirage"), "Mirage");
    assert.equal(mapDisplayName("de_overpass"), "Overpass");
    assert.equal(mapDisplayName("de_some_new_map"), "Some New Map");
  });
});
