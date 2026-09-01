"use client";

/**
 * Direction 1 — BROADCAST.
 *
 * Premise: the match is the product, and the panel is the thing you glance at
 * from across the room while you are playing. So the scoreboard is not a card
 * on a dashboard — it *is* the page, at stadium scale, with the two sides given
 * real estate and colour in proportion to how much anybody cares about them.
 *
 * Everything administrative retreats to a switcher strip along the bottom, the
 * way a broadcast gallery keeps its buttons under the programme feed. Nothing
 * in the top two thirds is a control.
 *
 * Type is condensed, uppercase and tight; numerals are enormous and tabular.
 * The one thing this direction refuses is neutrality — CT blue and T orange are
 * used as full colour fields rather than as 12%-opacity accent tints.
 */

import { MATCH, SERVER, CT_PLAYERS, T_PLAYERS, mapArt, kd, type MockPlayer } from "@/lib/design/mock";

const css = `
.bc {
  --ct: #3d8bfd;
  --t: #ff9422;
  --stage: #06070a;
  --line: rgba(255,255,255,0.09);
  min-height: calc(100svh - 32px);
  background: var(--stage);
  color: #fff;
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.bc__art {
  position: absolute; inset: 0;
  background-size: cover; background-position: center 35%;
  opacity: 0.28;
  filter: saturate(0.5) contrast(1.1);
}
.bc__veil {
  position: absolute; inset: 0;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0.15), rgba(6,7,10,0.92) 70%),
    linear-gradient(180deg, rgba(6,7,10,0.4) 0%, rgba(6,7,10,0.98) 62%);
}
.bc__body { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; }

/* ---- the band ---- */
.bc__band {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: stretch;
  border-bottom: 1px solid var(--line);
}
.bc__side { padding: 28px 32px 24px; display: flex; align-items: center; gap: 28px; }
.bc__side--t { flex-direction: row-reverse; text-align: right; }
.bc__sideMark { width: 6px; align-self: stretch; border-radius: 99px; }
.bc__ct .bc__sideMark { background: var(--ct); box-shadow: 0 0 40px 2px rgba(61,139,253,0.55); }
.bc__t .bc__sideMark { background: var(--t); box-shadow: 0 0 40px 2px rgba(255,148,34,0.5); }
.bc__team { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.bc__tag {
  font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
  color: rgba(255,255,255,0.45); font-weight: 600;
}
.bc__ct .bc__tag { color: var(--ct); }
.bc__t .bc__tag { color: var(--t); }
.bc__name {
  font-size: clamp(18px, 2.4vw, 30px); font-weight: 800;
  letter-spacing: -0.02em; text-transform: uppercase; line-height: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bc__score {
  font-size: clamp(56px, 11vw, 132px); font-weight: 800; line-height: 0.8;
  letter-spacing: -0.05em; font-variant-numeric: tabular-nums;
  margin-left: auto;
}
.bc__side--t .bc__score { margin-left: 0; margin-right: auto; }

.bc__centre {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 24px 20px; min-width: 220px;
  border-left: 1px solid var(--line); border-right: 1px solid var(--line);
  background: rgba(255,255,255,0.02);
}
.bc__live {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 11px; letter-spacing: 0.2em; font-weight: 700; text-transform: uppercase;
  color: #ff4d4d;
}
.bc__dot { width: 7px; height: 7px; border-radius: 99px; background: #ff4d4d; animation: bcpulse 1.6s ease-in-out infinite; }
@keyframes bcpulse { 0%,100% { opacity: 1; transform: scale(1);} 50% { opacity: 0.35; transform: scale(0.82);} }
.bc__map { font-size: clamp(22px, 2.6vw, 34px); font-weight: 800; letter-spacing: -0.02em; text-transform: uppercase; }
.bc__round { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.5); font-variant-numeric: tabular-nums; }
.bc__pips { display: flex; gap: 5px; margin-top: 2px; }
.bc__pip { width: 26px; height: 4px; background: rgba(255,255,255,0.16); }
.bc__pip--ct { background: var(--ct); }
.bc__pip--t { background: var(--t); }
.bc__pip--now { background: #fff; }

/* ---- the two columns ---- */
.bc__grid { display: grid; grid-template-columns: 1fr 1fr; flex: 1; min-height: 0; }
.bc__col { padding: 18px 20px 24px; min-width: 0; }
.bc__col + .bc__col { border-left: 1px solid var(--line); }
.bc__head {
  display: grid; grid-template-columns: 1fr repeat(4, 46px);
  gap: 8px; padding: 0 10px 8px;
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.35); font-weight: 600;
}
.bc__head span:not(:first-child), .bc__row span:not(:first-child) { text-align: right; }
.bc__row {
  display: grid; grid-template-columns: 1fr repeat(4, 46px);
  gap: 8px; align-items: center;
  padding: 11px 10px; position: relative;
  font-variant-numeric: tabular-nums;
  border-top: 1px solid rgba(255,255,255,0.05);
}
.bc__bar { position: absolute; inset: 0 auto 0 0; opacity: 0.13; pointer-events: none; }
.bc__ctcol .bc__bar { background: linear-gradient(90deg, var(--ct), transparent); }
.bc__tcol .bc__bar { background: linear-gradient(90deg, var(--t), transparent); }
.bc__who { display: flex; align-items: center; gap: 9px; min-width: 0; position: relative; }
.bc__player { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc__c { font-size: 9px; font-weight: 800; letter-spacing: 0.1em; padding: 2px 4px; background: rgba(255,255,255,0.14); }
.bc__num { font-size: 14px; font-weight: 600; position: relative; }
.bc__num--dim { color: rgba(255,255,255,0.4); font-weight: 500; }

/* ---- the gallery strip ---- */
.bc__strip {
  position: relative; display: flex; align-items: stretch; flex-wrap: wrap;
  border-top: 1px solid var(--line); background: rgba(0,0,0,0.5);
}
.bc__btn {
  flex: 1 1 140px; min-height: 62px; padding: 12px 16px;
  display: flex; flex-direction: column; justify-content: center; gap: 3px;
  background: transparent; border: 0; border-right: 1px solid var(--line);
  color: #fff; text-align: left; cursor: pointer; transition: background 120ms;
}
.bc__btn:hover { background: rgba(255,255,255,0.07); }
.bc__btn:last-child { border-right: 0; }
.bc__btnLabel { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.bc__btnHint { font-size: 11px; color: rgba(255,255,255,0.42); }
.bc__btn--danger .bc__btnLabel { color: #ff5a5a; }
.bc__meta {
  flex: 2 1 260px; min-height: 62px; padding: 12px 18px;
  display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.42);
  border-right: 1px solid var(--line);
}
.bc__meta b { color: #fff; font-weight: 700; letter-spacing: 0.04em; }
.bc__rec { color: #ff4d4d; }

@media (max-width: 860px) {
  .bc__band { grid-template-columns: 1fr; }
  .bc__centre { border-left: 0; border-right: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); order: -1; }
  .bc__side { padding: 18px 20px; }
  .bc__grid { grid-template-columns: 1fr; }
  .bc__col + .bc__col { border-left: 0; border-top: 1px solid var(--line); }
  .bc__head, .bc__row { grid-template-columns: 1fr repeat(4, 38px); }
}
`;

function Row({ p, side }: { p: MockPlayer; side: "ct" | "t" }) {
  return (
    <div className="bc__row">
      <span
        className="bc__bar"
        style={{ width: `${Math.min(100, (p.adr / 100) * 100)}%` }}
        aria-hidden
      />
      <span className="bc__who">
        <span className="bc__player">{p.name}</span>
        {p.captain && <span className="bc__c">C</span>}
      </span>
      <span className="bc__num">{p.kills}</span>
      <span className="bc__num bc__num--dim">{p.deaths}</span>
      <span className="bc__num">{kd(p)}</span>
      <span className="bc__num bc__num--dim">{p.adr}</span>
      <span hidden>{side}</span>
    </div>
  );
}

export default function BroadcastDirection() {
  const { series } = MATCH;
  const pips = [
    { key: 0, cls: series.wonCt > 0 ? "bc__pip--ct" : "" },
    { key: 1, cls: "bc__pip--now" },
    { key: 2, cls: "" },
  ];

  return (
    <div className="bc">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="bc__art" style={{ backgroundImage: `url(${mapArt(MATCH.map)})` }} aria-hidden />
      <div className="bc__veil" aria-hidden />

      <div className="bc__body">
        <div className="bc__band">
          <div className="bc__side bc__ct">
            <span className="bc__sideMark" aria-hidden />
            <span className="bc__team">
              <span className="bc__tag">Counter-Terrorists</span>
              <span className="bc__name">{MATCH.ct.name}</span>
            </span>
            <span className="bc__score">{MATCH.ct.score}</span>
          </div>

          <div className="bc__centre">
            <span className="bc__live">
              <span className="bc__dot" aria-hidden />
              Live
            </span>
            <span className="bc__map">{MATCH.mapLabel}</span>
            <span className="bc__round">
              Round {MATCH.round} of {MATCH.maxRounds}
            </span>
            <span className="bc__pips" aria-label="Best of three, map two">
              {pips.map((p) => (
                <span key={p.key} className={`bc__pip ${p.cls}`} />
              ))}
            </span>
            <span className="bc__round">{series.format} · map {series.mapIndex}</span>
          </div>

          <div className="bc__side bc__side--t bc__t">
            <span className="bc__sideMark" aria-hidden />
            <span className="bc__team">
              <span className="bc__tag">Terrorists</span>
              <span className="bc__name">{MATCH.t.name}</span>
            </span>
            <span className="bc__score">{MATCH.t.score}</span>
          </div>
        </div>

        <div className="bc__grid">
          <div className="bc__col bc__ctcol">
            <div className="bc__head">
              <span>Counter-Terrorists</span>
              <span>K</span>
              <span>D</span>
              <span>K/D</span>
              <span>ADR</span>
            </div>
            {CT_PLAYERS.map((p) => (
              <Row key={p.id} p={p} side="ct" />
            ))}
          </div>
          <div className="bc__col bc__tcol">
            <div className="bc__head">
              <span>Terrorists</span>
              <span>K</span>
              <span>D</span>
              <span>K/D</span>
              <span>ADR</span>
            </div>
            {T_PLAYERS.map((p) => (
              <Row key={p.id} p={p} side="t" />
            ))}
          </div>
        </div>

        {/*
          The gallery. Everything you can do to a live match, in one row, with
          the blast radius written under the label instead of hidden in a
          confirm dialog nobody reads.
        */}
        <div className="bc__strip">
          <div className="bc__meta">
            <span>
              <b>{SERVER.hostname}</b> · {SERVER.slotsUsed}/{SERVER.slotsTotal}
            </span>
            <span className="bc__rec">● REC</span>
            <span>
              <b>{SERVER.connectUrl.replace("connect ", "")}</b>
            </span>
          </div>
          <button className="bc__btn" type="button">
            <span className="bc__btnLabel">Pause</span>
            <span className="bc__btnHint">At the next freeze</span>
          </button>
          <button className="bc__btn" type="button">
            <span className="bc__btnLabel">Swap</span>
            <span className="bc__btnHint">Sides, now</span>
          </button>
          <button className="bc__btn" type="button">
            <span className="bc__btnLabel">Backup</span>
            <span className="bc__btnHint">Round 11</span>
          </button>
          <button className="bc__btn bc__btn--danger" type="button">
            <span className="bc__btnLabel">End match</span>
            <span className="bc__btnHint">Drops the series</span>
          </button>
        </div>
      </div>
    </div>
  );
}
