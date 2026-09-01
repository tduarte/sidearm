"use client";

/**
 * Direction 3 — LAUNCHER.
 *
 * Premise: this is not an admin tool, it is the front door to a night out.
 * The panel should feel like the game does — a big picture of where you are
 * going, one obvious thing to press, and everything else out of the way until
 * you ask for it.
 *
 * So: a cinematic hero of the current map at half the viewport, the session
 * you would start as a single primary action, and the modes as a shelf of
 * large artwork tiles you scroll like a library. The friends list is a rail,
 * because "who is on" is the actual reason anyone opens this before 9pm.
 *
 * Text density is deliberately low. Round limits and cvars are not on this
 * screen at all — this direction says the panel's job is starting things, and
 * that tuning belongs behind a settings door most nights never open.
 */

import { MATCH, PRESETS, SERVER, PLAYERS, MAP_POOL, mapArt } from "@/lib/design/mock";

const css = `
.ln {
  --ink: #f2f4f8;
  --sub: #99a1b3;
  --bg: #0e1016;
  --card: #171a23;
  --edge: #242936;
  --accent: #ff6a2b;
  --accent-ink: #14060a;
  min-height: calc(100svh - 32px);
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
.ln__grid { display: grid; grid-template-columns: minmax(0,1fr) 280px; min-height: calc(100svh - 32px); }

/* ---- hero ---- */
.ln__hero {
  position: relative; min-height: 54vh; display: flex; align-items: flex-end;
  padding: 40px; overflow: hidden;
}
.ln__heroArt {
  position: absolute; inset: 0; background-size: cover; background-position: center 40%;
  transform: scale(1.03);
}
.ln__heroVeil {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(14,16,22,0.55) 0%, rgba(14,16,22,0.1) 30%, rgba(14,16,22,0.94) 88%),
    linear-gradient(90deg, rgba(14,16,22,0.85) 0%, transparent 55%);
}
.ln__heroBody { position: relative; max-width: 620px; }
.ln__eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--accent); margin-bottom: 14px;
}
.ln__pulse { width: 8px; height: 8px; border-radius: 99px; background: var(--accent); }
.ln__title {
  font-size: clamp(40px, 7vw, 82px); font-weight: 800; line-height: 0.92;
  letter-spacing: -0.035em; margin: 0 0 12px;
}
.ln__sub { font-size: 17px; color: var(--sub); margin: 0 0 26px; line-height: 1.5; }
.ln__sub b { color: var(--ink); font-weight: 600; }
.ln__cta { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.ln__play {
  display: inline-flex; align-items: center; gap: 12px;
  background: var(--accent); color: var(--accent-ink);
  border: 0; border-radius: 14px; cursor: pointer;
  padding: 17px 30px; font-size: 17px; font-weight: 800; letter-spacing: -0.01em;
  box-shadow: 0 12px 34px -12px rgba(255,106,43,0.75);
  transition: transform 130ms ease, box-shadow 130ms ease;
}
.ln__play:hover { transform: translateY(-2px); box-shadow: 0 18px 42px -12px rgba(255,106,43,0.85); }
.ln__ghost {
  border-radius: 14px; padding: 17px 22px; cursor: pointer;
  background: rgba(255,255,255,0.07); border: 1px solid var(--edge);
  color: var(--ink); font-size: 15px; font-weight: 600;
}
.ln__ghost:hover { background: rgba(255,255,255,0.12); }
.ln__score {
  display: inline-flex; align-items: baseline; gap: 10px; margin-left: 6px;
  font-variant-numeric: tabular-nums; color: var(--sub); font-size: 15px;
}
.ln__score b { color: var(--ink); font-size: 22px; font-weight: 800; }

/* ---- shelves ---- */
.ln__main { padding: 34px 40px 60px; display: flex; flex-direction: column; gap: 34px; }
.ln__shelfHead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; gap: 16px; }
.ln__shelfTitle { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.ln__shelfMore { font-size: 14px; color: var(--sub); background: none; border: 0; cursor: pointer; }
.ln__shelfMore:hover { color: var(--ink); }
.ln__rail { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; }
.ln__tile {
  position: relative; flex: 0 0 232px; height: 148px; border-radius: 16px; overflow: hidden;
  border: 1px solid var(--edge); background: var(--card); cursor: pointer; text-align: left;
  padding: 0; transition: transform 140ms ease, border-color 140ms ease;
}
.ln__tile:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.32); }
.ln__tileArt { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0.62; }
.ln__tileVeil { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 30%, rgba(10,12,17,0.94)); }
.ln__tileBody { position: absolute; inset: auto 0 0 0; padding: 14px 16px; }
.ln__tileName { display: block; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.ln__tileNote { display: block; font-size: 12.5px; color: var(--sub); margin-top: 2px; }
.ln__badge {
  position: absolute; top: 12px; right: 12px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 4px 8px; border-radius: 99px; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
}
.ln__badge--live { background: var(--accent); color: var(--accent-ink); }
.ln__badge--out { background: rgba(0,0,0,0.66); color: #8b8b95; text-decoration: line-through; }
.ln__tile--mode { height: 120px; flex-basis: 190px; display: flex; align-items: flex-end; }
.ln__tile--mode .ln__tileArt { opacity: 0.34; }

/* ---- friends rail ---- */
.ln__rail2 { border-left: 1px solid var(--edge); background: #10131a; padding: 26px 20px; }
.ln__railHead {
  display: flex; align-items: baseline; justify-content: space-between;
  font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sub);
  margin-bottom: 16px;
}
.ln__friend { display: flex; align-items: center; gap: 11px; padding: 9px 8px; border-radius: 11px; }
.ln__friend:hover { background: rgba(255,255,255,0.05); }
.ln__avatar {
  width: 34px; height: 34px; border-radius: 11px; flex: 0 0 auto;
  display: grid; place-items: center; font-size: 13px; font-weight: 800; color: #0c0d11;
}
.ln__fname { font-size: 14px; font-weight: 600; }
.ln__fmeta { font-size: 12px; color: var(--sub); }
.ln__online { margin-left: auto; width: 7px; height: 7px; border-radius: 99px; background: #46d17f; }
.ln__srv {
  margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--edge);
  display: flex; flex-direction: column; gap: 10px;
}
.ln__srvRow { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--sub); }
.ln__srvRow b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.ln__copy {
  margin-top: 4px; width: 100%; border-radius: 11px; padding: 11px;
  background: rgba(255,255,255,0.06); border: 1px solid var(--edge); color: var(--ink);
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.ln__copy:hover { background: rgba(255,255,255,0.11); }

@media (max-width: 1080px) {
  .ln__grid { grid-template-columns: 1fr; }
  .ln__rail2 { border-left: 0; border-top: 1px solid var(--edge); }
}
@media (max-width: 640px) {
  .ln__hero { padding: 24px; min-height: 46vh; }
  .ln__main { padding: 24px 20px 48px; }
}
`;

const AVATAR_HUES = [12, 46, 158, 205, 268, 320, 92, 24, 186, 300];

export default function LauncherDirection() {
  return (
    <div className="ln">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="ln__grid">
        <div>
          <header className="ln__hero">
            <div
              className="ln__heroArt"
              style={{ backgroundImage: `url(${mapArt(MATCH.map)})` }}
              aria-hidden
            />
            <div className="ln__heroVeil" aria-hidden />
            <div className="ln__heroBody">
              <span className="ln__eyebrow">
                <span className="ln__pulse" aria-hidden />
                Live now · {MATCH.series.format} map {MATCH.series.mapIndex}
              </span>
              <h1 className="ln__title">{MATCH.mapLabel}</h1>
              <p className="ln__sub">
                <b>{MATCH.ct.name}</b> against <b>{MATCH.t.name}</b>, round {MATCH.round}{" "}
                of {MATCH.maxRounds}. Twelve on, ten of them playing.
              </p>
              <div className="ln__cta">
                <button className="ln__play" type="button">
                  Join the server
                </button>
                <button className="ln__ghost" type="button">
                  Watch on GOTV
                </button>
                <span className="ln__score">
                  <b>{MATCH.ct.score}</b> — <b>{MATCH.t.score}</b>
                </span>
              </div>
            </div>
          </header>

          <main className="ln__main">
            <section>
              <div className="ln__shelfHead">
                <h2 className="ln__shelfTitle">Start something else</h2>
                <button className="ln__shelfMore" type="button">
                  All modes
                </button>
              </div>
              <div className="ln__rail">
                {PRESETS.map((p, i) => (
                  <button key={p.id} className="ln__tile ln__tile--mode" type="button">
                    <span
                      className="ln__tileArt"
                      style={{ backgroundImage: `url(${mapArt(MAP_POOL[i % MAP_POOL.length].name)})` }}
                      aria-hidden
                    />
                    <span className="ln__tileVeil" aria-hidden />
                    <span className="ln__badge">{p.shape}</span>
                    <span className="ln__tileBody">
                      <span className="ln__tileName">{p.label}</span>
                      <span className="ln__tileNote">{p.note}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="ln__shelfHead">
                <h2 className="ln__shelfTitle">Tonight&rsquo;s pool</h2>
                <button className="ln__shelfMore" type="button">
                  Redo the veto
                </button>
              </div>
              <div className="ln__rail">
                {MAP_POOL.map((m) => (
                  <button key={m.name} className="ln__tile" type="button">
                    <span
                      className="ln__tileArt"
                      style={{
                        backgroundImage: `url(${mapArt(m.name)})`,
                        opacity: m.state === "banned" ? 0.16 : 0.62,
                        filter: m.state === "banned" ? "grayscale(1)" : undefined,
                      }}
                      aria-hidden
                    />
                    <span className="ln__tileVeil" aria-hidden />
                    {m.state === "picked" && <span className="ln__badge ln__badge--live">Playing</span>}
                    {m.state === "decider" && <span className="ln__badge">Decider</span>}
                    {m.state === "banned" && <span className="ln__badge ln__badge--out">Banned</span>}
                    <span className="ln__tileBody">
                      <span className="ln__tileName">{m.label}</span>
                      <span className="ln__tileNote">
                        {m.by ? `by ${m.by}` : "whatever survives"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </main>
        </div>

        <aside className="ln__rail2">
          <div className="ln__railHead">
            <span>On the server</span>
            <span>{PLAYERS.length}</span>
          </div>
          {PLAYERS.map((p, i) => (
            <div key={p.id} className="ln__friend">
              <span
                className="ln__avatar"
                style={{ background: `hsl(${AVATAR_HUES[i]} 72% 62%)` }}
                aria-hidden
              >
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <span className="ln__fname">{p.name}</span>
                <br />
                <span className="ln__fmeta">
                  {p.side === "ct" ? MATCH.ct.name : MATCH.t.name} · {p.kills}/{p.deaths}
                </span>
              </span>
              <span className="ln__online" aria-label="Connected" />
            </div>
          ))}

          <div className="ln__srv">
            <div className="ln__srvRow">
              <span>Server</span>
              <b>{SERVER.hostname}</b>
            </div>
            <div className="ln__srvRow">
              <span>Slots</span>
              <b>
                {SERVER.slotsUsed}/{SERVER.slotsTotal}
              </b>
            </div>
            <div className="ln__srvRow">
              <span>Up</span>
              <b>{SERVER.uptimeHours}h</b>
            </div>
            <button className="ln__copy" type="button">
              Copy connect link
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
