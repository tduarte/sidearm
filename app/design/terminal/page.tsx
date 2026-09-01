"use client";

/**
 * Direction 2 — TERMINAL.
 *
 * Premise: you already know what you want to do, and the fastest interface is
 * the one that never makes you aim. Everything is text in one column, ordered
 * by how often you need it, with a single-key binding on every action and a
 * command line at the bottom that can reach anything the keys cannot.
 *
 * No cards, no shadows, no rounded corners, no images. One colour does the
 * whole job of state — amber phosphor on near-black — with red reserved for
 * the two things that can hurt. Density is the feature: the entire server fits
 * above the fold, so "what is going on" needs no scrolling and no navigation.
 *
 * The cost, stated honestly: it is hostile to a phone and to anyone who does
 * not already know the vocabulary. It is the direction for the person who runs
 * the server, not the four friends who look at it once a month.
 */

import { useState } from "react";
import { MATCH, SERVER, PLAYERS, MAP_POOL, kd } from "@/lib/design/mock";

const css = `
.tm {
  --bg: #0a0b0a;
  --fg: #d6d3c8;
  --dim: #6d6a60;
  --amber: #e8b923;
  --red: #ff5f56;
  --green: #7fd17f;
  --rule: #1e1f1c;
  min-height: calc(100svh - 32px);
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace;
  font-size: 13px;
  line-height: 1.65;
  padding: 26px 20px 0;
}
.tm__wrap { max-width: 104ch; margin: 0 auto; padding-bottom: 100px; }
.tm__banner { color: var(--amber); white-space: pre; font-size: 12px; line-height: 1.25; margin-bottom: 14px; }
.tm__rule { color: var(--rule); overflow: hidden; white-space: nowrap; user-select: none; }
.tm__sec { margin: 22px 0 8px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; }
.tm__sec b { color: var(--amber); font-weight: 400; }

.tm__kv { display: grid; grid-template-columns: 14ch 1fr; }
.tm__k { color: var(--dim); }
.tm__v { color: var(--fg); }
.tm__v--ok { color: var(--green); }
.tm__v--hot { color: var(--amber); }
.tm__v--bad { color: var(--red); }

.tm__meter { color: var(--dim); }
.tm__meter i { color: var(--amber); font-style: normal; }

.tm__tbl { width: 100%; border-collapse: collapse; }
.tm__tbl th {
  text-align: right; font-weight: 400; color: var(--dim);
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
  padding: 2px 0 6px; border-bottom: 1px solid var(--rule);
}
.tm__tbl th:first-child, .tm__tbl td:first-child { text-align: left; }
.tm__tbl td { padding: 1px 0; font-variant-numeric: tabular-nums; }
.tm__tbl td:not(:first-child) { text-align: right; padding-left: 2ch; }
.tm__tbl tr:hover td { background: rgba(232,185,35,0.07); }
.tm__ct { color: #7ea9e8; }
.tm__t { color: var(--amber); }
.tm__dim { color: var(--dim); }

.tm__keys { display: flex; flex-wrap: wrap; gap: 0 3ch; margin-top: 4px; }
.tm__key { background: none; border: 0; padding: 0; font: inherit; color: var(--fg); cursor: pointer; text-align: left; }
.tm__key:hover { color: var(--amber); }
.tm__key kbd {
  font: inherit; color: var(--bg); background: var(--amber);
  padding: 0 0.55ch; margin-right: 0.7ch;
}
.tm__key--danger:hover { color: var(--red); }
.tm__key--danger kbd { background: var(--red); }

.tm__prompt {
  position: fixed; left: 0; right: 0; bottom: 0;
  background: var(--bg); border-top: 1px solid var(--rule);
  padding: 10px 20px calc(10px + env(safe-area-inset-bottom));
}
.tm__promptInner { max-width: 104ch; margin: 0 auto; display: flex; align-items: baseline; gap: 1ch; }
.tm__sigil { color: var(--amber); }
.tm__input {
  flex: 1; background: transparent; border: 0; outline: none;
  color: var(--fg); font: inherit; caret-color: var(--amber);
}
.tm__input::placeholder { color: var(--dim); }
.tm__caret { width: 0.8ch; height: 1.05em; background: var(--amber); display: inline-block; animation: tmblink 1.1s steps(1) infinite; }
@keyframes tmblink { 0%,50% { opacity: 1 } 50.01%,100% { opacity: 0 } }
.tm__hint { color: var(--dim); font-size: 11px; margin-top: 4px; }

@media (max-width: 640px) {
  .tm { font-size: 12px; padding: 18px 12px 0; }
  .tm__kv { grid-template-columns: 12ch 1fr; }
  .tm__banner { font-size: 10px; }
}
`;

const BANNER = `   ▄▄▄  ▄  ▄▄▄  ▄▄▄  ▄▄▄  ▄▄▄  ▄▄▄
   ███  █  ███  ███  ███  ███  ███   sidearm ${"//"} cs2
   ▀▀▀  ▀  ▀▀▀  ▀▀▀  ▀▀▀  ▀▀▀  ▀▀▀`;

function bar(value: number, max: number, width = 24) {
  const filled = Math.round((value / max) * width);
  return { on: "█".repeat(filled), off: "░".repeat(width - filled) };
}

function Rule() {
  return (
    <div className="tm__rule" aria-hidden>
      {"─".repeat(200)}
    </div>
  );
}

export default function TerminalDirection() {
  const [cmd, setCmd] = useState("");
  const cpu = bar(SERVER.cpuPct, 100);
  const mem = bar(SERVER.memMb, SERVER.memMaxMb);
  const slots = bar(SERVER.slotsUsed, SERVER.slotsTotal, 12);

  return (
    <div className="tm">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="tm__wrap">
        <pre className="tm__banner">{BANNER}</pre>
        <Rule />

        <p className="tm__sec">
          server <b>{SERVER.hostname}</b>
        </p>
        <div className="tm__kv">
          <span className="tm__k">state</span>
          <span className="tm__v tm__v--ok">running · vac secure · up {SERVER.uptimeHours}h</span>
          <span className="tm__k">connect</span>
          <span className="tm__v">{SERVER.ip}:{SERVER.port}</span>
          <span className="tm__k">build</span>
          <span className="tm__v tm__dim">{SERVER.build} · tick {SERVER.tickrate}</span>
          <span className="tm__k">slots</span>
          <span className="tm__meter">
            <i>{slots.on}</i>{slots.off} {SERVER.slotsUsed}/{SERVER.slotsTotal}
          </span>
          <span className="tm__k">cpu</span>
          <span className="tm__meter">
            <i>{cpu.on}</i>{cpu.off} {SERVER.cpuPct}%
          </span>
          <span className="tm__k">mem</span>
          <span className="tm__meter">
            <i>{mem.on}</i>{mem.off} {(SERVER.memMb / 1024).toFixed(1)}/{(SERVER.memMaxMb / 1024).toFixed(0)} GiB
          </span>
        </div>

        <p className="tm__sec">
          match <b>{MATCH.mapLabel}</b> · {MATCH.series.format} map {MATCH.series.mapIndex}
        </p>
        <div className="tm__kv">
          <span className="tm__k">score</span>
          <span className="tm__v">
            <span className="tm__ct">{MATCH.ct.name} {MATCH.ct.score}</span>
            <span className="tm__dim"> — </span>
            <span className="tm__t">{MATCH.t.score} {MATCH.t.name}</span>
          </span>
          <span className="tm__k">round</span>
          <span className="tm__v">
            {MATCH.round}/{MATCH.maxRounds} <span className="tm__dim">live · overtime on</span>
          </span>
          <span className="tm__k">demo</span>
          <span className="tm__v tm__v--hot">rec {MATCH.recording}</span>
          <span className="tm__k">veto</span>
          <span className="tm__v tm__dim">
            {MAP_POOL.map((m) => (
              <span key={m.name}>
                {m.state === "banned" ? (
                  <span className="tm__dim">
                    <s>{m.label}</s>{" "}
                  </span>
                ) : (
                  <span className={m.state === "decider" ? "tm__v" : "tm__v--hot"}>
                    {m.label}
                    {m.state === "decider" ? "*" : ""}{" "}
                  </span>
                )}
              </span>
            ))}
          </span>
        </div>

        <p className="tm__sec">
          players <b>{PLAYERS.length}</b>
        </p>
        <table className="tm__tbl">
          <thead>
            <tr>
              <th>name</th>
              <th>side</th>
              <th>k</th>
              <th>d</th>
              <th>a</th>
              <th>k/d</th>
              <th>adr</th>
              <th>ms</th>
            </tr>
          </thead>
          <tbody>
            {PLAYERS.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  {p.captain && <span className="tm__dim"> (c)</span>}
                </td>
                <td className={p.side === "ct" ? "tm__ct" : "tm__t"}>{p.side}</td>
                <td>{p.kills}</td>
                <td className="tm__dim">{p.deaths}</td>
                <td className="tm__dim">{p.assists}</td>
                <td>{kd(p)}</td>
                <td>{p.adr}</td>
                <td className={p.ping > 50 ? "tm__t" : "tm__dim"}>{p.ping}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="tm__sec">actions</p>
        <div className="tm__keys">
          <button className="tm__key" type="button">
            <kbd>p</kbd>pause
          </button>
          <button className="tm__key" type="button">
            <kbd>s</kbd>swap sides
          </button>
          <button className="tm__key" type="button">
            <kbd>k</kbd>knife round
          </button>
          <button className="tm__key" type="button">
            <kbd>m</kbd>change map
          </button>
          <button className="tm__key" type="button">
            <kbd>b</kbd>restore backup
          </button>
          <button className="tm__key tm__key--danger" type="button">
            <kbd>X</kbd>end match
          </button>
          <button className="tm__key tm__key--danger" type="button">
            <kbd>R</kbd>restart server
          </button>
        </div>
      </div>

      {/*
        The escape hatch. Every panel eventually meets a cvar nobody built a
        button for; here that is not a failure of the design, it is the design.
      */}
      <div className="tm__prompt">
        <div className="tm__promptInner">
          <span className="tm__sigil">sidearm ▸</span>
          <input
            className="tm__input"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="rcon, or a command — try 'map', 'kick', 'preset wingman'"
            aria-label="Command"
            spellCheck={false}
          />
          <span className="tm__caret" aria-hidden />
        </div>
        <p className="tm__promptInner tm__hint">
          ⌃K history · ⇥ complete · anything not a panel command goes straight to RCON
        </p>
      </div>
    </div>
  );
}
