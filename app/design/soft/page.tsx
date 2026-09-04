"use client";

/**
 * Direction 5 — SOFT APP.
 *
 * Premise: the panel is opened on a phone, from the sofa, by someone who is
 * mid-round and does not want to think. So it is built like a consumer app
 * rather than an admin tool: a single scrolling column of large rounded cards,
 * pastel surfaces, one saturated accent, and a bottom tab bar that puts every
 * destination in thumb reach.
 *
 * Everything that matters is a big target. The preset row is the primary act —
 * one tap changes the night — and the destructive things are pushed behind a
 * sheet rather than sitting a mis-tap away from the score.
 *
 * The cost, stated honestly: this is the least information-dense of the five.
 * On a 27" monitor it is a narrow ribbon of cards with a lot of air, and the
 * per-player detail an admin sometimes wants is a tap deeper than it is
 * anywhere else.
 */

import { MATCH, SERVER, PLAYERS, PRESETS, ACTIONS, MAP_POOL, mapArt } from "@/lib/design/mock";

const css = `
.sf {
  --bg: #f4f4f8;
  --card: #ffffff;
  --ink: #1a1a24;
  --sub: #74748a;
  --line: #e7e7ef;
  --accent: #5b53f0;
  --accent-soft: #edecfe;
  --ct: #2f7fe0;
  --ct-soft: #e6f0fd;
  --t: #e08a2f;
  --t-soft: #fdf1e2;
  --danger: #d84a4a;
  min-height: calc(100svh - 32px);
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  font-size: 15px;
  padding-bottom: 96px;
}
.sf__wrap { max-width: 460px; margin: 0 auto; padding: 18px 16px 0; display: flex; flex-direction: column; gap: 16px; }

.sf__top { display: flex; align-items: center; gap: 12px; padding: 6px 2px 0; }
.sf__hi { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.sf__hiSub { font-size: 14px; color: var(--sub); margin: 2px 0 0; }
.sf__avatar {
  margin-left: auto; width: 40px; height: 40px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent);
  display: grid; place-items: center; font-weight: 700; font-size: 14px;
}

.sf__card {
  background: var(--card); border-radius: 22px; padding: 18px;
  box-shadow: 0 1px 2px rgba(26,26,36,0.05), 0 8px 24px -16px rgba(26,26,36,0.22);
}
.sf__cardHead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.sf__cardTitle { font-size: 13px; font-weight: 600; color: var(--sub); margin: 0; }
.sf__link { font-size: 13px; font-weight: 600; color: var(--accent); background: none; border: 0; padding: 0; cursor: pointer; }

/* live match card */
.sf__match { position: relative; overflow: hidden; padding: 0; }
.sf__matchArt { height: 116px; background-size: cover; background-position: center 45%; position: relative; }
.sf__matchVeil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.55)); }
.sf__live {
  position: absolute; top: 12px; left: 12px; display: inline-flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.92); border-radius: 999px; padding: 5px 11px;
  font-size: 12px; font-weight: 700;
}
.sf__dot { width: 7px; height: 7px; border-radius: 999px; background: var(--danger); animation: sfpulse 1.6s ease-in-out infinite; }
@keyframes sfpulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
.sf__mapName {
  position: absolute; left: 16px; bottom: 12px; color: #fff;
  font-size: 24px; font-weight: 700; letter-spacing: -0.02em;
}
.sf__matchBody { padding: 16px 18px 18px; }
.sf__scores { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; }
.sf__side { border-radius: 16px; padding: 12px; text-align: center; }
.sf__side--ct { background: var(--ct-soft); }
.sf__side--t { background: var(--t-soft); }
.sf__sideName { display: block; font-size: 12.5px; font-weight: 600; color: var(--sub); margin-bottom: 2px; }
.sf__sideScore { display: block; font-size: 34px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.sf__side--ct .sf__sideScore { color: var(--ct); }
.sf__side--t .sf__sideScore { color: var(--t); }
.sf__vs { font-size: 12px; font-weight: 600; color: var(--sub); }
.sf__round {
  margin: 14px 0 0; text-align: center; font-size: 13px; color: var(--sub);
}
.sf__progress { height: 6px; border-radius: 999px; background: var(--line); margin-top: 8px; overflow: hidden; }
.sf__progressFill { height: 100%; border-radius: 999px; background: var(--accent); }

/* presets */
.sf__chips { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; margin: 0 -18px; padding-left: 18px; padding-right: 18px; scrollbar-width: none; }
.sf__chips::-webkit-scrollbar { display: none; }
.sf__chip {
  flex: 0 0 auto; border-radius: 18px; padding: 13px 16px; cursor: pointer; text-align: left;
  background: var(--bg); border: 1.5px solid transparent; min-width: 120px;
}
.sf__chip--on { background: var(--accent-soft); border-color: var(--accent); }
.sf__chipName { display: block; font-size: 15px; font-weight: 700; }
.sf__chipNote { display: block; font-size: 12.5px; color: var(--sub); margin-top: 1px; }
.sf__chip--on .sf__chipNote { color: var(--accent); }

/* roster */
.sf__player { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-top: 1px solid var(--line); }
.sf__player:first-of-type { border-top: 0; }
.sf__pAvatar {
  width: 38px; height: 38px; border-radius: 14px; display: grid; place-items: center;
  font-size: 13px; font-weight: 700; flex: 0 0 auto;
}
.sf__pAvatar--ct { background: var(--ct-soft); color: var(--ct); }
.sf__pAvatar--t { background: var(--t-soft); color: var(--t); }
.sf__pName { font-size: 15px; font-weight: 600; }
.sf__pMeta { font-size: 12.5px; color: var(--sub); }
.sf__pStat { margin-left: auto; text-align: right; }
.sf__pKd { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sf__pAdr { font-size: 12px; color: var(--sub); }

/* maps */
.sf__maps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.sf__map {
  position: relative; aspect-ratio: 4 / 3; border-radius: 16px; overflow: hidden;
  border: 0; padding: 0; cursor: pointer; background-size: cover; background-position: center;
}
.sf__mapVeil { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7)); }
.sf__mapName { position: absolute; left: 8px; bottom: 6px; color: #fff; font-size: 12.5px; font-weight: 700; }
.sf__map--out { filter: grayscale(1); opacity: 0.45; }

/* actions */
.sf__acts { display: flex; flex-direction: column; gap: 8px; }
.sf__act {
  display: flex; align-items: center; gap: 12px; width: 100%; cursor: pointer;
  border: 0; border-radius: 16px; padding: 14px 16px; background: var(--bg); text-align: left;
}
.sf__act:active { transform: scale(0.99); }
.sf__actName { font-size: 15px; font-weight: 600; }
.sf__actHint { font-size: 12.5px; color: var(--sub); }
.sf__actArrow { margin-left: auto; color: var(--sub); }
.sf__act--danger { background: #fdeeee; }
.sf__act--danger .sf__actName { color: var(--danger); }

.sf__cta {
  width: 100%; border: 0; border-radius: 18px; padding: 17px; cursor: pointer;
  background: var(--accent); color: #fff; font-size: 16px; font-weight: 700;
  box-shadow: 0 10px 24px -12px rgba(91,83,240,0.9);
}

/* bottom tabs */
.sf__tabs {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  background: rgba(255,255,255,0.92); backdrop-filter: blur(14px);
  border-top: 1px solid var(--line);
  display: flex; justify-content: space-around;
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
}
.sf__tab {
  flex: 1; background: none; border: 0; cursor: pointer; padding: 6px 0;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  font-size: 11px; font-weight: 600; color: var(--sub);
}
.sf__tab--on { color: var(--accent); }
.sf__tabGlyph { font-size: 19px; line-height: 1; }
`;

const TABS = [
  { id: "home", label: "Home", glyph: "◉", on: true },
  { id: "match", label: "Match", glyph: "◈", on: false },
  { id: "maps", label: "Maps", glyph: "▦", on: false },
  { id: "more", label: "More", glyph: "≡", on: false },
];

export default function SoftDirection() {
  const progress = Math.round(((MATCH.ct.score + MATCH.t.score) / MATCH.maxRounds) * 100);

  return (
    <div className="sf">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="sf__wrap">
        <div className="sf__top">
          <div>
            <h1 className="sf__hi">Good evening</h1>
            <p className="sf__hiSub">
              {SERVER.slotsUsed} on {SERVER.hostname} · up {SERVER.uptimeHours}h
            </p>
          </div>
          <span className="sf__avatar" aria-hidden>
            TD
          </span>
        </div>

        <section className="sf__card sf__match">
          <div className="sf__matchArt" style={{ backgroundImage: `url(${mapArt(MATCH.map)})` }}>
            <div className="sf__matchVeil" aria-hidden />
            <span className="sf__live">
              <span className="sf__dot" aria-hidden />
              Live · {MATCH.series.format} map {MATCH.series.mapIndex}
            </span>
            <span className="sf__mapName">{MATCH.mapLabel}</span>
          </div>
          <div className="sf__matchBody">
            <div className="sf__scores">
              <div className="sf__side sf__side--ct">
                <span className="sf__sideName">{MATCH.ct.name}</span>
                <span className="sf__sideScore">{MATCH.ct.score}</span>
              </div>
              <span className="sf__vs">vs</span>
              <div className="sf__side sf__side--t">
                <span className="sf__sideName">{MATCH.t.name}</span>
                <span className="sf__sideScore">{MATCH.t.score}</span>
              </div>
            </div>
            <p className="sf__round">
              Round {MATCH.round} of {MATCH.maxRounds} · overtime on · recording
            </p>
            <div className="sf__progress">
              <div className="sf__progressFill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </section>

        {/*
          The primary act on this direction. One tap restages the whole night,
          which is why it sits above the roster and below nothing.
        */}
        <section className="sf__card">
          <div className="sf__cardHead">
            <h2 className="sf__cardTitle">Play something</h2>
            <button className="sf__link" type="button">
              Edit
            </button>
          </div>
          <div className="sf__chips">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`sf__chip${p.id === "competitive" ? " sf__chip--on" : ""}`}
              >
                <span className="sf__chipName">{p.label}</span>
                <span className="sf__chipNote">
                  {p.shape} · {p.note}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="sf__card">
          <div className="sf__cardHead">
            <h2 className="sf__cardTitle">Who&rsquo;s on · {PLAYERS.length}</h2>
            <button className="sf__link" type="button">
              See all
            </button>
          </div>
          {PLAYERS.slice(0, 5).map((p) => (
            <div key={p.id} className="sf__player">
              <span className={`sf__pAvatar sf__pAvatar--${p.side}`} aria-hidden>
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <span className="sf__pName">{p.name}</span>
                <br />
                <span className="sf__pMeta">
                  {p.side === "ct" ? MATCH.ct.name : MATCH.t.name}
                  {p.captain ? " · captain" : ""}
                </span>
              </span>
              <span className="sf__pStat">
                <span className="sf__pKd">
                  {p.kills}/{p.deaths}
                </span>
                <br />
                <span className="sf__pAdr">{p.adr} adr</span>
              </span>
            </div>
          ))}
        </section>

        <section className="sf__card">
          <div className="sf__cardHead">
            <h2 className="sf__cardTitle">Change the map</h2>
            <button className="sf__link" type="button">
              Workshop
            </button>
          </div>
          <div className="sf__maps">
            {MAP_POOL.slice(0, 6).map((m) => (
              <button
                key={m.name}
                type="button"
                className={`sf__map${m.state === "banned" ? " sf__map--out" : ""}`}
                style={{ backgroundImage: `url(${mapArt(m.name)})` }}
              >
                <span className="sf__mapVeil" aria-hidden />
                <span className="sf__mapName">{m.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sf__card">
          <div className="sf__cardHead">
            <h2 className="sf__cardTitle">Match controls</h2>
          </div>
          <div className="sf__acts">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`sf__act${a.id === "restart" ? " sf__act--danger" : ""}`}
              >
                <span>
                  <span className="sf__actName">{a.label}</span>
                  <br />
                  <span className="sf__actHint">{a.hint}</span>
                </span>
                <span className="sf__actArrow" aria-hidden>
                  ›
                </span>
              </button>
            ))}
          </div>
        </section>

        <button className="sf__cta" type="button">
          Copy connect link
        </button>
      </div>

      <nav className="sf__tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`sf__tab${t.on ? " sf__tab--on" : ""}`}>
            <span className="sf__tabGlyph" aria-hidden>
              {t.glyph}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
