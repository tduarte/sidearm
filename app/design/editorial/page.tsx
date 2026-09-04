"use client";

/**
 * Direction 4 — EDITORIAL.
 *
 * Premise: everything in this category is a dark gamer panel, so the loudest
 * thing available is to make it look like a printed match report. Paper, ink,
 * hairlines, a serif display face, real typographic hierarchy, and no boxes
 * around anything. State is carried by type weight and one deep red, not by
 * chips and glows.
 *
 * The bet is that a server panel is mostly *read*, and that a page which reads
 * like a broadsheet is easier to scan than one that reads like a control room.
 * Actions still exist, set as a small ruled column so the page never turns into
 * a wall of buttons.
 *
 * The cost, stated honestly: light and serif is unfashionable next to the game
 * itself, and this direction has the least room to grow loud — if a future
 * feature genuinely needs urgency, there is only one red left to spend.
 */

import { MATCH, SERVER, PLAYERS, CT_PLAYERS, T_PLAYERS, MAP_POOL, ACTIONS, kd } from "@/lib/design/mock";

const css = `
.ed {
  --paper: #faf9f7;
  --ink: #161513;
  --soft: #56534c;
  --rule: #dcd8d0;
  --accent: #a4262c;
  min-height: calc(100svh - 32px);
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.55;
  padding: 0 28px 80px;
}
.ed__wrap { max-width: 1080px; margin: 0 auto; }
.ed__serif { font-family: ui-serif, Georgia, "Times New Roman", serif; }

/* masthead */
.ed__mast {
  display: flex; align-items: baseline; justify-content: space-between; gap: 24px;
  padding: 26px 0 10px; border-bottom: 2px solid var(--ink);
}
.ed__logo { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
.ed__dateline {
  font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--soft);
  text-align: right;
}
.ed__strap {
  display: flex; gap: 24px; flex-wrap: wrap;
  padding: 7px 0; border-bottom: 1px solid var(--rule);
  font-size: 11px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--soft);
}
.ed__strap b { color: var(--ink); font-weight: 600; letter-spacing: 0.06em; }
.ed__red { color: var(--accent); }

/* lede */
.ed__lede { display: grid; grid-template-columns: 1fr 320px; gap: 44px; padding: 34px 0 30px; border-bottom: 1px solid var(--rule); }
.ed__kicker { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); margin: 0 0 10px; }
.ed__head { font-size: clamp(34px, 5.2vw, 58px); font-weight: 500; line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 14px; }
.ed__standfirst { font-size: 17px; line-height: 1.5; color: var(--soft); margin: 0; max-width: 52ch; }
.ed__standfirst b { color: var(--ink); font-weight: 600; }

.ed__figure { border-left: 1px solid var(--rule); padding-left: 22px; }
.ed__figRow { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.ed__team { font-size: 15px; }
.ed__num { font-size: 46px; line-height: 1; font-variant-numeric: tabular-nums; font-weight: 500; }
.ed__num--lead { color: var(--accent); }
.ed__figRule { border: 0; border-top: 1px solid var(--rule); margin: 12px 0; }
.ed__caption { font-size: 12px; color: var(--soft); line-height: 1.5; }

/* body columns */
.ed__cols { display: grid; grid-template-columns: 1fr 1fr 220px; gap: 40px; padding-top: 30px; }
.ed__h2 {
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--soft);
  margin: 0 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--ink);
  font-family: var(--font-geist-sans), system-ui, sans-serif; font-weight: 600;
}
.ed__tbl { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.ed__tbl th {
  font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--soft);
  font-weight: 600; text-align: right; padding-bottom: 5px;
}
.ed__tbl th:first-child, .ed__tbl td:first-child { text-align: left; }
.ed__tbl td { padding: 5px 0; border-top: 1px solid var(--rule); font-size: 13.5px; }
.ed__tbl tr:first-child td { border-top: 1px solid var(--rule); }
.ed__name { font-weight: 600; }
.ed__cap { color: var(--accent); font-size: 10px; letter-spacing: 0.1em; margin-left: 5px; }
.ed__soft { color: var(--soft); }

.ed__list { list-style: none; margin: 0; padding: 0; }
.ed__li { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-top: 1px solid var(--rule); font-size: 13.5px; }
.ed__li:first-child { border-top: 0; }
.ed__li s { color: var(--soft); }
.ed__tag { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--soft); }
.ed__tag--now { color: var(--accent); font-weight: 600; }

.ed__act {
  display: block; width: 100%; text-align: left; background: none; cursor: pointer;
  border: 0; border-top: 1px solid var(--rule); padding: 9px 0;
}
.ed__act:first-of-type { border-top: 0; }
.ed__act:hover .ed__actName { color: var(--accent); }
.ed__actName { display: block; font-size: 14px; font-weight: 600; }
.ed__actNote { display: block; font-size: 12px; color: var(--soft); line-height: 1.4; }
.ed__act--danger .ed__actName { color: var(--accent); }

.ed__colophon {
  margin-top: 44px; padding-top: 12px; border-top: 2px solid var(--ink);
  display: flex; flex-wrap: wrap; gap: 20px;
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--soft);
}
.ed__colophon b { color: var(--ink); font-weight: 600; }

@media (max-width: 900px) {
  .ed__lede { grid-template-columns: 1fr; gap: 28px; }
  .ed__figure { border-left: 0; border-top: 1px solid var(--rule); padding: 20px 0 0; }
  .ed__cols { grid-template-columns: 1fr; gap: 32px; }
}
@media (max-width: 640px) { .ed { padding: 0 18px 60px; } }
`;

function Scoreboard({ title, rows }: { title: string; rows: typeof PLAYERS }) {
  return (
    <section>
      <h2 className="ed__h2">{title}</h2>
      <table className="ed__tbl">
        <thead>
          <tr>
            <th>Player</th>
            <th>K</th>
            <th>D</th>
            <th>K/D</th>
            <th>ADR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="ed__name">{p.name}</span>
                {p.captain && <span className="ed__cap">Capt</span>}
              </td>
              <td>{p.kills}</td>
              <td className="ed__soft">{p.deaths}</td>
              <td>{kd(p)}</td>
              <td>{p.adr}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function EditorialDirection() {
  const ctLeads = MATCH.ct.score >= MATCH.t.score;

  return (
    <div className="ed">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="ed__wrap">
        <header className="ed__mast">
          <h1 className="ed__logo ed__serif">Sidearm</h1>
          <p className="ed__dateline">
            {SERVER.hostname} · {SERVER.ip}:{SERVER.port}
            <br />
            Tuesday edition · up {SERVER.uptimeHours} hours
          </p>
        </header>

        <nav className="ed__strap">
          <span>
            Status <b className="ed__red">Live</b>
          </span>
          <span>
            Mode <b>{MATCH.mode}</b>
          </span>
          <span>
            Players <b>{SERVER.slotsUsed}/{SERVER.slotsTotal}</b>
          </span>
          <span>
            Demo <b>Recording</b>
          </span>
          <span>
            VAC <b>Secure</b>
          </span>
          <span>
            Build <b>{SERVER.build}</b>
          </span>
        </nav>

        <div className="ed__lede">
          <div>
            <p className="ed__kicker">
              {MATCH.series.format} · Map {MATCH.series.mapIndex} of three · Overtime enabled
            </p>
            <h2 className="ed__head ed__serif">
              {MATCH.ct.name} lead by two on {MATCH.mapLabel}
            </h2>
            <p className="ed__standfirst">
              Round {MATCH.round} of {MATCH.maxRounds}. <b>{MATCH.ct.name}</b> took the series
              opener on Inferno; <b>{MATCH.t.name}</b> need this one to reach the decider on
              Nuke. Twelve connected, two of them waiting, and the demo has been rolling since the
              knife round.
            </p>
          </div>

          <aside className="ed__figure">
            <div className="ed__figRow">
              <span className="ed__team">{MATCH.ct.name}</span>
              <span className={`ed__num ed__serif${ctLeads ? " ed__num--lead" : ""}`}>
                {MATCH.ct.score}
              </span>
            </div>
            <hr className="ed__figRule" />
            <div className="ed__figRow">
              <span className="ed__team">{MATCH.t.name}</span>
              <span className={`ed__num ed__serif${ctLeads ? "" : " ed__num--lead"}`}>
                {MATCH.t.score}
              </span>
            </div>
            <hr className="ed__figRule" />
            <p className="ed__caption">
              Series {MATCH.series.wonCt}&ndash;{MATCH.series.wonT}. Sides swap at round{" "}
              {MATCH.maxRounds / 2}; overtime is MR3 with 10,000 starting money.
            </p>
          </aside>
        </div>

        <div className="ed__cols">
          <Scoreboard title={`${MATCH.ct.name} — Counter-Terrorists`} rows={CT_PLAYERS} />
          <Scoreboard title={`${MATCH.t.name} — Terrorists`} rows={T_PLAYERS} />

          <div>
            <section>
              <h2 className="ed__h2">The veto</h2>
              <ul className="ed__list">
                {MAP_POOL.map((m) => (
                  <li key={m.name} className="ed__li">
                    <span>
                      {m.state === "banned" ? <s>{m.label}</s> : m.label}
                    </span>
                    <span className={`ed__tag${m.state === "picked" ? " ed__tag--now" : ""}`}>
                      {m.state === "banned" ? `ban ${m.by ?? ""}` : m.state}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/*
              Actions are set as a ruled column rather than a row of buttons: on
              a page this quiet, weight and a single red are enough signal, and
              a button bar would be the one loud object on the page.
            */}
            <section style={{ marginTop: "26px" }}>
              <h2 className="ed__h2">Interventions</h2>
              {ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`ed__act${a.id === "restart" ? " ed__act--danger" : ""}`}
                >
                  <span className="ed__actName">{a.label}</span>
                  <span className="ed__actNote">{a.hint}</span>
                </button>
              ))}
            </section>
          </div>
        </div>

        <footer className="ed__colophon">
          <span>
            CPU <b>{SERVER.cpuPct}%</b>
          </span>
          <span>
            Memory <b>{(SERVER.memMb / 1024).toFixed(1)} of {(SERVER.memMaxMb / 1024).toFixed(0)} GiB</b>
          </span>
          <span>
            Tick <b>{SERVER.tickrate}</b>
          </span>
          <span>
            Recording <b>{MATCH.recording}</b>
          </span>
        </footer>
      </div>
    </div>
  );
}
