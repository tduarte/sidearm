/**
 * The index of the five design explorations.
 *
 * Neutral on purpose, like the switcher strip: this page has to sit next to
 * five opinionated worlds without arguing with any of them, so it is a plain
 * dark list with the thesis and the honest cost of each direction.
 */

import Link from "next/link";

const DIRECTION_NOTES = [
  {
    slug: "broadcast",
    name: "Broadcast",
    line: "The match is the product. Scoreboard at stadium scale.",
    what:
      "Full-bleed map art, enormous tabular scores, CT blue and T orange as whole colour fields. The roster is two mirrored columns with damage bars behind each row; controls are a strip at the bottom with their blast radius written under the label.",
    cost:
      "Almost everything is the current match, so any screen that is not a live match has to justify itself. Nine of ten nights it is glorious; the tenth it is an empty stadium.",
  },
  {
    slug: "terminal",
    name: "Terminal",
    line: "Monospace, keyboard-first, the whole server in one screen of text.",
    what:
      "Amber phosphor on near-black, one column, ASCII meters, a single-key binding on every action and a command line pinned to the bottom that reaches anything the keys do not.",
    cost:
      "Hostile to a phone and to anyone who does not already know the vocabulary. Built for whoever runs the server, not for the four friends who open it once a month.",
  },
  {
    slug: "launcher",
    name: "Launcher",
    line: "Cinematic map art, few words, one big thing to press.",
    what:
      "A half-viewport hero of the current map, one hot-orange primary action, modes and the map pool as scrollable artwork shelves, and a friends rail — because 'who is on' is why anyone opens this before 9pm.",
    cost:
      "Round limits and cvars are not on this screen at all. It says the panel's job is starting things and that tuning lives behind a door most nights never open.",
  },
  {
    slug: "editorial",
    name: "Editorial",
    line: "Light, printed, typographic. A match report you would read on paper.",
    what:
      "Paper and ink, hairline rules, a serif masthead and headline, the score set as a large typographic figure, the roster as a properly set table. One deep red carries every bit of state.",
    cost:
      "Unfashionable next to the game itself, and there is only one red left to spend — a future feature that genuinely needs urgency has nowhere louder to go.",
  },
  {
    slug: "soft",
    name: "Soft app",
    line: "A friendly phone app: rounded, roomy, thumb-driven.",
    what:
      "One scrolling column of large rounded cards on a pastel field, a bottom tab bar, and the preset row as the primary act — one tap restages the night. Destructive things sit behind a sheet.",
    cost:
      "The least dense of the five. On a 27-inch monitor it is a narrow ribbon with a lot of air, and per-player detail is a tap deeper than anywhere else.",
  },
];

export default function DesignIndex() {
  return (
    <div className="min-h-svh bg-[#0b0b0e] px-6 py-14 font-sans text-[#e6e6ec]">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#7a7a88]">
          sidearm · panel explorations
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Five directions</h1>
        <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-[#9a9aa8]">
          Five different answers to the same screen, all rendering the same fixture data — a
          Friday best-of-three, second map, ten friends on — so every difference between them
          is a design difference and never a data one. Nothing here is wired to the server;
          buttons do not do anything. Pick the world, and the real panel gets rebuilt in it.
        </p>

        <div className="mt-10 flex flex-col gap-3">
          {DIRECTION_NOTES.map((d, i) => (
            <Link
              key={d.slug}
              href={`/design/${d.slug}`}
              className="group rounded-xl border border-[#232330] bg-[#131318] p-6 transition-colors hover:border-[#3d3d50] hover:bg-[#17171e]"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-[#5c5c6c]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="text-xl font-semibold tracking-tight">{d.name}</h2>
                <span className="ml-auto font-mono text-xs text-[#5c5c6c] group-hover:text-[#9a9aa8]">
                  open →
                </span>
              </div>
              <p className="mt-2 text-[15px] text-[#c4c4d0]">{d.line}</p>
              <p className="mt-3 text-sm leading-relaxed text-[#8a8a98]">{d.what}</p>
              <p className="mt-2 text-sm leading-relaxed text-[#6e6e7e]">
                <span className="text-[#8a8a98]">What it costs:</span> {d.cost}
              </p>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-sm leading-relaxed text-[#6e6e7e]">
          These render outside the app shell and outside the login gate, so they can each own
          their own navigation model. The current panel is still at{" "}
          <Link href="/dashboard" className="underline underline-offset-4 hover:text-[#c4c4d0]">
            /dashboard
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
